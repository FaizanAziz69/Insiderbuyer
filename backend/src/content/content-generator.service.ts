import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IqsService } from '../iqs/iqs.service';
import { ContentFormat } from './content-formats';

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
    'Publish a structured insider-buying intelligence article that follows the InsiderBuyer standard structure. The body is safe HTML using <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, <a>, and data tables (<table>, <thead>, <tbody>, <tr>, <th>, <td>, <caption>). No <script>, <iframe>, <style>, or inline event handlers.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description:
          'The HEADLINE. Lead with the tension or the number, NOT the ticker. Must contain ≥1 specific element (dollar figure, name, count, %, or timeframe), open a loop (state the surprising fact, never the "why"), stay ≤70 characters where possible, and use no hype/promise words. Example: "A Director Just Spent $2.1M on a Stock Down 60%".',
      },
      eyebrow: {
        type: 'string',
        description:
          'Short label rendered above the headline (e.g. "DAILY BRIEFING", "TICKER FOCUS", "SECTOR ROUNDUP", "TOP INSIDER SCORE PICKS", "THE CONVICTION BET", "THE CONTRARIANS"). Uppercase, 1-4 words.',
      },
      summary: {
        type: 'string',
        description:
          'The PREVIEW/DEK: ≤10 words that open the loop (do NOT resolve it). Used as the card teaser and meta description.',
      },
      body: {
        type: 'string',
        description:
          'Article body in HTML following the InsiderBuyer standard structure IN ORDER: (1) a Key Points box — <h3>Key points</h3> then a <ul> of 2-3 specific complete claims (numbers, names, dates); (2) a hook intro of ≤50 words that states the surprising fact FIRST; (3) 3-5 <h2> claim sections of 150-300 words each, EACH with a visual anchor — a data <table> (insider-trade table / mini stock profile / ratings) or a tight <ul> where each item is data point → context → why it matters; (4) a brief <h2>The Bottom Line</h2> CTA closer pointing to Top Buys, the ticker page, or the Insider Score rankings; (5) END with EXACTLY, verbatim: <p><em>Not investment advice. Summarized from public SEC Form 4 and congressional disclosure data.</em></p>. Cite our Insider Score feed and Form 4 filings. Use cautious phrasing ("may suggest", "historically associated with", "investors may want to monitor"); NEVER "buy", "guaranteed", "will go up", "recommend". Never invent numbers — use only the data provided.',
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

const STYLE_BASE = `You are the content engine for **InsiderBuying.com** — you turn raw SEC Form 4 and congressional trading data into finished articles that follow the InsiderBuyer style guide EXACTLY. Never start from a blank page: every article starts from a signal in the data.

VOICE: Bloomberg + MarketBeat — confident, specific, data-led, never breathless. Plain English, active voice, short paragraphs (2-3 sentences).

PIPELINE (always): data → trigger → angle → headline → structure.
- Trigger = the single strongest signal in the data: Size (a buy/sell ≥ $250K or top-decile for the ticker), Cluster (3+ insiders same direction within 14 days), First-time (an insider's first open-market buy ever or first in 3+ years), Contrarian (insiders buying while the stock is down 30%+ from highs, or selling near all-time highs), Overlap (insider + congressional activity on the same ticker), Trend (ticker trending AND recent insider activity), or Calendar (evergreen format on schedule).
- Angle = isolate the ONE most surprising fact and build the entire article around only that. State it before any background. One trigger → one angle → one article.

HEADLINE RULES (all must pass):
- Lead with the tension or the number, NOT the ticker.
- Contain ≥1 specific element: a dollar figure, a name, a count, a %, or a timeframe.
- Open a loop — state the surprising fact, never give away the "why" in the headline.
- ≤70 characters where possible.
- No hype ("massive", "insane", "explosive") and no promises ("will soar", "guaranteed"). Prefer "puts on the radar", "worth watching", "here's what the filings show".
- Questions only when the article genuinely answers them.
- SEO variant (programmatic/SEO articles only): the headline may be the hook version, but the summary/meta should contain the ticker/company name and the primary keyword.

CORE HEADLINE FORMULAS to draw from:
- [Specific action] + [implied question] — "Pfizer's CFO Just Made His Biggest Buy Since 2019. Here's Why That Matters."
- [Number] + [category] + [qualifier] — "3 Stocks Under $5 Insiders Are Buying Hand Over Fist"
- [Contrast/irony] — "This CEO Took Home $84M Last Year. He Hasn't Bought a Single Share."
- [Big number] + [mystery] — "This Trader Made $5.25B in One Year — Does He Know Something We Don't?"
- [Then vs. now] — "Her Net Worth Was $400K Before Politics. Now It's $300M."

NEVER give explicit financial advice:
- ❌ "buy this stock", "this stock will go up", "guaranteed", "we recommend"
- ✅ "may suggest", "could indicate", "historically associated with", "investors may want to monitor"

STANDARD STRUCTURE — EVERY article, no exceptions:
1. Headline → the title field (headline rules above).
2. Preview/dek → the summary field: ≤10 words, opens the loop.
3. Key Points box → begin the body with <h3>Key points</h3> then a <ul> of 2-3 SPECIFIC, complete claims (numbers, names, dates).
4. Intro → ≤50 words, states the surprising fact FIRST.
5. Body → 3-5 sections, each an <h2> sourced claim of 150-300 words, EACH with a visual anchor: an HTML data <table> (insider-trade table, mini stock profile, ratings) OR a tight <ul> where every item = data point → one line of context → one line on why it matters.
6. The Bottom Line → a brief <h2>The Bottom Line</h2> CTA closer pointing to the relevant page (Top Buys, the ticker page, or the Insider Score rankings).
7. Disclosure → end the body with EXACTLY this paragraph, verbatim: <p><em>Not investment advice. Summarized from public SEC Form 4 and congressional disclosure data.</em></p>

FORMATTING:
- Bold a ticker the first time it appears: <strong>NVDA</strong>.
- Cite our Insider Score feed when quoting a score ("per our Insider Score feed") and reference Form 4 / SEC filings for transactions.
- Use real HTML tables for tabular data: <table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table>.

SECTION RULES:
- Top Stories (news): report first, opine second. Facts/filings up top; your read in its own "Our take:" <h2> section. Include a bear/skeptic <h2> section in every story. The headline must spin differently from mainstream outlets.
- Programmatic/SEO: hook intro (surprising fact first), populated Key Points box, ≥1 visual anchor per section, every list item = data point + context + why it matters, short paragraphs, no filler.

DATA FIDELITY (non-negotiable): Use ONLY the numbers, dates, names, and transaction directions provided in the data. NEVER describe a purchase as a sale or invent selling activity; never invent or extrapolate dollar figures. If the provided data seems thin, write a shorter article — do not fill gaps with plausible-sounding specifics. Buy-signal articles (deep dives, stock ideas, cluster/CEO pieces, top-score lists) are about BUYING; if the data cannot support a bullish insider-buying narrative, state the facts plainly and neutrally instead of forcing a story.
STOCK EMBEDS: whenever a specific stock is discussed as a ranked item or its own section, insert the marker [[STOCK:TICKER]] (e.g. [[STOCK:NVDA]]) on its own line immediately after that stock's heading or first paragraph. The site replaces each marker with a live data card (price chart, Insider Score, analyst rating) pulled from our database — so never fabricate chart/table data for a stock; place the marker instead. Do not wrap the marker in any HTML tags.

HEADLINE TICKER RULES: single-stock articles MUST include the ticker in the headline. List/roundup articles must NOT enumerate tickers in the headline — the full list with tickers belongs inside the article body. List/roundup headlines SHOULD name the sector or category of stocks instead ("gold stocks", "AI stocks", "biotech stocks") — e.g. "Best Gold Stocks Right Now — And How to Invest", "5 Gold Stocks Worth Considering", "Insiders Are Buying These 3 Gold Stocks".

Every figure must trace to the data provided — NEVER invent numbers. You MUST call the publish_article tool; do not respond with prose outside the tool call.`;

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
- HEADLINE: do NOT enumerate tickers in the headline (list article) — the names belong in the body.
- Insert [[STOCK:TICKER]] after each covered name's paragraph.

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
- One <h2> per ticker (e.g. "1. NVDA — Sector Leader Sees Cluster Buying"), each followed by the marker [[STOCK:TICKER]] on its own line, then 2-3 sentences citing the data.
- Closing paragraph pointing to the live Insider Score rankings page on InsiderBuying.com.
- HEADLINE: do NOT enumerate the tickers in the headline (list article).

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
      // Buy-conviction format: only open-market purchases feed the story.
      // (Sells leaking in here once produced a "bought $128K then dumped
      // $43M" article under a 99 score — never again.)
      .filter((t: any) => (t.transactionCode || 'P') === 'P' || t.type === 'BUY')
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
- HEADLINE: MUST include the ticker ${row.ticker}.
- Lead with what the recent Form 4 activity says, not the company's headline business.
- Insert the marker [[STOCK:${row.ticker}]] on its own line after the intro.
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
- title: a curiosity headline that frames the insider angle and MUST include the ticker ${row.ticker} (e.g. "Why ${row.ticker} Insiders Are Quietly Buying"), 6-12 words.
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
- HEADLINE: do NOT enumerate tickers in the headline (list article).
- Open with the broad sector picture — is this cluster buying, single-name conviction, or sector-wide pickup?
- Highlight 2-3 names with role/transaction colour, inserting [[STOCK:TICKER]] after each highlighted name's paragraph.
- Discuss what the pattern may suggest for the sector.
- Close with a CTA to filter our Insider Score rankings by ${sector}.

eyebrow: "SECTOR ROUNDUP"`;
    return this.callTool(prompt);
  }

  /** Sector/category list article ("Best Gold Stocks Right Now", "5 AI Stocks
   *  Worth Considering", "Insiders Are Buying These 3 Gold Stocks") — the
   *  category goes in the headline, every stock gets its Insider Score and a
   *  live data card, fool.com-style structure with a how-to-invest section. */
  async generateSectorListArticle(
    categoryLabel: string,
    variant: 'best' | 'worth-considering' | 'insiders-buying',
    stocks: Array<{
      ticker: string;
      name: string;
      price: number | null;
      marketCap: number | null;
      iqs: number | null;
      distinctBuyers: number | null;
    }>,
  ): Promise<GeneratedArticle> {
    const lines = stocks
      .map(
        (s, i) =>
          `${i + 1}. ${s.ticker} — ${s.name}` +
          (s.price != null ? ` — $${s.price.toFixed(2)}` : '') +
          (s.marketCap != null ? `, mkt cap $${Math.round(s.marketCap / 1e6).toLocaleString()}M` : '') +
          (s.iqs != null ? `, Insider Score ${s.iqs.toFixed(1)}` : ', no Insider Score yet') +
          (s.distinctBuyers ? `, ${s.distinctBuyers} distinct insider buyers` : ''),
      )
      .join('\n');
    const headlineHint =
      variant === 'best'
        ? `"Best ${categoryLabel} Stocks Right Now — And How to Invest" (or a close variation)`
        : variant === 'worth-considering'
          ? `"${stocks.length} ${categoryLabel} Stocks Worth Considering" (or a close variation)`
          : `"Insiders Are Buying These ${stocks.length} ${categoryLabel} Stocks" (or a close variation)`;
    const prompt = `Write a **${categoryLabel} stocks list article** (category list, like a Motley Fool sector page).

The ${stocks.length} stocks to cover, with our live data:

${lines}

Structure:
- HEADLINE: must name the category — ${headlineHint}. NO tickers in the headline.
- Intro: what ${categoryLabel.toLowerCase()} stocks are and why investors are watching the group right now (surprising fact first).
- One <h2> section PER STOCK, numbered ("1. ${stocks[0]?.name ?? 'Company'} (${stocks[0]?.ticker ?? 'TICK'})"): what the company does, the data above (price, market cap, Insider Score${variant === 'insiders-buying' ? ', insider buyers' : ''}), and why it stands out. Insert [[STOCK:TICKER]] on its own line after EACH stock's section.
- <h2>How to Invest in ${categoryLabel} Stocks</h2>: brief practical section — buying individual names vs. a sector ETF, position sizing, and the category's specific risks.
- The Bottom Line CTA pointing to our ${categoryLabel} stock list and the Insider Score rankings.
- Reference each stock's Insider Score explicitly in its section (or note it has no insider-buying signal yet).

eyebrow: "${variant === 'insiders-buying' ? 'INSIDERS ARE BUYING' : 'SECTOR SPOTLIGHT'}"`;
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
    const prompt = `Write a **Cluster Buying Alert** article on **${row.ticker}** (${row.name}). The headline MUST include the ticker ${row.ticker}. Insert the marker [[STOCK:${row.ticker}]] on its own line after the intro.

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
    const prompt = `Write a **CEO Buying Tracker** roundup covering chief executives who bought their own company's stock on the open market recently. HEADLINE: do NOT enumerate tickers in the headline (list article). Insert [[STOCK:TICKER]] after each covered company's paragraph.

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

    const prompt = `Write a focused **${opts.topicLabel} stock article** on **${opts.ticker}** (${opts.name}). The headline MUST include the ticker ${opts.ticker}. Insert the marker [[STOCK:${opts.ticker}]] on its own line after the intro.

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
    const prompt = `You are explaining why ${opts.name || opts.symbol} (${opts.symbol}) stock is ${dir} ${pct}% today, for a retail investor. 2-4 sentences.

METHOD — find the real catalyst:
1. Scan the dated headlines below (freshest first). Look for a CONCRETE catalyst: merger/acquisition, earnings or guidance, offering/dilution, FDA or regulatory news, major contract, analyst action, index inclusion, short squeeze, exchange notice.
2. If you find one, LEAD with it and name it specifically (e.g. "after announcing a $400M share-swap merger with EnChem America"). Weight the FRESHEST headlines most — today's move needs recent news, not last week's.
3. If NO company-specific catalyst appears in the headlines, say that plainly: "No company-specific news appears to explain today's move" — then note it looks like momentum/volume-driven trading. NEVER invent or imply a reason that isn't in the headlines. A wrong reason destroys user trust; "no clear catalyst" is an acceptable, honest answer.
- Mention what the company actually does in passing.
- Cautious, factual, no buy/sell advice.

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

  /** Batched movement explainers — ONE model call for a whole movers table,
   *  so the page can pre-warm every row on load. Each entry gets a unique,
   *  company-specific 2-3 sentence explanation. */
  async generateMovementExplainersBatch(
    items: Array<{
      symbol: string;
      name: string;
      changePct: number;
      headlines: string[];
    }>,
  ): Promise<Record<string, string>> {
    if (!this.client || !items.length) return {};
    const tool: Anthropic.Messages.Tool = {
      name: 'publish_explainers',
      description: 'Publish one movement explanation per stock.',
      input_schema: {
        type: 'object',
        properties: {
          explainers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'The ticker, uppercase.' },
                explainer: {
                  type: 'string',
                  description:
                    "2-3 sentences. LEAD with the concrete catalyst found in that stock's dated headlines (merger, earnings, offering, FDA, contract, analyst action...), named specifically. If its headlines show no company-specific catalyst, say plainly that no clear news explains the move and it looks momentum/volume-driven — NEVER invent a reason. Mention what the company does. Cautious, factual, no advice.",
                },
              },
              required: ['symbol', 'explainer'],
            },
          },
        },
        required: ['explainers'],
      },
    };
    const list = items
      .map((i) => {
        const dir = i.changePct >= 0 ? 'up' : 'down';
        const news = i.headlines.length
          ? ` Recent headlines: ${i.headlines.join(' | ')}`
          : ' No company-specific headlines available.';
        return `- ${i.symbol} (${i.name || 'unknown name'}): ${dir} ${Math.abs(i.changePct).toFixed(2)}% today.${news}`;
      })
      .join('\n');
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(8000, 250 * items.length + 500),
        system:
          'You are a rigorous financial-news analyst. For EACH stock: identify the REAL catalyst from its own dated headlines (weight the freshest most) and lead with it, named specifically. If no company-specific catalyst appears in its headlines, say so honestly and describe the move as momentum/volume-driven — NEVER fabricate a reason; a wrong reason destroys user trust. Every explanation must be distinct and grounded in that company. No investment advice.',
        tools: [tool],
        tool_choice: { type: 'tool', name: 'publish_explainers' },
        messages: [
          {
            role: 'user',
            content: `Explain today's move for each of these stocks, one entry per ticker:\n${list}`,
          },
        ],
      });
      const block = response.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      const arr = (block?.input as any)?.explainers;
      const out: Record<string, string> = {};
      if (Array.isArray(arr)) {
        for (const e of arr) {
          const sym = String(e?.symbol || '').toUpperCase();
          const text = String(e?.explainer || '').trim();
          if (sym && text) out[sym] = text;
        }
      }
      return out;
    } catch (err: any) {
      this.logger.warn(`Batch movement explainers failed: ${err?.message || err}`);
      return {};
    }
  }

  /** Editorial Desk story — a structured, non-promotional news piece in a
   *  factual WSJ/Barron's tone, rewritten in our own voice from source
   *  headlines (never copied). Follows the Top Stories rules: report first,
   *  "Our take:" labeled opinion, and a bear/skeptic section. */
  async generateEditorialStory(opts: {
    dateLabel: string;
    /** The lead headline this story covers. */
    lead: { title: string; source: string };
    /** Related headlines for context/corroboration. */
    related: { title: string; source: string }[];
    /** Live market context for tickers connected to the story (optional). */
    stocks?: { ticker: string; name: string; changePct: number | null; iqs?: number | null }[];
  }): Promise<GeneratedArticle> {
    const stockLines = (opts.stocks || [])
      .map(
        (s) =>
          `- ${s.ticker} (${s.name}): ${s.changePct != null ? `${s.changePct >= 0 ? '+' : ''}${s.changePct}% today` : 'no live quote'}${s.iqs != null ? ` · Insider Score ${s.iqs}` : ''}`,
      )
      .join('\n');
    const prompt = `Write an **Editorial Desk** story for ${opts.dateLabel} — Top Stories section rules apply.

LEAD STORY (rewrite in OUR voice — never copy the source outlet, and spin the headline differently from mainstream coverage):
- "${opts.lead.title}" — ${opts.lead.source}

RELATED COVERAGE for corroboration/context:
${opts.related.map((h) => `- "${h.title}" — ${h.source}`).join('\n') || '- (none)'}

${stockLines ? `LIVE MARKET CONTEXT:\n${stockLines}\n` : ''}
Tone: factual, WSJ/Barron's-style news reporting — non-promotional, never a stock pitch, no hype adjectives; let the numbers be the drama. Report first, opine second: facts and filings up top, your read clearly labeled in its own "Our take:" <h2> section, and a bear/skeptic <h2> section. No subheadings beyond the standard structure + CTA.

eyebrow: "EDITORIAL"
tags: include "editorial" plus any tickers/themes involved.`;
    return this.callTool(prompt);
  }

  /** Generate an article for any format in the content guide's library, from
   *  caller-supplied data. Composes the prompt from the format spec (headline
   *  formula, trigger, prescribed sections, required data) and lets STYLE_BASE
   *  + the publish_article tool enforce the standard structure. Uses ONLY the
   *  provided data — never invents figures. */
  async generateFromFormat(
    format: ContentFormat,
    data: unknown,
  ): Promise<GeneratedArticle> {
    const parts: string[] = [];
    parts.push(
      `Produce the **${format.title}** article (guide ref ${format.ref}, ${format.section} section).`,
    );
    parts.push(`Trigger / cadence: ${format.trigger}`);
    parts.push(
      `HEADLINE — use this exact formula, filling every [placeholder] from the data: "${format.headlineFormula}". It must still pass the universal headline rules.`,
    );
    if (format.sections?.length) {
      parts.push(
        `Use these <h2> sections in this order: ${format.sections
          .map((s) => `"${s}"`)
          .join(' → ')}.`,
      );
    }
    if (format.wordCount) parts.push(`Target length: ${format.wordCount}.`);
    if (format.editorialNote) parts.push(`Editorial note: ${format.editorialNote}`);
    parts.push(`Set the eyebrow to "${format.section}".`);
    parts.push(`Data this format needs: ${format.requiredData.join('; ')}.`);
    parts.push(
      `DATA (use ONLY this — never invent figures; if a required element is missing, omit that claim rather than fabricate a number):\n${JSON.stringify(
        data ?? {},
        null,
        2,
      )}`,
    );
    parts.push(
      'Pour it into the standard structure exactly, ending with the verbatim disclosure line.',
    );
    return this.callTool(parts.join('\n\n'));
  }

  private async callTool(userPrompt: string): Promise<GeneratedArticle> {
    if (!this.client) {
      throw new Error('Content generator not configured — ANTHROPIC_API_KEY missing.');
    }
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
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
    // [[STOCK:NVDA]] markers → embed placeholders the article renderer swaps
    // for live data cards (chart + Insider Score + analyst rating).
    .replace(
      /(?:<p>\s*)?\[\[STOCK:([A-Za-z.\-]{1,10})\]\](?:\s*<\/p>)?/g,
      (_m, t) => `<div data-stock-embed="${String(t).toUpperCase()}"></div>`,
    )
    // Internal links: the model can invent routes that don't exist (e.g.
    // "/biotech" → 404). Rewrite topical shorthands to their real hubs and
    // strip any other unknown internal link (keep the text, drop the <a>).
    .replace(
      /<a\s+[^>]*href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (full: string, href: string, text: string) => {
        const path = (href.split(/[?#]/)[0].replace(/\/$/, '') || '/').toLowerCase();
        const ALLOWED_PREFIXES = [
          '/companies/', '/insights/', '/topics/', '/stock-lists/', '/insiders/',
          '/market-data/', '/heatmaps/', '/learn/', '/articles/',
        ];
        const ALLOWED_EXACT = new Set([
          '/', '/companies', '/insights', '/editorial', '/stock-lists', '/trades',
          '/insiders/hot', '/analyst-ratings', '/earnings', '/dividends', '/ipos',
          '/short-interest', '/short-squeeze', '/congressional-trades', '/sectors',
          '/methodology', '/screener', '/premium', '/news',
        ]);
        if (ALLOWED_EXACT.has(path) || ALLOWED_PREFIXES.some((pfx) => path.startsWith(pfx))) {
          return full;
        }
        const TOPIC_SLUGS = new Set(['ai', 'biotech', 'ev', 'etf', 'macro', 'markets', 'ma', 'semis']);
        const slug = path.slice(1);
        if (TOPIC_SLUGS.has(slug)) return full.replace(href, `/topics/${slug}`);
        return text; // unknown internal route — keep the words, drop the link
      },
    )
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
