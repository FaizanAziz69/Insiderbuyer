import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { NO_DASH_RULE, stripDashes } from '../../common/house-style';
import { BuyCandidate } from './research.service';
import { looksInstitutional } from './person-photos';

/**
 * The desk's writer.
 *
 * Every rule below was read off the 26 editorials and stock ideas already
 * published, not invented: the shapes, the lengths, the closing lines and the
 * viz placements are what the site already does, so a generated piece sits in
 * the feed without announcing itself.
 *
 * The model NEVER supplies a number. Figures arrive from research.service,
 * already reconciled, and the prompt says so in as many words. A daily article
 * nobody reads before publication can only be trusted if its facts came from
 * our own tables.
 */

export type DeskKind = 'editorial' | 'ceo-buying' | 'cluster-buy' | 'stock-idea';

/** House money wording: $212.4 million, $4.30 million, $874,620. */
export function money(v: number): string {
  const n = Math.abs(v);
  if (n >= 1e9) return `$${(v / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `$${(v / 1e6).toFixed(n >= 1e8 ? 1 : 2)} million`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export interface WrittenArticle {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  category: string;
  /** What the cover should show behind the subject, in plain words. */
  coverScene: string;
  /** The one colour the cover background is graded in. */
  coverGrade: string;
}

/** House facts the model must not restate in its own words. */
const HOUSE_RULES = `
${NO_DASH_RULE}

DATES: always "September 18th, 2026" form. Month, day with ordinal, year. Never "18 September" and never a bare "September 18".

NUMBERS: use ONLY the figures supplied in the FACTS block. Do not calculate new ones, do not round differently, do not add a number you were not given. If a figure is not in FACTS, write around it.

MONEY: where FACTS gives a "Display" string (dollarsBoughtDisplay and the like), use THAT wording in prose and especially in the headline. A headline reading "$212,395,151" is wrong; the house writes "$212.4 million". Exact share counts keep their separators.

NEVER PRINT: the Insider Score as a number (it is paywalled), a price target, a recommendation, or any claim about why someone bought beyond what the filing shows.

VOICE: plain declarative sentences. Short paragraphs, two to four sentences. No hype, no "savvy investors", no rhetorical questions. State what happened, then what it is worth knowing against.

HTML: <p> paragraphs only, plus the viz divs you are told to place. No <h1>, no markdown, no inline styles.
`.trim();

const SHAPES: Record<DeskKind, string> = {
  editorial: `
SHAPE (top story, 600 to 850 words):
<h3>Key points</h3> followed by <ul> with 3 or 4 <li>, each opening with a <strong> sentence.
Then 2 short opening paragraphs that deliver the headline's figure.
Then 3 or 4 <h3> sections with plain titles ("What the filing shows", "What the insiders did", "What that leaves").
Place <div data-viz="pull-quote">one striking sentence, no quotation marks</div> after the first section.
Place <div data-viz="price-chart" data-ticker="TICKER" data-range="1y"></div> in the price section.
Close with a sources sentence naming SEC Form 4 filings via EDGAR reviewed by InsiderBuying.com and the date range, then <p><em>Informational only, not investment advice.</em></p>`,
  'ceo-buying': `
SHAPE (400 to 600 words, no Key points box):
Open with the news in one sentence. Then the detail of the purchase.
Place <div data-viz="pull-quote">one striking sentence</div> after the second paragraph.
Place <div data-viz="insider-timeline" data-ticker="TICKER" data-months="3" data-rows="10"></div> mid-article.
Then: the position behind the filing, who the buyer is, what the other insiders did, the price context.
Close with the sources sentence and a final <p> linking /companies/TICKER.`,
  'cluster-buy': `
SHAPE (400 to 600 words, no Key points box):
Open with how many different insiders bought and what they spent together.
Place <div data-viz="pull-quote">one striking sentence</div> after the second paragraph.
Place <div data-viz="insider-timeline" data-ticker="TICKER" data-months="3" data-rows="10"></div> mid-article.
Then: who they are by role, the dates, the price range, what the stock has done.
Close with the sources sentence and a final <p> linking /companies/TICKER.`,
  'stock-idea': `
SHAPE (300 to 450 words, no Key points box):
Open with the buyer and the figure in one sentence.
Place <div data-viz="pull-quote">one striking sentence</div> after the second paragraph.
Place <div data-viz="insider-timeline" data-ticker="TICKER" data-months="3" data-rows="10"></div> mid-article.
Then: the position size, the other side of the ledger, the price context.
Close with the sources sentence, then:
<p>Track every Form 4 filed at COMPANY (TICKER) &rarr; <a href="/companies/TICKER">insiderbuying.com/companies/TICKER</a></p>`,
};

@Injectable()
export class WriterService {
  private readonly logger = new Logger(WriterService.name);
  private client: Anthropic | null = null;

  private model = process.env.DESK_WRITER_MODEL || 'claude-opus-5';

  isReady(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private anthropic(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY as string });
    }
    return this.client;
  }

  async write(kind: DeskKind, c: BuyCandidate, extra: Record<string, unknown> = {}): Promise<WrittenArticle | null> {
    if (!this.isReady()) {
      this.logger.warn('ANTHROPIC_API_KEY missing, desk cannot write');
      return null;
    }
    const institutional = looksInstitutional(c.who);
    const raw: Record<string, unknown> = {
      ticker: c.ticker,
      company: c.company,
      sector: c.sector,
      buyer: c.who,
      buyerIsInstitution: institutional,
      role: c.role,
      transactionDate: c.date,
      dollarsBought: Math.round(c.value),
      dollarsBoughtDisplay: money(c.value),
      shares: c.shares == null ? null : Math.round(c.shares),
      distinctBuyers: c.buyers ?? null,
      ...c.facts,
      ...extra,
    };
    // A zero or null fact is worse than a missing one: the model will dutifully
    // write "a market capitalisation of $0" if we hand it one. Lennar arrived
    // with marketCap 0 on the first test run and the draft said exactly that.
    const facts = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== 0),
    );

    const prompt = [
      'You are the InsiderBuying.com desk writer. Write one article for the site.',
      '',
      'FACTS (the ONLY figures you may use, already reconciled from our own tables):',
      JSON.stringify(facts, null, 1),
      '',
      institutional
        ? 'The buyer is an entity, not a person. Write "the firm" or the entity name, never "he" or "she".'
        : 'The buyer is a person. Use their name and role as given.',
      '',
      HOUSE_RULES,
      '',
      SHAPES[kind].trim(),
      '',
      'Return STRICT JSON with keys: title, summary, body, tags, category, coverScene, coverGrade.',
      '  title: a specific headline carrying the concrete figure. No colon-subtitle.',
      '  summary: one or two sentences, the dek under the headline.',
      '  tags: 3 to 6 short strings (ticker, person, theme).',
      '  category: exactly one of "MARKET MOVER", "INSIDER ALERT", "BREAKING".',
      '  coverScene: what a photo collage behind the subject should show for THIS story,',
      '    in plain words, naming real places, buildings, products or equipment. Never',
      '    documents, forms, filings, newspapers or screens of text. One sentence.',
      '  coverGrade: one colour phrase for the whole background, e.g. "deep teal with gold highlights".',
      '',
      'Output JSON only. No prose before or after.',
    ].join('\n');

    try {
      const res = await this.anthropic().messages.create({
        model: this.model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = res.content
        .map((b: any) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const parsed = JSON.parse(json) as WrittenArticle;
      if (!parsed.title || !parsed.body) throw new Error('missing title or body');

      // The no-dash rule is enforced after the fact as well as asked for: the
      // model obeys it most of the time, and "most" is not a house style.
      parsed.title = stripDashes(parsed.title);
      parsed.summary = stripDashes(parsed.summary || '');
      parsed.body = stripDashes(parsed.body);
      return parsed;
    } catch (e: any) {
      this.logger.error(`writer failed for ${c.ticker}: ${e?.message || e}`);
      return null;
    }
  }
}
