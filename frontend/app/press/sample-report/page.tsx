"use client";
/**
 * press.insiderbuying.com/sample-report — Brief v3 §7 "Sample report".
 *
 * Every press order ends with a results report: where the story ran, the live
 * links, and the SEO data behind each placement. Until a client-approved
 * campaign report exists (§8), this page renders the SAME report format from
 * one of our own published editorial stories, pulled live from the content
 * API — so every figure on it is real and every link resolves. Opened in the
 * pricing/hero modal (SAMPLE_REPORT_URL) and reachable directly.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { SAMPLE_REPORT_SLUG } from "@/lib/press-config";

interface BlogDetail {
  slug: string;
  title: string;
  summary: string;
  body: string;
  ticker: string | null;
  sector: string | null;
  category: string | null;
  eyebrow: string | null;
  imageUrl: string | null;
  tags: string[] | null;
  featuredTickers: string[] | null;
  generatedAt: string;
  updatedAt: string;
}

const SITE = "https://insiderbuying.com";

export default function SampleReportPage() {
  const { data, error } = useSWR<BlogDetail>(`${API_BASE}/content/blogs/${encodeURIComponent(SAMPLE_REPORT_SLUG)}`, fetcher, {
    revalidateOnFocus: false,
  });

  const words = useMemo(() => {
    if (!data?.body) return null;
    return data.body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  }, [data?.body]);

  const articleUrl = `${SITE}/insights/${SAMPLE_REPORT_SLUG}`;
  const published = data ? new Date(data.generatedAt) : null;
  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "—";

  const placements = data
    ? [
        { where: "InsiderBuying.com — article page", url: articleUrl, status: "Live" },
        { where: "InsiderBuying.com — homepage Top Stories", url: `${SITE}/`, status: "Ran on publish day" },
        { where: "News & Analysis feed", url: `${SITE}/editorial`, status: "Live" },
        ...(data.ticker ? [{ where: `Company page — ${data.ticker}`, url: `${SITE}/companies/${data.ticker}`, status: "Live" }] : []),
      ]
    : [];

  const seo = data
    ? [
        ["Title tag", `${data.title} | InsiderBuying.com`],
        ["Meta description", data.summary],
        ["Canonical URL", articleUrl],
        ["Indexable", "Yes — in the XML sitemap, no noindex"],
        ["Word count", words ? words.toLocaleString("en-US") : "—"],
        ["Primary ticker", data.ticker ?? "—"],
        ["Section", data.category ?? data.eyebrow ?? "Editorial"],
        ["Structured data", "NewsArticle (JSON-LD) with headline, dates, publisher"],
      ]
    : [];

  return (
    <main className="psr" data-bare-page="">
      <header className="psr-head">
        <div className="psr-brand">
          <FileText size={18} aria-hidden /> InsiderBuying.com Press · Results Report
        </div>
        <span className="psr-tag">Sample</span>
      </header>

      <div className="psr-note">
        <strong>About this sample.</strong> This is the report format every press order receives when the campaign
        completes. To keep every figure real, it is rendered live from one of our own published editorial stories
        rather than a client campaign; client reports carry the client&rsquo;s company, ticker and partner-outlet
        placements in the same layout.
      </div>

      {error && <p className="psr-err">The sample could not be loaded right now. Please try again shortly.</p>}

      <section className="psr-card">
        <p className="psr-eyebrow">Story</p>
        <h1 className="psr-h1">{data?.title ?? (error ? "Story unavailable" : "Loading…")}</h1>
        {data?.summary && <p className="psr-sub">{data.summary}</p>}
        <dl className="psr-meta">
          <div><dt>Published</dt><dd>{fmt(published)}</dd></div>
          <div><dt>Ticker</dt><dd>{data?.ticker ?? "—"}</dd></div>
          <div><dt>Sector</dt><dd>{data?.sector ?? "—"}</dd></div>
          <div><dt>Status</dt><dd className="psr-ok">{data ? <><CheckCircle2 size={14} aria-hidden /> Published</> : "—"}</dd></div>
        </dl>
      </section>

      <section className="psr-card">
        <p className="psr-eyebrow">Placements — live links</p>
        <table className="psr-table">
          <thead><tr><th>Where</th><th>Link</th><th>Status</th></tr></thead>
          <tbody>
            {placements.map((p) => (
              <tr key={p.where}>
                <td>{p.where}</td>
                <td><a href={p.url} target="_blank" rel="noopener noreferrer">{p.url.replace("https://", "")} <ExternalLink size={12} aria-hidden /></a></td>
                <td><span className="psr-ok"><CheckCircle2 size={14} aria-hidden /> {p.status}</span></td>
              </tr>
            ))}
            {!data && !error && <tr><td colSpan={3}>Loading…</td></tr>}
          </tbody>
        </table>
        <p className="psr-fine">
          Partner news-outlet placements are listed here for client campaigns, one row per outlet, each with its
          live URL and the date it went up.
        </p>
      </section>

      <section className="psr-card">
        <p className="psr-eyebrow">SEO data</p>
        <dl className="psr-seo">
          {seo.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </section>

      <section className="psr-card psr-disc">
        <p className="psr-eyebrow">Disclosure</p>
        <p>
          Paid placements are labeled as sponsored or paid distribution per outlet rules and our disclosure policy.
          Paid placement never affects Insider Scores, Trade Grades or editorial rankings on InsiderBuying.com.
          This sample is an editorial story, not a paid placement.
        </p>
      </section>

      <style>{CSS}</style>
    </main>
  );
}

const CSS = `
.psr { --navy:#0A1E3C; --green:#0E9F6E; --gold:#C9A227; --ink:#0f1b2d; --body:#3a4a5f; --muted:#7D8A9C; --line:#E3E9F1; --card:#fff;
  max-width: 900px; margin: 0 auto; padding: 24px 20px 48px; font-family: var(--b2b-body, "Nunito Sans"), system-ui, sans-serif; color: var(--ink); background: #F7F9FC; }
.psr-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.psr-brand { display: inline-flex; align-items: center; gap: 8px; font-family: var(--b2b-display, Archivo), sans-serif; font-weight: 800; color: var(--navy); }
.psr-tag { font-family: var(--b2b-mono, monospace); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; background: var(--gold); color: var(--navy); border-radius: 999px; padding: 4px 10px; font-weight: 700; }
.psr-note { background: #FFF8E6; border: 1px solid #F1E2B3; border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.55; color: var(--body); margin-bottom: 16px; }
.psr-err { color: #B42318; }
.psr-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px; margin-bottom: 14px; }
.psr-eyebrow { font-family: var(--b2b-mono, monospace); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--green); margin: 0 0 10px; font-weight: 700; }
.psr-h1 { font-family: var(--b2b-display, Archivo), sans-serif; font-size: clamp(22px, 3vw, 30px); line-height: 1.15; margin: 0 0 8px; color: var(--navy); }
.psr-sub { margin: 0 0 16px; color: var(--body); line-height: 1.55; }
.psr-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 0; }
.psr-meta dt, .psr-seo dt { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }
.psr-meta dd, .psr-seo dd { margin: 0; font-weight: 700; color: var(--ink); font-size: 14px; word-break: break-word; }
.psr-ok { display: inline-flex; align-items: center; gap: 5px; color: var(--green); font-weight: 700; }
.psr-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.psr-table th { text-align: left; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--line); }
.psr-table td { padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.psr-table a { color: var(--navy); font-family: var(--b2b-mono, monospace); font-size: 12.5px; text-decoration: none; word-break: break-all; }
.psr-table a:hover { text-decoration: underline; }
.psr-fine { font-size: 12.5px; color: var(--muted); margin: 10px 0 0; line-height: 1.5; }
.psr-seo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; margin: 0; }
.psr-seo dd { font-weight: 600; }
.psr-disc p { margin: 0; font-size: 13.5px; color: var(--body); line-height: 1.55; }
@media (max-width: 640px) { .psr-meta { grid-template-columns: 1fr 1fr; } .psr-seo { grid-template-columns: 1fr; } .psr-table th:nth-child(3), .psr-table td:nth-child(3) { display: none; } }
`;
