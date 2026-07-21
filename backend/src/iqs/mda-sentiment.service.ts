import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { SentimentService } from './sentiment.service';

/**
 * IQ Score v2 — Component 3: MD&A / Company-Communications Sentiment (10%).
 *
 * AI-assessed tone of a company's OWN communications. We combine two free
 * signals with Claude:
 *   1. MD&A from the latest 10-K/10-Q (SEC EDGAR full-text, Item 7 / Item 2).
 *   2. Recent news/PR tone (reused SentimentService — Yahoo headlines + Claude).
 *
 * (Earnings-call transcripts and PR-wire APIs from the spec require paid feeds
 * we don't have; the news signal stands in for the "communications" leg. The
 * blend weights degrade over whichever signals are present.)
 *
 * Output is a 0–100 score (50 = neutral) stored on company.mdaSentiment by a
 * batch job — never computed inside the per-company scoring loop.
 */

const MDA_TOOL: Anthropic.Messages.Tool = {
  name: 'report_mda_sentiment',
  description:
    "Report the forward-looking tone of management's discussion. Score management's outlook, NOT the stock price.",
  input_schema: {
    type: 'object',
    properties: {
      sentiment: {
        type: 'number',
        description:
          '-1.0 (strongly bearish: going concern, covenant breach, guidance cut, restructuring) to 1.0 (strongly bullish: raised guidance, new contracts, margin expansion, buybacks). 0 = neutral.',
      },
      confidence: { type: 'number', description: '0.0–1.0 confidence in the read.' },
      key_drivers: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array', items: { type: 'string' } },
    },
    required: ['sentiment', 'confidence'],
  },
};

@Injectable()
export class MdaSentimentService {
  private readonly logger = new Logger(MdaSentimentService.name);
  private readonly http: AxiosInstance;
  private anthropic: Anthropic | null | undefined;

  constructor(private readonly sentiment: SentimentService) {
    this.http = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          process.env.SEC_USER_AGENT || 'IQS Dashboard contact@iqs.local',
        'Accept-Encoding': 'gzip, deflate',
      },
    });
  }

  private client(): Anthropic | null {
    if (this.anthropic !== undefined) return this.anthropic;
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    if (!this.anthropic) this.logger.warn('ANTHROPIC_API_KEY not set — MD&A NLP disabled');
    return this.anthropic;
  }

  /** Compute the 0–100 MD&A/communications score for one company. Combines the
   *  latest-filing MD&A tone with recent news tone; returns null only when
   *  neither signal is available. */
  async computeForCompany(
    cik: string | null,
    ticker: string | null,
    name?: string | null,
  ): Promise<{ score: number | null; docsAnalyzed: number }> {
    let docsAnalyzed = 0;

    // 1. News/PR tone (0–100), mapped to [-1,1] for blending.
    let newsUnit: number | null = null;
    if (ticker) {
      const s = await this.sentiment.getSentimentScore(ticker, name).catch(() => null);
      if (s?.score != null) {
        newsUnit = (s.score / 100) * 2 - 1;
        docsAnalyzed += 1;
      }
    }

    // 2. MD&A filing tone (-1..1) × confidence.
    let mdaScore: number | null = null;
    if (cik) {
      try {
        const text = await this.fetchLatestMdaText(cik);
        if (text) {
          const c = this.client();
          if (c) {
            const res = await c.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 400,
              tools: [MDA_TOOL],
              tool_choice: { type: 'tool', name: 'report_mda_sentiment' },
              messages: [
                {
                  role: 'user',
                  content:
                    "Assess the forward outlook in this MD&A excerpt. Treat going concern, covenant breaches, guidance cuts and restructuring as strongly bearish; raised guidance, new contracts, margin expansion and buybacks as bullish. Ignore promotional adjectives without substance.\n\n" +
                    text.slice(0, 14000),
                },
              ],
            });
            const tool = res.content.find(
              (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
            );
            const input = (tool?.input ?? {}) as { sentiment?: number; confidence?: number };
            const sent = Number(input.sentiment);
            const conf = Number(input.confidence);
            if (Number.isFinite(sent)) {
              mdaScore = clamp(sent, -1, 1) * (Number.isFinite(conf) ? clamp(conf, 0, 1) : 1);
              docsAnalyzed += 1;
            }
          }
        }
      } catch (e: any) {
        this.logger.debug?.(`MD&A fetch/classify failed for CIK ${cik}: ${e?.message || e}`);
      }
    }

    // Blend (spec §4 weights, renormalized over present signals): MD&A filing
    // is the primary; news carries the PR/communications leg.
    const parts: Array<[number, number | null]> = [
      [0.6, mdaScore], // filing MD&A
      [0.4, newsUnit], // news / communications
    ];
    const present = parts.filter(([, v]) => v != null);
    const w = present.reduce((a, [pw]) => a + pw, 0);
    if (w <= 0) return { score: null, docsAnalyzed };
    const raw = present.reduce((a, [pw, v]) => a + (v as number) * (pw / w), 0);
    const score = Math.round(((raw + 1) / 2) * 100); // [-1,1] → [0,100]
    return { score: Math.max(0, Math.min(100, score)), docsAnalyzed };
  }

  /** Pull the MD&A text (Item 7 for 10-K, Item 2 for 10-Q) from the company's
   *  most recent annual/quarterly filing on EDGAR. Best-effort; null on miss. */
  private async fetchLatestMdaText(cik: string): Promise<string | null> {
    const padded = cik.padStart(10, '0');
    const { data: sub } = await this.http.get(
      `https://data.sec.gov/submissions/CIK${padded}.json`,
    );
    const recent = sub?.filings?.recent;
    if (!recent) return null;
    const forms: string[] = recent.form || [];
    const accns: string[] = recent.accessionNumber || [];
    const docs: string[] = recent.primaryDocument || [];
    let idx = -1;
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === '10-K' || forms[i] === '10-Q') {
        idx = i;
        break;
      }
    }
    if (idx === -1) return null;
    const accNo = accns[idx]?.replace(/-/g, '');
    const doc = docs[idx];
    if (!accNo || !doc) return null;
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accNo}/${doc}`;
    const { data: html } = await this.http.get(url, { responseType: 'text' });
    return extractMda(String(html), forms[idx]);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Strip a filing's HTML to text and isolate the MD&A section by item headers.
 *  10-K: Item 7 → Item 7A/8. 10-Q: Item 2 → Item 3/4. Falls back to a middle
 *  slice of the document if headers aren't found. */
function extractMda(html: string, form: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 500) return null;

  const start = /item\s*7\.?\s*management.s discussion/i;
  const end = /item\s*7a\.?|item\s*8\.?\s*financial statements/i;
  const startQ = /item\s*2\.?\s*management.s discussion/i;
  const endQ = /item\s*3\.?\s*quantitative|item\s*4\.?\s*controls/i;

  const s = form === '10-Q' ? startQ : start;
  const e = form === '10-Q' ? endQ : end;
  const sm = text.match(s);
  if (sm && sm.index != null) {
    const from = sm.index;
    const rest = text.slice(from + 40);
    const em = rest.match(e);
    const to = em && em.index != null ? from + 40 + em.index : from + 18000;
    const section = text.slice(from, to).trim();
    if (section.length > 800) return section;
  }
  // Header not found — use a representative middle slice.
  const mid = Math.floor(text.length * 0.35);
  return text.slice(mid, mid + 14000);
}
