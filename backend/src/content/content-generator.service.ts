import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IqsService } from '../iqs/iqs.service';

export interface GeneratedArticle {
  title: string;
  eyebrow: string;
  summary: string;
  body: string; // HTML
  imagePrompt: string;
  tags: string[];
}

export interface RankingLite {
  ticker: string;
  name: string;
  sector?: string | null;
  iqs: number;
  marketCap?: number | null;
  totalPurchaseValue?: number | null;
  distinctBuyers?: number | null;
}

const ARTICLE_TOOL: Anthropic.Messages.Tool = {
  name: 'publish_article',
  description:
    'Publish a structured insider-buying intelligence article. The body must be safe HTML with only <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, <a> tags. No <script>, <iframe>, or inline event handlers.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description:
          'SEO headline — clear, specific, 8-14 words. No clickbait. Mentions tickers / sectors when relevant.',
      },
      eyebrow: {
        type: 'string',
        description:
          'Short label rendered above the headline (e.g. "DAILY BRIEFING", "TICKER FOCUS", "SECTOR ROUNDUP", "TOP INSIDER SCORE PICKS"). Uppercase, 1-4 words.',
      },
      summary: {
        type: 'string',
        description:
          'One sentence (max 28 words) summarising the article. Used as the meta description.',
      },
      body: {
        type: 'string',
        description:
          'Article body in HTML. 350-600 words. Use 4-7 <p> paragraphs and 1-2 <h2> sub-headings. Cite our Insider Score feed and Form 4 filings. Use cautious finance phrasing ("may suggest", "historically associated with", "investors may want to monitor"). NEVER write "buy", "guaranteed", "will go up", "recommend buying". End with a 1-sentence closer that points to monitoring on the InsiderBuying site.',
      },
      imagePrompt: {
        type: 'string',
        description:
          'A 15-30 word PHOTO-REALISTIC scene brief for a finance magazine cover. ALWAYS include a stock/investing/Wall-Street element AND a concrete object that hints at the company\'s actual business (semiconductor wafer for chip stocks, oil rig for energy, jet engine for aerospace, lab vial for biotech, retail flagship store for consumer, bank trading desk for finance, etc.). NO TEXT, NO LOGOS, NO BRAND NAMES — only objects and scenes. Examples: "Cinematic photo of a semiconductor wafer being inspected under blue laboratory light beside an upward-trending bar-chart hologram." / "Wall Street trading desk at twilight with multiple Bloomberg-style screens glowing and a rising candlestick chart reflected in the glass." / "Aerial drone shot of an offshore oil rig at golden hour with rising bar-graph silhouettes formed by light beams." Keep it photographic, premium, and Wall-Street editorial — never cartoon or illustration.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          '3-6 SEO tags. Mix ticker symbols (e.g. "NVDA"), sectors ("technology"), and themes ("cluster-buying", "ceo-purchase", "small-cap").',
      },
    },
    required: ['title', 'eyebrow', 'summary', 'body', 'imagePrompt', 'tags'],
  },
};

const STYLE_BASE = `You are the senior editor of **InsiderBuying.com**, a finance publication that surfaces Form 4 insider-buying intelligence using a proprietary Insider Score.

Voice: Bloomberg + MarketBeat — confident, specific, data-led, never breathless. Plain English. Active voice.

CRITICAL — never give explicit financial advice:
- ❌ "buy this stock", "this stock will go up", "guaranteed", "we recommend"
- ✅ "may suggest", "could indicate", "historically associated with", "investors may want to monitor"

Always:
- Refer to tickers in **bold** the first time they appear: <strong>NVDA</strong>.
- Cite our Insider Score feed when quoting a score: "per our Insider Score feed".
- Reference Form 4 / SEC filings when discussing transactions.
- Keep paragraphs short (2-4 sentences).
- End with a soft CTA pointing the reader to the ticker page or the Insider Score rankings page.

You MUST call the publish_article tool to return the article. Do not respond with prose outside the tool call.`;

@Injectable()
export class ContentGeneratorService {
  private readonly logger = new Logger(ContentGeneratorService.name);
  private readonly client: Anthropic | null;

  constructor(private readonly iqs: IqsService) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — content generator is disabled.',
      );
    }
  }

  isReady(): boolean {
    return !!this.client;
  }

  async generateDailySummary(top: RankingLite[], dateLabel: string): Promise<GeneratedArticle> {
    const lines = top
      .slice(0, 8)
      .map(
        (r, i) =>
          `${i + 1}. ${r.ticker} — ${r.name} (${r.sector || 'n/a'}) — Insider Score ${r.iqs.toFixed(2)}` +
          (r.distinctBuyers ? `, ${r.distinctBuyers} distinct buyers` : '') +
          (r.totalPurchaseValue ? `, $${Math.round(r.totalPurchaseValue).toLocaleString()} purchased` : ''),
      )
      .join('\n');
    const prompt = `Write today's **Daily Insider Briefing** for ${dateLabel}.

Here is the Insider Score leaderboard as of close, ranked by Insider Score:

${lines}

Synthesise the day in 4-6 paragraphs:
- Lead with what stood out (highest Insider Score name + why).
- Cover 2-3 specific names with role/transaction colour where relevant.
- Identify any sector tilt visible in the top 8.
- Close with what to monitor tomorrow / the rest of the week.

eyebrow: "DAILY BRIEFING"`;
    return this.callTool(prompt);
  }

  async generateTopIqsArticle(top: RankingLite[]): Promise<GeneratedArticle> {
    const lines = top
      .slice(0, 5)
      .map(
        (r, i) =>
          `${i + 1}. ${r.ticker} — ${r.name} — Sector: ${r.sector || 'n/a'} — Insider Score ${r.iqs.toFixed(2)}` +
          (r.totalPurchaseValue ? `, total purchased $${Math.round(r.totalPurchaseValue).toLocaleString()}` : ''),
      )
      .join('\n');
    const prompt = `Write a ranked **Top 5 Insider Score Picks** article highlighting the names with the strongest insider conviction right now.

Source data (already sorted by Insider Score, highest first):

${lines}

Format:
- Strong intro paragraph framing what high Insider Score means for the reader.
- One <h2> per ticker (e.g. "1. NVDA — Sector Leader Sees Cluster Buying"), each followed by 2-3 sentences citing the data.
- Closing paragraph pointing to the live Insider Score rankings page on InsiderBuying.com.

eyebrow: "TOP INSIDER SCORE PICKS"`;
    return this.callTool(prompt);
  }

  async generateTickerDeepDive(row: RankingLite): Promise<GeneratedArticle> {
    let detail: Awaited<ReturnType<IqsService['getCompanyDetail']>> = null;
    try {
      detail = await this.iqs.getCompanyDetail(row.ticker);
    } catch (err) {
      this.logger.warn(`getCompanyDetail(${row.ticker}) failed: ${(err as Error).message}`);
    }
    const txLines = (detail?.transactions || [])
      .slice(0, 5)
      .map(
        (t: any) =>
          `- ${t.transactionDate}: ${t.insiderName} (${t.insiderTitle || 'insider'}) ${t.transactionCode || 'P'} ${Number(t.sharesBought).toLocaleString()} shares @ $${Number(t.pricePerShare).toFixed(2)} = $${Number(t.totalValue).toLocaleString()}`,
      )
      .join('\n') || '- (no recent Form 4 transactions on file)';

    const prompt = `Write a **ticker-focused deep dive** on ${row.ticker} (${row.name}) for an insider-buying audience.

Snapshot:
- Sector: ${row.sector || 'n/a'}
- Insider Score: ${row.iqs.toFixed(2)} (per our Insider Score feed)
- Market cap: ${row.marketCap ? `$${Math.round(row.marketCap).toLocaleString()}` : 'n/a'}
- Distinct insider buyers: ${row.distinctBuyers ?? 'n/a'}
- Total purchase value: ${row.totalPurchaseValue ? `$${Math.round(row.totalPurchaseValue).toLocaleString()}` : 'n/a'}

Recent Form 4 transactions:
${txLines}

Structure:
- Lead with what the recent Form 4 activity says, not the company's headline business.
- <h2> Insider activity snapshot — interpret the role/cluster pattern.
- <h2> What it may suggest — historical context with cautious phrasing.
- Close with where to monitor the activity on InsiderBuying.

eyebrow: "TICKER FOCUS"`;
    return this.callTool(prompt);
  }

  async generateStockIdea(row: RankingLite): Promise<GeneratedArticle> {
    const prompt = `Write a short **Stock Idea card** for the home page on **${row.ticker}** (${row.name}).

Snapshot:
- Sector: ${row.sector || 'n/a'}
- Insider Score: ${row.iqs.toFixed(2)} (per our Insider Score feed)
- Market cap: ${row.marketCap ? `$${Math.round(row.marketCap).toLocaleString()}` : 'n/a'}
- Distinct insider buyers: ${row.distinctBuyers ?? 'n/a'}
- Total insider purchase value: ${row.totalPurchaseValue ? `$${Math.round(row.totalPurchaseValue).toLocaleString()}` : 'n/a'}

Format — SHORT and PUNCHY:
- title: a curiosity headline that frames the insider angle (e.g. "Why ${row.ticker} Insiders Are Quietly Buying"), 6-12 words.
- summary: 1-2 sentences (max 32 words) — what's the insider pattern + why it might matter.
- body: 2-3 short paragraphs (180-260 words total). Open with the insider hook, give one specific data point, close with what to monitor next. No <h2> needed.
- eyebrow: "STOCK IDEA"
- imagePrompt: a visual concept matching the sector (no text/numbers in the image).
- tags: include the ticker and sector slug.

Use cautious language ("may suggest", "could indicate") — never "buy" or "recommend".`;
    return this.callTool(prompt);
  }

  async generateSectorRoundup(
    sector: string,
    top: RankingLite[],
  ): Promise<GeneratedArticle> {
    const lines = top
      .slice(0, 6)
      .map(
        (r, i) =>
          `${i + 1}. ${r.ticker} — ${r.name} — Insider Score ${r.iqs.toFixed(2)}` +
          (r.distinctBuyers ? `, ${r.distinctBuyers} buyers` : ''),
      )
      .join('\n');
    const prompt = `Write a sector roundup on **insider buying in the ${sector} sector**.

Top names in ${sector} by Insider Score right now:

${lines}

Structure:
- Open with the broad sector picture — is this cluster buying, single-name conviction, or sector-wide pickup?
- Highlight 2-3 names with role/transaction colour.
- Discuss what the pattern may suggest for the sector.
- Close with a CTA to filter our Insider Score rankings by ${sector}.

eyebrow: "SECTOR ROUNDUP"`;
    return this.callTool(prompt);
  }

  async generateWeeklyReport(
    top: RankingLite[],
    stats: { totalBuys: number; totalValue: number; weekLabel: string },
  ): Promise<GeneratedArticle> {
    const lines = top
      .slice(0, 8)
      .map(
        (r, i) =>
          `${i + 1}. ${r.ticker} — ${r.name} (${r.sector || 'n/a'}) — Insider Score ${r.iqs.toFixed(2)}` +
          (r.distinctBuyers ? `, ${r.distinctBuyers} buyers` : ''),
      )
      .join('\n');
    const prompt = `Write the **Weekly Insider Activity Report** for the week of ${stats.weekLabel}.
.
Week totals from our SEC Form 4 feed:
- Open-market insider buys logged: ${stats.totalBuys}
- Total dollar value purchased: $${Math.round(stats.totalValue).toLocaleString()}

Highest Insider Score names this week:

${lines}

Structure (5-7 paragraphs):
- Open with the week in one line — was insider buying heavier or lighter than usual?
- <h2> The week's standout signals — 2-3 names with role/cluster colour.
- <h2> Sector tilt — where the buying concentrated.
- Close with what to monitor next week and a CTA to the Insider Score rankings page.

eyebrow: "WEEKLY REPORT"`;
    return this.callTool(prompt);
  }

  async generateClusterBuyArticle(row: RankingLite): Promise<GeneratedArticle> {
    const prompt = `Write a **Cluster Buying Alert** article on **${row.ticker}** (${row.name}).

Snapshot:
- Sector: ${row.sector || 'n/a'}
- Insider Score: ${row.iqs.toFixed(2)} (per our Insider Score feed)
- Distinct insider buyers in the window: ${row.distinctBuyers ?? 'n/a'}
- Total insider purchase value: ${row.totalPurchaseValue ? `$${Math.round(row.totalPurchaseValue).toLocaleString()}` : 'n/a'}

Angle: multiple insiders buying the same stock within a short window is one of
the historically strongest insider signals — explain why (shared information
advantage, independent conviction), then ground it in this company's numbers.

Structure:
- Lead with the cluster fact (how many buyers, how much).
- <h2> Why cluster buying matters — the research-backed context, cautiously phrased.
- <h2> What it may suggest for ${row.ticker} — tie to the Insider Score components.
- Close with a CTA to the ${row.ticker} page on InsiderBuying.

eyebrow: "CLUSTER BUYING"`;
    return this.callTool(prompt);
  }

  async generateCeoBuyingArticle(
    buys: Array<{
      ticker: string | null;
      companyName: string;
      insiderName: string;
      totalValue: number;
      transactionDate: string | Date;
    }>,
  ): Promise<GeneratedArticle> {
    const lines = buys
      .slice(0, 6)
      .map(
        (b, i) =>
          `${i + 1}. ${b.ticker || 'n/a'} — ${b.companyName} — ${b.insiderName} bought $${Math.round(b.totalValue).toLocaleString()} on ${String(b.transactionDate).slice(0, 10)}`,
      )
      .join('\n');
    const prompt = `Write a **CEO Buying Tracker** roundup covering chief executives who bought their own company's stock on the open market recently.

Recent CEO open-market purchases from our Form 4 feed:

${lines}

Angle: a CEO putting personal capital into their own stock is the single
highest-signal insider role in our Insider Score model (Insider Weight 100/100).

Structure:
- Lead with the biggest CEO purchase and what it may suggest.
- <h2> per notable purchase (2-3), each with 2-3 sentences of context.
- <h2> How to read CEO buying — cautious historical framing.
- Close with a CTA to the live CEO buying feed on InsiderBuying.

eyebrow: "CEO BUYING"`;
    return this.callTool(prompt);
  }

  async generateTopicRoundup(opts: {
    label: string;
    angle: string;
    dateLabel: string;
    headlines: Array<{ title: string; source: string }>;
    stocks: Array<{ ticker: string; name: string; changePct?: number | null; iqs?: number | null }>;
  }): Promise<GeneratedArticle> {
    const headlineLines = opts.headlines.length
      ? opts.headlines
          .slice(0, 8)
          .map((h, i) => `${i + 1}. "${h.title}" — ${h.source}`)
          .join('\n')
      : '(no fresh wire headlines on file today — lead with the market data below)';
    const stockLines = opts.stocks
      .slice(0, 8)
      .map(
        (s) =>
          `- ${s.ticker} (${s.name})` +
          (typeof s.changePct === 'number' ? `, ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}% today` : '') +
          (typeof s.iqs === 'number' && s.iqs > 0 ? `, Insider Score ${s.iqs.toFixed(1)}/100` : ''),
      )
      .join('\n');

    const prompt = `Write today's **${opts.label} news roundup** for ${opts.dateLabel}, covering ${opts.angle}.

Fresh source headlines from our news feeds:
${headlineLines}

Key tickers in this theme with live market data (from our quote + Insider Score feeds):
${stockLines}

Write a clean, SEO-friendly news roundup (350-550 words):
- Open with the single most important development in ${opts.label} right now.
- Synthesise the source headlines above into 2-3 short paragraphs — attribute to "reports" / "filings" rather than naming outlets.
- Weave in 2-3 of the tickers above with their live move and, where shown, their insider-buying Insider Score ("per our Insider Score feed").
- Use ONE <h2> sub-heading.
- Cautious, non-advisory language throughout ("may suggest", "could indicate", "investors may want to monitor"). Never "buy", "guaranteed", "will go up", "we recommend".
- Close by pointing readers to monitor the theme on InsiderBuying.

eyebrow: "${opts.label.toUpperCase()}"`;
    return this.callTool(prompt);
  }

  async generateTopicStockArticle(opts: {
    topicLabel: string;
    ticker: string;
    name: string;
    changePct?: number | null;
    iqs?: number | null;
    headlines: Array<{ title: string; source: string }>;
  }): Promise<GeneratedArticle> {
    const move =
      typeof opts.changePct === "number"
        ? `${opts.changePct >= 0 ? "up" : "down"} ${Math.abs(opts.changePct).toFixed(2)}% in the latest session`
        : "trading in line with the group";
    const iqsLine =
      typeof opts.iqs === "number" && opts.iqs > 0
        ? `Its Insider Score is ${opts.iqs.toFixed(1)}/100 (per our Insider Score feed).`
        : "";
    const headlineLines = opts.headlines.length
      ? opts.headlines.slice(0, 4).map((h, i) => `${i + 1}. "${h.title}" — ${h.source}`).join("\n")
      : "(no fresh wire headlines today — lead with the company's role in the theme)";

    const prompt = `Write a focused **${opts.topicLabel} stock article** on **${opts.ticker}** (${opts.name}).

Live snapshot: ${opts.ticker} is ${move}. ${iqsLine}

Relevant ${opts.topicLabel} headlines from our feeds:
${headlineLines}

Write a clean, SEO-friendly news article (300-480 words):
- Open with what is happening with ${opts.ticker} and why it matters in ${opts.topicLabel} right now.
- Use ONE <h2> sub-heading.
- Reference the live move and, where shown, the Insider Score.
- Cautious, non-advisory language ("may suggest", "could indicate", "investors may want to monitor"). Never "buy", "guaranteed", "will go up", "we recommend".
- Close by pointing readers to monitor ${opts.ticker} on InsiderBuying.

title: a specific, news-style headline that names the company.
eyebrow: "${opts.topicLabel.toUpperCase()}"
tags: include "${opts.ticker}" and the topic.`;
    return this.callTool(prompt);
  }

  /**
   * Short, on-demand "movement explainer" for a single ticker — a factual,
   * cautious 2-4 sentence explanation of why a stock is moving, grounded in
   * recent headlines when available. Plain text (no article tool).
   */
  async generateMovementExplainer(opts: {
    symbol: string;
    name: string;
    changePct: number;
    headlines: string[];
  }): Promise<{ title: string; explainer: string }> {
    const dir = opts.changePct >= 0 ? 'up' : 'down';
    const pct = Math.abs(opts.changePct).toFixed(2);
    if (!this.client) {
      return {
        title: `Why ${opts.symbol} is ${dir} ${pct}% today`,
        explainer: 'AI explainer is not configured.',
      };
    }
    const news = opts.headlines.length
      ? `Recent headlines mentioning the company:\n- ${opts.headlines.slice(0, 6).join('\n- ')}`
      : 'No recent company-specific headlines are available.';
    const prompt = `In 2-4 sentences, explain why ${opts.name || opts.symbol} (${opts.symbol}) stock is ${dir} ${pct}% today, written for a retail investor.
- Be specific and factual; use the headlines below if they explain the move.
- If there is no clear company-specific catalyst, say the move appears driven by broader market/sector rotation, momentum, or unusual volume.
- Use cautious, non-advisory language. Never give buy/sell advice.

${news}`;
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 320,
        system:
          'You are a concise, factual financial-news analyst. You explain why a stock is moving in plain language, cautiously, with no investment advice.',
        messages: [{ role: 'user', content: prompt }],
      });
      const explainer = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();
      return {
        title: `Why ${opts.symbol} is ${dir} ${pct}% today`,
        explainer: explainer || 'No explanation available right now.',
      };
    } catch (err: any) {
      this.logger.warn(
        `Movement explainer failed for ${opts.symbol}: ${err?.message || err}`,
      );
      return { title: `Why ${opts.symbol} is ${dir} ${pct}% today`, explainer: '' };
    }
  }

  private async callTool(userPrompt: string): Promise<GeneratedArticle> {
    if (!this.client) {
      throw new Error('Content generator not configured — ANTHROPIC_API_KEY missing.');
    }
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: STYLE_BASE,
      tools: [ARTICLE_TOOL],
      tool_choice: { type: 'tool', name: 'publish_article' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error('Model did not call publish_article tool');
    }
    const input = toolUse.input as GeneratedArticle;
    if (!input.title || !input.body) {
      throw new Error('Generated article missing required fields');
    }
    // Defensive defaults — the schema marks fields required, but the model
    // occasionally omits one; never let a missing optional kill the batch.
    return {
      title: input.title.trim(),
      eyebrow: (input.eyebrow || 'INSIDER BUYING').toUpperCase().trim(),
      summary: (input.summary || input.title).trim(),
      body: sanitiseBody(input.body),
      imagePrompt: (
        input.imagePrompt ||
        'Cinematic photo of a Wall Street trading desk at dusk with glowing market charts reflected in the window glass'
      ).trim(),
      tags: Array.isArray(input.tags)
        ? input.tags.filter((t) => typeof t === 'string').map((t) => t.toLowerCase().trim())
        : [],
    };
  }
}

/** Strip dangerous tags / attributes — defence in depth even though the prompt
 *  forbids script / iframe. */
function sanitiseBody(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
