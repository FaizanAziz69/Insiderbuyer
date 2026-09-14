import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

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
  /** Google News article id — stable, and our dedupe key before resolution. */
  guid: string;
  title: string;
  source: string;
  publishedAt: string | null;
  query: string;
}

export interface FetchedRelease extends DiscoveredItem {
  url: string;
  host: string;
  text: string;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

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
    for (const query of DISCOVERY_QUERIES) {
      try {
        const url =
          'https://news.google.com/rss/search?q=' +
          encodeURIComponent(query) +
          '&hl=en-CA&gl=CA&ceid=CA:en';
        const { data } = await axios.get<string>(url, {
          timeout: 25_000,
          responseType: 'text',
          headers: { 'User-Agent': UA },
        });
        for (const raw of String(data).match(/<item>[\s\S]*?<\/item>/g) || []) {
          const guid = /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(raw)?.[1];
          const title = /<title>([\s\S]*?)<\/title>/.exec(raw)?.[1];
          if (!guid || !title) continue;
          if (seen.has(guid)) continue;
          const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(raw)?.[1] || '';
          const src = /<source[^>]*>([\s\S]*?)<\/source>/.exec(raw)?.[1] || '';
          const when = pub ? new Date(pub) : null;
          seen.set(guid, {
            guid,
            title: decodeEntities(title),
            source: decodeEntities(src),
            publishedAt: when && !isNaN(when.getTime()) ? when.toISOString() : null,
            query,
          });
        }
      } catch (e: any) {
        this.log.warn(`discovery query failed (${query}): ${e?.message || e}`);
      }
    }
    return [...seen.values()];
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
      return text.length > 1200 ? text : null;
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
      const m = /newsfile|access ?newswire|globenewswire|globe newswire|pr ?newswire|cnw|business ?wire|newswire\.ca|investing news|junior mining|the newswire|globe and mail|stockhouse/i.exec(s);
      return m ? m[0].toLowerCase().replace(/\s+/g, '') : null;
    };
    const aggregator = (s: string) =>
      /yahoo|stock ?titan|kalkine|tradingview|citybiz|manila|scanx|pluang|simply wall|wealth ?awesome|issuewire/i.test(s);

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
    const order = [...groups.values()];
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
