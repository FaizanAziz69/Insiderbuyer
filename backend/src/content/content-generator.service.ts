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

/** The About-card payload for one Form 4 filer. Filing facts always present;
 *  every biography field is null unless the model recognised a public figure
 *  or institution (see generateInsiderBio). */
export interface InsiderBio {
  label: string;
  description: string;
  /** true when the biography fields below carry public-record facts. */
  recognised: boolean;
  entityType: string | null;
  basedIn: string | null;
  age: number | null;
  netWorth: string | null;
  billionaire: boolean | null;
  manages: string | null;
  founded: number | null;
  majorPositions: string[];
}

/** Biography-grade model for the About cards: these are real named people, so
 *  the profile runs on the strongest model and is cached for a month rather
 *  than being regenerated cheaply per view. */
const INSIDER_BIO_MODEL = process.env.INSIDER_BIO_MODEL || 'claude-opus-5';

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
          'The HEADLINE. Lead with the tension or the number, NOT the ticker. Must contain ≥1 specific element (dollar figure, name, count, %, or timeframe), open a loop (state the surprising fact, never the "why"), stay ≤70 characters where possible, and use no hype/promise words. VARY THE PHRASING EVERY TIME — never reuse a headline formula that appears on the site already ("Why X Insiders Are Quietly Buying" is banned); rotate distinct angles: the person ("A Director Just Spent $2.1M…"), the streak ("Third Insider Buy This Month at…"), the contrast ("Down 40%, Yet Insiders Keep Buying…"), the sum ("$5.3M of Insider Money Landed on…"), the question, the timeframe. Example: "A Director Just Spent $2.1M on a Stock Down 60%".',
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
          'Article body in HTML following the InsiderBuyer standard structure IN ORDER: (1) a Key Points box — <h3>Key points</h3> then a <ul> of 2-3 specific complete claims (numbers, names, dates); (2) a hook intro of ≤50 words that states the surprising fact FIRST; (3) 3-5 <h2> claim sections of 150-300 words each, EACH with a visual anchor — a data <table> (insider-trade table / mini stock profile / ratings) or a tight <ul> where each item is data point → context → why it matters; (4) a brief <h2>The Bottom Line</h2> CTA closer pointing to Top Buys, the ticker page, or the Insider Score rankings; (5) END with EXACTLY, verbatim: <p><em>Not investment advice. Summarized from public SEC Form 4 and congressional disclosure data.</em></p>. Cite our Insider Score feed and Form 4 filings. The NUMERIC Insider Score is a paygated premium feature: NEVER print a numeric Insider Score anywhere (no \"score of 70\", no scores in tables) — describe it only qualitatively using the band provided (e.g. \"a Very Strong Insider Score\"). Use cautious phrasing ("may suggest", "historically associated with", "investors may want to monitor"); NEVER "buy", "guaranteed", "will go up", "recommend". Never invent numbers — use only the data provided.',
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

  /** Qualitative band for the paygated Insider Score. Article prose must NEVER
   *  print the numeric score (it's premium-gated on every product surface) —
   *  the generator receives only this band and is instructed accordingly. */
  private iqsBand(iqs: number | null | undefined): string {
    if (iqs == null) return 'not yet scored';
    if (iqs >= 80) return 'Exceptional (top tier)';
    if (iqs >= 70) return 'Very Strong';
    if (iqs >= 60) return 'Strong';
    if (iqs >= 45) return 'Moderate';
    return 'Emerging';
  }

  async generateDailySummary(top: RankingLite[], dateLabel: string): Promise<GeneratedArticle> {
    const lines = top
      .slice(0, 8)
      .map(
        (r, i) =>
          `${i + 1}. ${r.ticker} — ${r.name} (${r.sector || 'n/a'}) — Insider Score band: ${this.iqsBand(r.iqs)}` +
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
          `${i + 1}. ${r.ticker} — ${r.name} — Sector: ${r.sector || 'n/a'} — Insider Score band: ${this.iqsBand(r.iqs)}` +
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
- Insider Score band: ${this.iqsBand(row.iqs)} (per our Insider Score feed)
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
- Insider Score band: ${this.iqsBand(row.iqs)} (per our Insider Score feed)
- Market cap: ${row.marketCap ? `$${Math.round(row.marketCap).toLocaleString()}` : 'n/a'}
- Distinct insider buyers: ${row.distinctBuyers ?? 'n/a'}
- Total insider purchase value: ${row.totalPurchaseValue ? `$${Math.round(row.totalPurchaseValue).toLocaleString()}` : 'n/a'}

Format — SHORT and PUNCHY:
- title: a curiosity headline that frames the insider angle and MUST include the ticker ${row.ticker}, 6-12 words. VARY the formula every time — never "Why X Insiders Are Quietly Buying" (overused); pick a fresh angle: the buyer's role, the dollar sum, the streak, the price contrast, or a question.
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
          `${i + 1}. ${r.ticker} — ${r.name} — Insider Score band: ${this.iqsBand(r.iqs)}` +
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
          (s.iqs != null ? `, Insider Score band: ${this.iqsBand(s.iqs)}` : ', no Insider Score yet') +
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
          `${i + 1}. ${r.ticker} — ${r.name} (${r.sector || 'n/a'}) — Insider Score band: ${this.iqsBand(r.iqs)}` +
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
- Insider Score band: ${this.iqsBand(row.iqs)} (per our Insider Score feed)
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
          (typeof s.iqs === 'number' && s.iqs > 0 ? `, Insider Score band: ${this.iqsBand(s.iqs)}` : ''),
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
        ? `Its Insider Score band is ${this.iqsBand(opts.iqs)} (per our Insider Score feed).`
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
    /** Market context (volume, float, 52-week position, insider buying) so the
     *  explainer can always name a real mechanism instead of "no news". */
    context?: string[];
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
      : 'No dated company headline was retrieved for today.';
    const context = opts.context?.length
      ? `\nMarket context measured from live data (use this to explain the mechanism):\n- ${opts.context.join('\n- ')}`
      : '';
    const prompt = `You are explaining why ${opts.name || opts.symbol} (${opts.symbol}) stock is ${dir} ${pct}% today, for a retail investor. 2-4 sentences.

METHOD — always explain the move. There is always a mechanism; find the best-supported one.
1. FIRST scan the dated headlines (freshest first) for a CONCRETE catalyst: merger/acquisition, earnings or guidance, offering/dilution, FDA or regulatory news, a major contract or subsidiary announcement, analyst action, index inclusion, short squeeze, exchange notice. If you find one, LEAD with it and name it specifically. Weight the freshest headlines most.
2. If the headlines carry no dated company announcement, DO NOT write "no news" or "no catalyst". Instead explain the move through the market context supplied below — that IS the explanation. Say which mechanism fits, for example: an unusually heavy volume day relative to its own average; a thin float or small market cap where modest dollar flow moves the price hard; a bounce off the 52-week low or a breakout to new highs; continued follow-through from a recent announcement; or recent insider buying on record. Name the numbers you were given.
3. Be precise about certainty: "the move is tracking X" or "consistent with X" when inferring from context, versus "after announcing X" when a headline confirms it. NEVER invent a specific event, deal, contract or figure that is not in the input — a fabricated catalyst is worse than an inferred mechanism.
4. HARD RULE — never describe what is ABSENT. Do not write "no company announcement appears", "no dated news", "no clear catalyst", "rather than fundamental news", or any sentence about what did not happen. The reader wants what IS moving the stock. Spend every sentence on the mechanism you can actually see and stop there.
- Mention what the company actually does in passing.
- Cautious, factual, no buy/sell advice.

${news}${context}`;
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
      const cleaned = scrubAbsence(plainExplainer(explainer));
      return {
        title: `Why ${opts.symbol} is ${dir} ${pct}% today`,
        // If the scrub removed everything, fall back to the measured facts we
        // supplied (volume vs average, float, 52-week position) — real
        // mechanisms, not an apology.
        explainer:
          cleaned ||
          (opts.context && opts.context.length
            ? opts.context.slice(0, 2).join(' ')
            : ''),
      };
    } catch (err: any) {
      this.logger.warn(
        `Movement explainer failed for ${opts.symbol}: ${err?.message || err}`,
      );
      return { title: `Why ${opts.symbol} is ${dir} ${pct}% today`, explainer: '' };
    }
  }

  /** AI Bull Case vs Bear Case for a ticker — our own analogue of QuiverQuant's
   *  gated card. Grounded in the company + recent headlines we pass in; clearly
   *  an AI opinion, not advice. Returns 3 bull + 3 bear bullet points. */
  /**
   * Plain-English description of WHO an insider is.
   *
   * Client 2026-08-24: "Insider profiles and top insider profiles need better
   * About descriptions… keep it simple and explain who they are — is it a fund?
   * Is it an individual? Where do they reside? Are they a billionaire? What's
   * their net worth? How much do they manage? How old is he or she? What
   * companies do they have major positions in?"
   *
   * That is deliberately MORE than the Form 4 record holds, so the answer is
   * split in two, and the split is the whole safety model:
   *   • Filing facts (roles, companies, tenure, buy/sell totals) are ours and
   *     are passed in — the model may restate them freely.
   *   • Biography (type of entity, base, age, net worth, assets managed,
   *     famous holdings) can only come from the model's own knowledge of a
   *     PUBLIC figure or institution. Every one of those fields is nullable and
   *     the model is told to leave it null unless it is confident from
   *     well-known public reporting. Most Form 4 filers are private individuals
   *     the model has never heard of; for them the biography block is empty and
   *     the card simply shows the filing story.
   *
   * `enrich: false` (the retry path on a model error) asks for the filing-only
   * description with no biography at all, so a degraded generation can never
   * become a source of invented personal facts.
   */
  async generateInsiderBio(opts: {
    name: string;
    kind: 'person' | 'entity';
    roles: string[];
    companies: { ticker: string | null; name: string }[];
    firstTraded: string | null;
    lastTraded: string | null;
    yearsActive: number | null;
    buyCount: number;
    sellCount: number;
    totalBought: number;
    totalSold: number;
    /** false → filing-only fallback generation (no biography fields). */
    enrich?: boolean;
    /** Model override; defaults to the biography-grade model. */
    model?: string;
  }): Promise<InsiderBio | null> {
    if (!this.client) return null;
    const enrich = opts.enrich !== false;
    const money = (n: number) =>
      n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;
    const facts = [
      `Filer name: ${opts.name}`,
      `Filer type (already determined from the name — do not contradict): ${
        opts.kind === 'entity'
          ? 'an organisation (fund, trust, holding company or corporate entity), NOT an individual person'
          : 'an individual person'
      }`,
      opts.roles.length
        ? `Roles this filer has reported on SEC Form 4: ${opts.roles.join(', ')}`
        : 'No role was stated on the filings.',
      opts.companies.length
        ? `Companies they are an insider of (from our filing record): ${opts.companies
            .slice(0, 6)
            .map((c) => (c.ticker ? `${c.name} (${c.ticker})` : c.name))
            .join('; ')}`
        : '',
      opts.firstTraded ? `First reported transaction: ${opts.firstTraded}` : '',
      opts.lastTraded ? `Most recent reported transaction: ${opts.lastTraded}` : '',
      opts.yearsActive != null
        ? `Span of reported filings: ${opts.yearsActive < 1 ? 'under a year' : `about ${opts.yearsActive} year(s)`}`
        : '',
      `Open-market purchases on record: ${opts.buyCount} (${money(opts.totalBought)})`,
      `Sales on record: ${opts.sellCount} (${money(opts.totalSold)})`,
    ]
      .filter(Boolean)
      .join('\n');

    // Structured output rather than a forced tool call: every biography field
    // is explicitly nullable, so "I don't know" has a first-class
    // representation instead of being paraphrased into prose.
    const schema: Record<string, unknown> = {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: {
          type: 'string',
          description:
            'One short descriptor, max 70 chars, e.g. "Chief Executive Officer at Acme Corp", "New York asset manager — 10% owner", "Founder and chairman, private investor".',
        },
        description: {
          type: 'string',
          description:
            'Two to four SHORT plain-English sentences answering "who is this?" for a reader who has never heard the name. Sentence 1: whether this is a person or an organisation and what they do. Then, only if you are confident from well-known public reporting: where they are based, roughly how much they manage or are worth, and which companies they are best known for holding. Finish with how they show up in our filing record (the role they file under and at which company). No hype, no investment advice, no speculation about motives. If you do not recognise this filer, say plainly that little public information is available and describe only the filing record.',
        },
        recognised: {
          type: 'boolean',
          description:
            'true ONLY if you actually recognise this specific filer from public reporting (a notable investor, executive, fund or institution). false for a private individual or small entity you do not know — in that case every field below must be null.',
        },
        entityType: {
          type: ['string', 'null'],
          description:
            'Plain-English type in 1-4 words: "Individual investor", "Company executive", "Hedge fund", "Asset manager", "Family trust", "Private equity firm", "Venture capital firm", "Holding company". Null if unclear.',
        },
        basedIn: {
          type: ['string', 'null'],
          description:
            'Where they live or are headquartered, as "City, Country" or "City, State" — only if publicly known. Null otherwise. Never guess from the company address.',
        },
        age: {
          type: ['integer', 'null'],
          description:
            'Approximate current age in years, individuals only, only if their birth year is public knowledge. Null otherwise.',
        },
        netWorth: {
          type: ['string', 'null'],
          description:
            'Approximate personal net worth as a short string with a currency and unit, e.g. "~$3.2 billion". Individuals only, and ONLY for people whose wealth is widely reported (e.g. on public rich lists). Null for everyone else — never estimate from filings.',
        },
        billionaire: {
          type: ['boolean', 'null'],
          description:
            'true only when this person is widely reported as a billionaire, false when they are a known public figure who is clearly not, null when unknown or not an individual.',
        },
        manages: {
          type: ['string', 'null'],
          description:
            'Approximate assets under management for a fund/firm, e.g. "~$500 billion in client assets". Only when publicly reported. Null otherwise.',
        },
        founded: {
          type: ['integer', 'null'],
          description: 'Year the firm was founded, if publicly known. Null otherwise.',
        },
        majorPositions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Up to 5 companies this filer is best known for holding large positions in, each as "Company (TICKER)" when you know the ticker. Use the companies from our filing record plus any widely reported large holdings. Empty array if you know of none.',
        },
      },
      required: [
        'label',
        'description',
        'recognised',
        'entityType',
        'basedIn',
        'age',
        'netWorth',
        'billionaire',
        'manages',
        'founded',
        'majorPositions',
      ],
    };

    const system = enrich
      ? 'You write short "About" profiles of SEC Form 4 filers for a research site. These are REAL named people and organisations, so accuracy outranks completeness. ' +
        'Two kinds of statement are allowed. (1) The filing facts supplied below — restate them freely. (2) Public biography — you may state where the filer is based, their approximate age, net worth or assets managed, and the holdings they are known for ONLY when this filer is a well-known public figure or institution and you are confident from widely reported public information. ' +
        'For anyone you do not recognise — which is most Form 4 filers — set recognised=false, leave EVERY biography field null, and say plainly in the description that little public information is available about them. ' +
        'Never estimate a net worth or an asset figure from the filing values, never infer where someone lives from a company address, never guess an age, and never invent a job history. Approximate figures must read as approximate. ' +
        'No investment advice, no speculation about why they bought or sold, no marketing language. Plain third-person English a beginner can follow.'
      : 'You describe SEC Form 4 filers for a research site using ONLY the supplied filing facts. Set recognised=false and leave every biography field null. ' +
        'Do not state or imply any outside biography — no location, age, wealth, assets managed, employment history or holdings beyond the companies listed in the facts. ' +
        'Write two or three plain third-person sentences about what the filing record shows. No investment advice, no speculation.';

    try {
      const response = await this.client.messages.create({
        model: opts.model || INSIDER_BIO_MODEL,
        max_tokens: 2000,
        // Bios are short; medium effort keeps the profile page responsive.
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        system,
        messages: [
          {
            role: 'user',
            content: `Write the About profile for this SEC Form 4 filer.\n\n${facts}`,
          },
        ],
      });
      if (response.stop_reason === 'refusal') {
        this.logger.warn(`Insider bio refused for ${opts.name}`);
        return null;
      }
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) return null;
      const parsed = JSON.parse(text) as Record<string, any>;
      const label = plainExplainer(String(parsed.label || '')).trim().slice(0, 90);
      const description = plainExplainer(String(parsed.description || '')).trim();
      if (!description) return null;
      const str = (v: unknown, max = 80): string | null => {
        const s = typeof v === 'string' ? v.trim() : '';
        return s ? s.slice(0, max) : null;
      };
      const recognised = enrich && parsed.recognised === true;
      // Biography fields survive only on a recognised filer — a model that
      // says it does not know the person cannot also fill in their net worth.
      const age = recognised && Number.isFinite(Number(parsed.age)) ? Number(parsed.age) : null;
      const founded =
        recognised && Number.isFinite(Number(parsed.founded)) ? Number(parsed.founded) : null;
      return {
        label,
        description,
        recognised,
        entityType: str(parsed.entityType, 40),
        basedIn: recognised ? str(parsed.basedIn, 60) : null,
        age: age != null && age > 15 && age < 110 ? age : null,
        netWorth: recognised ? str(parsed.netWorth, 40) : null,
        billionaire: recognised && typeof parsed.billionaire === 'boolean' ? parsed.billionaire : null,
        manages: recognised ? str(parsed.manages, 60) : null,
        founded: founded != null && founded > 1700 && founded <= new Date().getUTCFullYear() ? founded : null,
        majorPositions: Array.isArray(parsed.majorPositions)
          ? parsed.majorPositions
              .map((x: unknown) => str(x, 60))
              .filter((x: string | null): x is string => !!x)
              .slice(0, 5)
          : [],
      };
    } catch (err: any) {
      this.logger.warn(`Insider bio failed for ${opts.name}: ${err?.message || err}`);
      // One filing-only retry on a cheaper model, so an outage or a model
      // access problem degrades the card instead of emptying it.
      if (enrich) {
        return this.generateInsiderBio({
          ...opts,
          enrich: false,
          model: 'claude-haiku-4-5-20251001',
        });
      }
      return null;
    }
  }

  /**
   * "What Are Insiders Doing?" — the plain-English answer at the top of a stock
   * profile, grounded ONLY in the Form 4 record we hold for that company.
   *
   * The facts block states explicitly which activity types we track and which
   * we have no data for, because the difference matters: "no option exercises
   * on file" and "we do not track option exercises" are very different claims,
   * and the model must never turn missing data into a negative finding.
   */
  async generateInsiderActivity(opts: {
    symbol: string;
    name: string;
    buyCount: number;
    buyValue: number;
    buyShares: number;
    sellCount: number;
    sellValue: number;
    sellShares: number;
    distinctBuyers: number;
    distinctSellers: number;
    topRoles: string[];
    firstDate: string | null;
    lastDate: string | null;
    insiderShares: number | null;
    sharesOutstanding: number | null;
    awardCount: number;
    optionExerciseCount: number;
    taxWithholdCount: number;
    giftCount: number;
    otherCount: number;
    /** False when this company's filings predate the wider ingestion, so the
     *  compensation/option/private-placement categories are simply unknown. */
    nonTradeDataAvailable: boolean;
  }): Promise<{ summary: string; bullets: string[] } | null> {
    if (!this.client) return null;
    const money = (v: number) =>
      v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`;
    const netShares = opts.buyShares - opts.sellShares;
    const ownPct =
      opts.insiderShares != null && opts.sharesOutstanding
        ? (opts.insiderShares / opts.sharesOutstanding) * 100
        : null;

    const facts = [
      `Company: ${opts.name} (${opts.symbol})`,
      `Open-market PURCHASES on file: ${opts.buyCount} totalling ${money(opts.buyValue)} across ${opts.buyShares.toLocaleString()} shares, by ${opts.distinctBuyers} distinct insider(s).`,
      `Open-market SALES on file: ${opts.sellCount} totalling ${money(opts.sellValue)} across ${opts.sellShares.toLocaleString()} shares, by ${opts.distinctSellers} distinct insider(s).`,
      `Net open-market position change: ${netShares >= 0 ? '+' : ''}${netShares.toLocaleString()} shares (${netShares >= 0 ? 'net buying' : 'net selling'}).`,
      opts.topRoles.length ? `Roles of those transacting: ${opts.topRoles.join(', ')}.` : '',
      opts.firstDate && opts.lastDate
        ? `Filing record spans ${opts.firstDate} to ${opts.lastDate}.`
        : '',
      ownPct != null
        ? `Shares still held by insiders who appear in these filings: ${Math.round(opts.insiderShares as number).toLocaleString()}, about ${ownPct.toFixed(2)}% of ${Math.round(opts.sharesOutstanding as number).toLocaleString()} shares outstanding. NOTE: this counts only insiders who have filed a transaction, so it is a FLOOR on total insider ownership, not the full beneficial-ownership figure from the proxy statement.`
        : 'Insider ownership percentage: not computable — shares outstanding or post-transaction holdings are missing.',
      opts.nonTradeDataAvailable
        ? [
            `Stock awarded as compensation (code A): ${opts.awardCount} filing(s).`,
            `Option/derivative exercises (codes M, X): ${opts.optionExerciseCount} filing(s).`,
            `Shares surrendered to cover tax or exercise cost (code F): ${opts.taxWithholdCount} filing(s).`,
            `Gifts (code G): ${opts.giftCount} filing(s).`,
            `Other acquisitions or disposals (code J) — this is how PRIVATE PLACEMENTS and private financings usually appear: ${opts.otherCount} filing(s).`,
          ].join('\n')
        : 'IMPORTANT: for this company we currently hold ONLY open-market purchases and sales. Stock awards, option exercises, tax withholdings, gifts and private-placement participation are NOT in our data for it. You must say these are not tracked yet — do NOT state that none occurred.',
    ]
      .filter(Boolean)
      .join('\n');

    const tool: Anthropic.Messages.Tool = {
      name: 'publish_insider_activity',
      description: 'Publish the plain-English answer to "What are insiders doing?"',
      input_schema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              '2 to 4 plain sentences answering what the insider filings actually show for this company: the balance of buying versus selling, who is doing it, and over what period. Lead with the most decision-useful fact.',
          },
          bullets: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Exactly 4 short lines, each ≤120 chars, in this order: (1) what the filings say overall, (2) how much insiders own, (3) net buying vs selling, (4) whether the activity is open-market conviction or routine compensation/option/private-placement activity — saying plainly when a category is not tracked rather than implying it did not happen.',
          },
        },
        required: ['summary', 'bullets'],
      },
    };

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system:
          'You summarise SEC Form 4 insider activity for a stock research page. State ONLY what the supplied facts support. ' +
          'Never invent transactions, names, dates, prices or ownership figures, and never estimate a number that is not given. ' +
          'Critically: if the facts say a category is NOT TRACKED, say it is not tracked — never report it as zero, none, or "no evidence of". ' +
          'Distinguish clearly between open-market purchases (a personal decision to invest) and routine compensation such as grants, option exercises and tax withholding. ' +
          'Do not speculate about motive and never give investment advice. Plain English, neutral third person, no hype.',
        tool_choice: { type: 'tool', name: 'publish_insider_activity' },
        tools: [tool],
        messages: [
          { role: 'user', content: `Answer "What are insiders doing?" using only these facts.\n\n${facts}` },
        ],
      });
      const block = response.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      const input = block?.input as { summary?: string; bullets?: string[] } | undefined;
      const summary = plainExplainer(String(input?.summary || '')).trim();
      const bullets = (input?.bullets || [])
        .map((b) => plainExplainer(String(b)).trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!summary) return null;
      return { summary, bullets };
    } catch (err: any) {
      this.logger.warn(`Insider activity summary failed for ${opts.symbol}: ${err?.message || err}`);
      return null;
    }
  }

  async generateBullBear(opts: {
    symbol: string;
    name: string;
    sector?: string | null;
    insiderScore?: number | null;
    headlines: string[];
  }): Promise<{ bull: string[]; bear: string[] } | null> {
    if (!this.client) return null;
    const facts = [
      `Company: ${opts.name} (${opts.symbol})`,
      opts.sector ? `Sector: ${opts.sector}` : '',
      opts.insiderScore != null ? `Our Insider Score: ${Math.round(opts.insiderScore)}/100` : '',
      opts.headlines.length
        ? `Recent headlines:\n- ${opts.headlines.slice(0, 8).join('\n- ')}`
        : 'No recent company-specific headlines available.',
    ]
      .filter(Boolean)
      .join('\n');
    const tool: Anthropic.Messages.Tool = {
      name: 'publish_bull_bear',
      description: 'Publish the bull case and bear case.',
      input_schema: {
        type: 'object',
        properties: {
          bull: { type: 'array', items: { type: 'string' }, description: '3 concise bull-case points' },
          bear: { type: 'array', items: { type: 'string' }, description: '3 concise bear-case points' },
        },
        required: ['bull', 'bear'],
      },
    };
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system:
          'You are a balanced equity analyst. Give a fair bull case and bear case for a stock, grounded ONLY in the company facts and headlines provided plus widely-known, durable fundamentals. Do NOT invent specific numbers, prices, or events not supported by the input. Each point is one plain-English sentence. Informational only, never investment advice.',
        tool_choice: { type: 'tool', name: 'publish_bull_bear' },
        tools: [tool],
        messages: [
          {
            role: 'user',
            content: `Write a Bull Case vs Bear Case for ${opts.name} (${opts.symbol}). 3 bullet points each, one sentence each, specific and balanced.\n\n${facts}`,
          },
        ],
      });
      const block = response.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      const input = block?.input as { bull?: string[]; bear?: string[] } | undefined;
      const clean = (arr?: string[]) =>
        (arr || []).map((s) => plainExplainer(String(s)).trim()).filter(Boolean).slice(0, 4);
      const bull = clean(input?.bull);
      const bear = clean(input?.bear);
      if (!bull.length && !bear.length) return null;
      return { bull, bear };
    } catch (err: any) {
      this.logger.warn(`Bull/bear failed for ${opts.symbol}: ${err?.message || err}`);
      return null;
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
                    "2-3 sentences. LEAD with the concrete catalyst found in that stock's dated headlines (merger, earnings, offering, FDA, contract, analyst action...), named specifically. If its headlines carry no dated announcement, do NOT write 'no news' or 'no clear catalyst' — explain the mechanism instead: unusual volume for that stock, a thin float or small market cap where modest dollar flow moves price hard, a bounce off the 52-week low, a breakout to new highs, follow-through from an earlier announcement, or recent insider buying. Never invent a specific event or figure, and NEVER describe what is absent — no 'no news', 'no catalyst', 'no announcement appears' or 'rather than fundamental news'. Spend every sentence on what IS driving it. Mention what the company does. Cautious, factual, no advice.",
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
          : ' No dated company headline retrieved — explain the move through its own volume, float size and 52-week range position instead.';
        return `- ${i.symbol} (${i.name || 'unknown name'}): ${dir} ${Math.abs(i.changePct).toFixed(2)}% today.${news}`;
      })
      .join('\n');
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(8000, 250 * items.length + 500),
        system:
          'You are a rigorous financial-news analyst. For EACH stock: identify the REAL catalyst from its own dated headlines (weight the freshest most) and lead with it, named specifically. Every stock moves for a reason — when its headlines hold no dated announcement, explain the MECHANISM (unusual volume, thin float, range breakout or bounce, follow-through from earlier news, insider buying) rather than writing that no news explains it. Distinguish \'after announcing X\' (headline-confirmed) from \'consistent with X\' (inferred from the move). Never fabricate a specific event, deal or figure, and never write about the ABSENCE of news — avoid \"no news\", \"no catalyst\" or \"rather than fundamental news\" phrasing; describe only what is driving the move. Every explanation must be distinct and grounded in that company. No investment advice.',
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
          const text = scrubAbsence(plainExplainer(String(e?.explainer || '')));
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
      `HEADLINE — start from this formula, filling every [placeholder] from the data: "${format.headlineFormula}". Then REWRITE it into a fresh, specific headline of your own: lead with the most concrete fact in the data (a person's name, a ticker, a dollar figure, a count), and vary the sentence shape — question, statement, or number-led. Two articles from this template must never share the same generic headline; the data's specifics ARE the headline. It must still pass the universal headline rules.`,
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

/** Explainers render as plain text in a popover — strip any markdown the
 *  model sneaks in (headings, bold, bullets). */
/**
 * Hard output guard for movement explainers. The prompts already forbid
 * "no news" phrasing, but the model still slips it through occasionally and a
 * cached copy then shows it for hours — so absence-sentences are stripped
 * server-side before anything is cached or served. Prompt rules alone are not
 * enforcement; this is.
 */
function scrubAbsence(text: string): string {
  const BANNED: RegExp[] = [
    /\b(no|not any|without a?|lacks?)\s+(a\s+)?(clear\s+)?(company[- ]specific\s+)?(catalyst|news|announcement|headline|driver)/i,
    /\brather than (fundamental|company|any)\b/i,
    /\bheadlines? only reference/i,
    /\bmovement itself\b/i,
    /\bno (dated|company|specific|obvious|identifiable)\b[^.!?]*\b(news|announcement|catalyst|headline)/i,
    /\b(couldn'?t|could not|unable to|failed to) (identify|find|locate)\b/i,
    /\bin the absence of\b/i,
  ];
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sent) => !BANNED.some((re) => re.test(sent)))
    .join(' ')
    .trim();
  // Sentence-splitting on "Inc." etc. can leave a dangling stub once the
  // banned sentences are gone — treat anything that short as nothing, so the
  // caller falls back to the measured facts instead.
  return kept.length < 30 ? '' : kept;
}

function plainExplainer(text: string): string {
  return text
    .replace(/^#+\s*[^\n]*\n?/gm, (m) => (m.includes('%') || m.length > 60 ? '' : ''))
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
