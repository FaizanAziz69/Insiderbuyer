import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { hasIrParagraph, issuerFromHeadline } from './ir-parser';

/**
 * Workstream F — IR Budget / Promoter Score. Discovery.
 *
 * Brief v2 §2.3 asks for a "Scraper/parser for IR-agreement disclosures:
 * SEDAR+ filings and issuer news releases".
 *
 * WHAT WE ACTUALLY INGEST, AND WHY (findings from the source R&D, 2026-09-14):
 *
 *  • SEDAR+ is out. www.sedarplus.ca answers a plain HTTPS request with 403
 *    from every path — it sits behind bot protection that expects a real
 *    browser. A server-side pipeline cannot depend on defeating that, so it is
 *    not the source. Nothing is lost: the filing that matters here is the
 *    Form 3C, which goes to the EXCHANGE, not to SEDAR+ (TSXV Notice to
 *    Issuers, April 10 2024).
 *
 *  • TSXV daily bulletins are out. They are published (free, via CNW) and are
 *    beautifully structured, but they carry listings, halts, financings and
 *    delistings — an IR agreement does not get its own bulletin type. Checked
 *    a full bulletin day: zero mentions of investor relations.
 *
 *  • The ISSUER NEWS RELEASE is the disclosure. Policy 3.4 §3.1 prescribes its
 *    content, and the Exchange requires a further news release for every
 *    amendment, extension or renewal. That is exactly the record this dataset
 *    needs, and it is public the moment it crosses the wire.
 *
 * So discovery is: Google News RSS as a dated, queryable index over the
 * Canadian wires (the same index `news.service.ts` already relies on), then
 * resolve each item to its publisher URL, then read the release from the wire
 * itself. Nothing here is scraped from behind a paywall or a bot wall; every
 * fetch is a public press release, and we keep its URL as the source link the
 * brief asks for in §2.3.
 *
 * Coverage honesty: this index is very good but not a filing feed. §6 wants
 * ">=90% of new TSXV IR-agreement disclosures parsed within 24h" — we measure
 * that against what discovery returns, and `status()` exposes the query set so
 * a miss can be traced to a phrasing no query covers.
 */

export interface DiscoveredItem {
  /** Google News article id — stable, and our dedupe key before resolution.
   *  For an item from a wire's own RSS feed this is the release URL. */
  guid: string;
  title: string;
  source: string;
  publishedAt: string | null;
  query: string;
  /** Already-known publisher URL (wire RSS items). Skips Google resolution. */
  url?: string;
}

export interface FetchedRelease extends DiscoveredItem {
  url: string;
  host: string;
  text: string;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const DAY = 86_400_000;

/** RSS `source` names that are the wires we can read full text from. */
const WIRE_SOURCE =
  /newsfile|access ?newswire|globenewswire|globe newswire|pr ?newswire|cnw|business ?wire|newswire\.ca|investing news|junior mining|the ?newswire|globe and mail|stockhouse/i;
/** RSS `source` names that paraphrase releases — never read, but see
 *  `followAggregators` for what their headlines are still good for. */
const AGGREGATOR =
  /yahoo|stock ?titan|kalkine|tradingview|citybiz|manila|scanx|pluang|simply wall|wealth ?awesome|issuewire|marketscreener|investing\.com|seeking alpha|benzinga|nasdaq\.com|morningstar/i;

/** Aggregator headlines followed to the wire in one pass. Each is one more
 *  Google News query; the feed rarely holds more than a handful that qualify. */
const MAX_FOLLOW_UPS = 30;

/**
 * Phrase variants, not one catch-all query. Policy 3.4 covers investor
 * relations, promotional AND market-making activities, and issuers announce
 * all three in their own words; a single query for "investor relations
 * agreement" misses "engages X for investor awareness" entirely.
 *
 * Each query is capped at 50 items by Google, so more, narrower queries also
 * buy depth. Add to this list rather than widening a query — a wide query
 * returns the same 50 popular items and silently loses the small issuers,
 * which are the whole point of the dataset.
 */
export const DISCOVERY_QUERIES = [
  '"investor relations agreement"',
  '"investor relations services"',
  '"investor relations and marketing"',
  '"marketing and investor relations"',
  '"investor relations contract"',
  '"investor awareness" agreement TSXV',
  '"engages" "investor relations" TSXV',
  '"retains" "investor relations" TSXV',
  '"engages" "investor relations" CSE',
  '"promotional services" agreement TSXV',
  '"market making agreement" TSXV',
  '"digital marketing agreement" TSXV CSE',
  '"IR services" agreement TSXV',
  '"capital markets advisory" agreement TSXV',
  '"shareholder communications" agreement TSXV',
];

/**
 * The headline-blind sweep.
 *
 * Every query above matches a PHRASE, so a release only surfaces when the
 * issuer put the engagement in its headline or first lines. Elevate Service
 * Group did not — its IR agreement was the fifth section of a "corporate
 * updates" release — and Google returned the wire copy for none of them.
 *
 * These queries instead ask for every Canadian-venture release of the last
 * two days on a wire we can read, by exchange token and wire name rather than
 * by subject, and leave the deciding to `isIrDisclosure` over the BODY. The
 * Globe and Mail carries the Newsfile, CNW, GlobeNewswire and Business Wire
 * releases of every Canadian-listed company and answers a server-side fetch;
 * newsfilecorp.com itself challenges our server, globenewswire.com and
 * businesswire.com refuse the connection — so the Globe is how those wires
 * are read. Each query is capped at 100 items by Google, hence the split by
 * exchange and wire (measured 2026-09-16: "TSXV" 72, "CSE:" 38, "Newsfile"
 * "TSXV" 40 — all under the cap).
 *
 * `when:2d` overlaps the nightly pass by a day on purpose; `ir_seen_items`
 * makes the overlap free.
 */
export const SWEEP_QUERIES = [
  'site:theglobeandmail.com "TSXV" when:2d',
  'site:theglobeandmail.com "TSX Venture" when:2d',
  'site:theglobeandmail.com "CSE:" when:2d',
  'site:theglobeandmail.com "Canadian Securities Exchange" when:2d',
  'site:theglobeandmail.com "Newsfile" when:2d',
  'site:theglobeandmail.com "CNW" when:2d',
  'site:newswire.ca "TSXV" when:2d',
  'site:newswire.ca "CSE" when:2d',
  'site:accessnewswire.com "TSXV" when:2d',
  'site:accessnewswire.com "CSE" when:2d',
];

/**
 * Wires with an RSS feed of their own that the server can read. No Google
 * in the loop: the item IS the publisher URL. TheNewswire is TSXV/CSE-heavy
 * (22 of 45 items mentioned the TSXV when this was added) and its feed covers
 * about five days.
 */
export const DIRECT_FEEDS: Array<{ url: string; source: string }> = [
  { url: 'https://www.thenewswire.com/rss', source: 'TheNewswire' },
];

/**
 * Wires that serve the full release text to a plain GET. Anything else
 * (Yahoo, TradingView, StockTitan, aggregator summaries) either blocks
 * server-side fetches or paraphrases the release — and a paraphrase must never
 * become a parsed contract row, because the numbers are the product.
 */
const FULL_TEXT_HOSTS: Record<string, number> = {
  'www.newsfilecorp.com': 15_000,
  'www.globenewswire.com': 3000,
  'www.accessnewswire.com': 3000,
  'www.prnewswire.com': 3000,
  'www.newswire.ca': 3000,
  'www.juniorminingnetwork.com': 3000,
  'investingnews.com': 3000,
  'www.theglobeandmail.com': 3000,
  'www.businesswire.com': 3000,
  'www.thenewswire.com': 3000,
  'thenewswire.com': 3000,
  'www.stockhouse.com': 3000,
};

@Injectable()
export class IrDiscoveryService {
  private readonly log = new Logger(IrDiscoveryService.name);
  /** Per-host last-fetch clock. Newsfile sits behind an AWS WAF that
   *  challenges bursts — it answered 200 for the first handful of requests
   *  during R&D and then served a JS challenge for everything after, so the
   *  pacing below is a correctness requirement, not politeness theatre. */
  private lastFetch = new Map<string, number>();
  /** Hosts that answered with a challenge, and when they may be tried again.
   *  Kept apart from `lastFetch` on purpose — see `fetchRelease`. */
  private blockedUntil = new Map<string, number>();

  // ── Discovery ──────────────────────────────────────────────────────────

  async discover(): Promise<DiscoveredItem[]> {
    const seen = new Map<string, DiscoveredItem>();
    const add = (items: DiscoveredItem[]) => {
      let n = 0;
      for (const it of items) {
        if (seen.has(it.guid)) continue;
        seen.set(it.guid, it);
        n++;
      }
      return n;
    };
    let phrased = 0;
    for (const query of DISCOVERY_QUERIES) phrased += add(await this.search(query));
    let swept = 0;
    for (const query of SWEEP_QUERIES) swept += add(await this.search(query, `sweep:${query}`));
    let fed = 0;
    for (const feed of DIRECT_FEEDS) fed += add(await this.feed(feed.url, feed.source));
    await this.followAggregators(seen);
    this.log.log(`discovery: ${phrased} from phrase queries, ${swept} from the wire sweep, ${fed} from wire feeds`);
    return [...seen.values()];
  }

  /** A wire's own RSS feed: items carry the publisher URL, so nothing needs
   *  resolving. `guid` is that URL. */
  private async feed(feedUrl: string, source: string): Promise<DiscoveredItem[]> {
    const out: DiscoveredItem[] = [];
    try {
      const { data } = await axios.get<string>(feedUrl, {
        timeout: 30_000,
        responseType: 'text',
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' },
      });
      for (const raw of String(data).match(/<item>[\s\S]*?<\/item>/g) || []) {
        const link = decodeEntities(/<link>([\s\S]*?)<\/link>/.exec(raw)?.[1] || '').trim();
        const title = /<title>([\s\S]*?)<\/title>/.exec(raw)?.[1];
        if (!/^https?:\/\//.test(link) || !title) continue;
        const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(raw)?.[1] || '';
        const when = pub ? new Date(pub) : null;
        out.push({
          guid: link,
          url: link,
          title: decodeEntities(title),
          source,
          publishedAt: when && !isNaN(when.getTime()) ? when.toISOString() : null,
          query: `feed:${source}`,
        });
      }
    } catch (e: any) {
      this.log.warn(`wire feed failed (${feedUrl}): ${e?.message || e}`);
    }
    return out;
  }

  /** One Google News RSS query, as dated items. Failures are logged and
   *  yield nothing — a pass must not die on one bad query. */
  private async search(query: string, label = query): Promise<DiscoveredItem[]> {
    const out: DiscoveredItem[] = [];
    try {
      const url =
        'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-CA&gl=CA&ceid=CA:en';
      const { data } = await axios.get<string>(url, {
        timeout: 25_000,
        responseType: 'text',
        headers: { 'User-Agent': UA },
      });
      for (const raw of String(data).match(/<item>[\s\S]*?<\/item>/g) || []) {
        const guid = /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(raw)?.[1];
        const title = /<title>([\s\S]*?)<\/title>/.exec(raw)?.[1];
        if (!guid || !title) continue;
        const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(raw)?.[1] || '';
        const src = /<source[^>]*>([\s\S]*?)<\/source>/.exec(raw)?.[1] || '';
        const when = pub ? new Date(pub) : null;
        out.push({
          guid,
          title: decodeEntities(title),
          source: decodeEntities(src),
          publishedAt: when && !isNaN(when.getTime()) ? when.toISOString() : null,
          query: label,
        });
      }
    } catch (e: any) {
      this.log.warn(`discovery query failed (${query}): ${e?.message || e}`);
    }
    return out;
  }

  /** Aggregator headlines already chased, and when — one chase a week each. */
  private followed = new Map<string, number>();

  /**
   * Chase an aggregator's headline to the wire's own copy of the release.
   *
   * Why this exists (Elevate Service Group, TSXV: SERV, September 4, 2026):
   * the issuer's headline was "…Commences OTCQB Trading and Provides Corporate
   * Updates" — not one IR word in it — so Google News returned the wire's copy
   * for none of our queries. What it DID return was kalkine.ca's rewrite,
   * "…Grants Stock Options and Signs Investor Relations Agreement", and we
   * skip aggregators on purpose because a paraphrase must never become a
   * parsed row. Net effect: a US$250,000 IR agreement went unrecorded, and
   * every release shaped like it will too.
   *
   * The aggregator headline is still a perfectly good TIP. When it reads as
   * an IR engagement, search Google News for the issuer by name and take the
   * wire items published within a few days of it. Those are then resolved,
   * read and parsed exactly like anything else in the feed.
   */
  private async followAggregators(seen: Map<string, DiscoveredItem>): Promise<void> {
    const now = Date.now();
    const candidates = [...seen.values()].filter((it) => {
      if (!AGGREGATOR.test(it.source)) return false;
      if (!it.publishedAt || now - new Date(it.publishedAt).getTime() > 21 * DAY) return false;
      if (!hasIrParagraph(it.title, '')) return false;
      return now - (this.followed.get(it.guid) ?? 0) > 7 * DAY;
    });
    let chased = 0;
    let added = 0;
    for (const it of candidates) {
      if (chased >= MAX_FOLLOW_UPS) break;
      const issuer = issuerFromHeadline(it.title);
      if (!issuer) continue;
      this.followed.set(it.guid, now);
      chased++;
      const when = new Date(it.publishedAt!).getTime();
      for (const f of await this.search(`"${issuer}"`, `via:${it.source}`)) {
        if (seen.has(f.guid)) continue;
        if (!f.publishedAt || Math.abs(new Date(f.publishedAt).getTime() - when) > 4 * DAY) continue;
        if (!WIRE_SOURCE.test(f.source)) continue;
        seen.set(f.guid, f);
        added++;
      }
    }
    if (chased) this.log.log(`followed ${chased} aggregator headlines to the wire, ${added} wire items added`);
  }

  // ── Resolution ─────────────────────────────────────────────────────────

  /**
   * Google News hands out an encoded article id, not the publisher URL, and
   * following it lands on an interstitial. The documented way back to the real
   * URL is the same call the interstitial itself makes: read the per-article
   * signature and timestamp off the article page, then ask the batchexecute
   * endpoint to resolve them.
   *
   * The signature is PER ARTICLE. Caching one and reusing it across items
   * returns nothing for every other item — that failure looks exactly like a
   * dead resolver, so it is worth stating plainly here.
   */
  async resolveUrl(guid: string): Promise<string | null> {
    try {
      const { data: page } = await axios.get<string>(
        `https://news.google.com/rss/articles/${guid}?oc=5`,
        { timeout: 25_000, responseType: 'text', headers: { 'User-Agent': UA } },
      );
      const sg = /data-n-a-sg="([^"]+)"/.exec(String(page))?.[1];
      const ts = /data-n-a-ts="([^"]+)"/.exec(String(page))?.[1];
      if (!sg || !ts) return null;

      const inner = JSON.stringify([
        'garturlreq',
        [
          ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
          'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
        ],
        guid,
        Number(ts),
        sg,
      ]);
      const body =
        'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
      const { data: res } = await axios.post<string>(
        'https://news.google.com/_/DotsSplashUi/data/batchexecute',
        body,
        {
          timeout: 25_000,
          responseType: 'text',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
        },
      );
      return /garturlres\\",\\"(https?:\/\/[^\\"]+)/.exec(String(res))?.[1] ?? null;
    } catch (e: any) {
      this.log.debug(`resolve failed: ${e?.message || e}`);
      return null;
    }
  }

  // ── Body ───────────────────────────────────────────────────────────────

  isFullTextHost(url: string): boolean {
    try {
      return new URL(url).hostname in FULL_TEXT_HOSTS;
    } catch {
      return false;
    }
  }

  async fetchRelease(url: string): Promise<string | null> {
    return (await this.fetchReleaseWithMeta(url))?.text ?? null;
  }

  /** The release text plus what the page says about itself — its headline
   *  and publication time — for a release that arrives by URL rather than
   *  through the dated, titled Google News feed. */
  async fetchReleaseWithMeta(
    url: string,
  ): Promise<{ text: string; title: string | null; publishedAt: string | null } | null> {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    const gap = FULL_TEXT_HOSTS[host];
    if (!gap) return null;

    // A challenged host is SKIPPED, not waited on. The first production run
    // stalled here: the back-off was written into the same clock as the
    // pacing gap, so every later item on that host slept the full ten minutes
    // instead of moving on, and a pass that should have read twenty-five
    // releases sat on seven. Give up on this host for the rest of the pass and
    // spend the time on wires that are answering.
    const blocked = this.blockedUntil.get(host) ?? 0;
    if (Date.now() < blocked) return null;

    const since = Date.now() - (this.lastFetch.get(host) ?? 0);
    if (since < gap) await sleep(Math.min(gap - since, gap));
    this.lastFetch.set(host, Date.now());

    try {
      const { data } = await axios.get<string>(url, {
        timeout: 35_000,
        responseType: 'text',
        maxRedirects: 5,
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-CA,en;q=0.9',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      const html = String(data);
      // A WAF challenge is a 200 with a JS puzzle in it. Treat it as a miss
      // and back off rather than parsing the puzzle as a press release.
      if (html.includes('awsWafCookie') || html.includes('challenge-platform')) {
        this.log.warn(`bot challenge from ${host} — skipping it for the rest of this pass`);
        this.blockedUntil.set(host, Date.now() + 30 * 60_000);
        return null;
      }
      const text = htmlToText(html);
      if (text.length <= 1200) return null;
      return { text, title: pageTitle(html), publishedAt: pagePublished(html) };
    } catch (e: any) {
      this.log.debug(`fetch failed ${url}: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Put the items most likely to resolve to a readable wire first.
   *
   * Resolution costs two Google round-trips per item and most of the feed is
   * aggregators republishing the same releases. The RSS `source` name is a
   * free hint about where an item will land, so ordering by it means a capped
   * run spends its budget on releases it can actually read.
   */
  prioritise(items: DiscoveredItem[]): DiscoveredItem[] {
    const wire = (s: string) => {
      const m = WIRE_SOURCE.exec(s);
      return m ? m[0].toLowerCase().replace(/\s+/g, '') : null;
    };
    const aggregator = (s: string) => AGGREGATOR.test(s);

    // Group by the wire the RSS `source` name points at, then deal one item
    // from each group in turn. Two reasons, both learned in production: a
    // straight sort put every newsfilecorp item first and the run walked into
    // that host's bot challenge after seven reads; and the feed is mostly
    // aggregators republishing the same releases, so anything that cannot be
    // read full-text belongs at the back rather than in the middle.
    const groups = new Map<string, DiscoveredItem[]>();
    const tail: DiscoveredItem[] = [];
    for (const it of items) {
      const w = wire(it.source);
      if (w) {
        const arr = groups.get(w) ?? [];
        arr.push(it);
        groups.set(w, arr);
      } else if (!aggregator(it.source)) {
        tail.unshift(it); // unknown source: worth a try, after the known wires
      } else {
        tail.push(it);
      }
    }
    // Newest first within each wire. Google orders a query by relevance, so
    // without this a 2019 release could take a resolution slot ahead of last
    // night's — and the budget is what runs out first.
    const when = (it: DiscoveredItem) => (it.publishedAt ? new Date(it.publishedAt).getTime() : 0);
    const order = [...groups.values()].map((arr) => arr.sort((a, b) => when(b) - when(a)));
    const out: DiscoveredItem[] = [];
    for (let i = 0; out.length < items.length - tail.length; i++) {
      let moved = false;
      for (const arr of order) {
        if (i < arr.length) {
          out.push(arr[i]);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return [...out, ...tail];
  }

  /** Hosts currently refusing us, surfaced by `/promoter/status` so a thin
   *  night is explainable rather than mysterious. */
  blockedHosts(): string[] {
    const now = Date.now();
    return [...this.blockedUntil.entries()].filter(([, t]) => t > now).map(([h]) => h);
  }

  status() {
    return {
      queries: DISCOVERY_QUERIES.length,
      queryList: DISCOVERY_QUERIES,
      sweepQueries: SWEEP_QUERIES,
      wireFeeds: DIRECT_FEEDS.map((f) => f.url),
      fullTextHosts: Object.keys(FULL_TEXT_HOSTS),
      blockedHosts: this.blockedHosts(),
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/** The page's own headline: og:title, else <title>, minus the site suffix. */
export function pageTitle(html: string): string | null {
  const og =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{4,300})["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']{4,300})["'][^>]+property=["']og:title["']/i.exec(html);
  const raw = og?.[1] ?? /<title[^>]*>([\s\S]{4,300}?)<\/title>/i.exec(html)?.[1];
  if (!raw) return null;
  const t = decodeEntities(raw)
    .replace(/\s+/g, ' ')
    .replace(
      /\s*[-|–—]\s*(?:The Globe and Mail|Newsfile|TMX Newsfile|GlobeNewswire|Stockhouse|Junior Mining Network|Investing News Network|INN|Business Wire|ACCESS Newswire|PR Newswire|Cision)\s*$/i,
      '',
    )
    .trim();
  return t.length >= 4 ? t : null;
}

/** When the page says it was published — article meta or JSON-LD. */
export function pagePublished(html: string): string | null {
  const m =
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|pubdate|publish-date|date)["'][^>]+content=["']([^"']{8,40})["']/i.exec(
      html,
    ) ||
    /<meta[^>]+content=["']([^"']{8,40})["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished)["']/i.exec(
      html,
    ) ||
    /"datePublished"\s*:\s*"([^"]{8,40})"/.exec(html);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function htmlToText(html: string): string {
  let t = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|tr|h\d|li)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  t = t.replace(/[ \t ]+/g, ' ');
  t = t.replace(/\n\s*\n+/g, '\n\n');
  return t.trim();
}
