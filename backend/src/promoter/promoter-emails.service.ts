import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { Company } from '../entities/company.entity';
import { PromoterService } from './promoter.service';

/**
 * Promoter Score email list — George 2026-09-16: "an email list and emails
 * dedicated specifically for this dataset … a welcome email, then the
 * standard newsletter email design but keep it simple, just a table that
 * shows the data set. Promoter Score and Top Promoters only."
 *
 * Its own table, not the site-wide `subscribers` list: a reader who wants the
 * IR-spend data has not asked for the insider-buying sequence, and the two
 * lists must be able to grow and shrink independently. Every address gets an
 * unsubscribe token at signup; the link is in every footer and in the
 * List-Unsubscribe header.
 *
 * Sending goes through Resend like every other mail here (same envelope,
 * same reply-to). The monthly issue is built from the same tables the pages
 * read, so the email can never say something the site does not.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND = 'PROMOTER SCORE';
const SIGNOFF_NAME = 'George Aizpurua';
const SIGNOFF_TITLE = 'CEO and Publisher, InsiderBuying.com';
/** Ranks shown open in the paygated tables; the rest carry the unlock row. */
const FREE_RANKS = 5;
const FREE_PROMOTERS = 2;

export type PromoterEmailKind = 'welcome' | 'monthly';

@Injectable()
export class PromoterEmailsService {
  private readonly log = new Logger(PromoterEmailsService.name);
  private tableReady = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly promoter: PromoterService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  // ── Config ───────────────────────────────────────────────────────────────

  get enabled(): boolean {
    return !!process.env.RESEND_API_KEY;
  }
  /** The monthly issue goes out automatically only once this is set — the
   *  client signs off the template first. Test sends and manual sends work
   *  regardless. */
  get monthlyEnabled(): boolean {
    return process.env.PROMOTER_NEWSLETTER_ENABLED === '1';
  }
  private get from(): string {
    return process.env.EMAIL_FROM || 'InsiderBuying.com <info@insiderbuying.com>';
  }
  private get replyTo(): string {
    return process.env.EMAIL_REPLY_TO || 'info@insiderbuying.com';
  }
  private get siteUrl(): string {
    return process.env.SITE_URL || 'https://insiderbuying.com';
  }
  private get premiumUrl(): string {
    return process.env.EMAIL_SALES_URL || `${this.siteUrl}/premium`;
  }

  async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await this.q(`CREATE TABLE IF NOT EXISTS promoter_email_subscribers (
      id              bigserial PRIMARY KEY,
      email           varchar(320) NOT NULL UNIQUE,
      source          varchar(120),
      token           varchar(64) NOT NULL UNIQUE,
      created_at      timestamptz NOT NULL DEFAULT now(),
      welcomed_at     timestamptz,
      unsubscribed_at timestamptz,
      last_issue_at   timestamptz
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS promoter_email_sends (
      id          bigserial PRIMARY KEY,
      kind        varchar(24) NOT NULL,
      email       varchar(320) NOT NULL,
      subject     text,
      ok          boolean NOT NULL,
      error       text,
      sent_at     timestamptz NOT NULL DEFAULT now()
    )`);
    this.tableReady = true;
  }

  // ── List management ──────────────────────────────────────────────────────

  /** Add an address (idempotent) and send the welcome email once. */
  async subscribe(emailRaw: string, source?: string): Promise<{ ok: boolean; existing: boolean; welcomed: boolean }> {
    await this.ensureTable();
    const email = (emailRaw || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || email.length > 320) return { ok: false, existing: false, welcomed: false };
    const token = randomBytes(24).toString('base64url');
    const rows: any[] = await this.q(
      `INSERT INTO promoter_email_subscribers (email, source, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         -- a returning unsubscriber who signs up again is back on the list
         unsubscribed_at = NULL,
         source = COALESCE(promoter_email_subscribers.source, EXCLUDED.source)
       RETURNING id, email, token, welcomed_at, (xmax = 0) AS inserted`,
      [email, (source || '').slice(0, 120) || null, token],
    );
    const row = rows[0];
    let welcomed = false;
    if (row && !row.welcomed_at && this.enabled) {
      try {
        await this.send('welcome', row.email, this.welcomeSubject(), this.renderWelcome(row.token));
        await this.q(`UPDATE promoter_email_subscribers SET welcomed_at = now() WHERE id = $1`, [row.id]);
        welcomed = true;
      } catch (e: any) {
        this.log.warn(`welcome email failed for ${email}: ${e?.message || e}`);
      }
    }
    return { ok: true, existing: !row?.inserted, welcomed };
  }

  async unsubscribe(token: string): Promise<boolean> {
    await this.ensureTable();
    if (!token || token.length > 64) return false;
    const r: any[] = await this.q(
      `UPDATE promoter_email_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, now())
        WHERE token = $1 RETURNING id`,
      [token],
    );
    return r.length > 0;
  }

  async status() {
    await this.ensureTable();
    const [c] = await this.q(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE unsubscribed_at IS NULL)::int AS active,
              count(*) FILTER (WHERE welcomed_at IS NOT NULL)::int AS welcomed,
              max(created_at) AS latest_signup,
              max(last_issue_at) AS last_issue
         FROM promoter_email_subscribers`,
    );
    const [s] = await this.q(
      `SELECT count(*)::int AS sends, count(*) FILTER (WHERE ok)::int AS ok, max(sent_at) AS last_send
         FROM promoter_email_sends`,
    );
    return {
      resendConfigured: this.enabled,
      monthlyAutomationEnabled: this.monthlyEnabled,
      list: c,
      sends: s,
    };
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  private async send(kind: PromoterEmailKind, to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) throw new Error('RESEND_API_KEY not configured');
    const unsubUrl = this.unsubUrlIn(html);
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: this.from,
          to: [to],
          reply_to: this.replyTo,
          subject,
          html,
          headers: unsubUrl ? { 'List-Unsubscribe': `<${unsubUrl}>` } : undefined,
        },
        { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeout: 20_000 },
      );
      await this.q(`INSERT INTO promoter_email_sends (kind, email, subject, ok) VALUES ($1,$2,$3,true)`, [kind, to, subject]);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      await this.q(`INSERT INTO promoter_email_sends (kind, email, subject, ok, error) VALUES ($1,$2,$3,false,$4)`, [
        kind,
        to,
        subject,
        msg.slice(0, 500),
      ]);
      throw e;
    }
  }

  private unsubUrlIn(html: string): string | null {
    const m = html.match(/href="([^"]*\/promoter\/emails\/unsubscribe\?token=[^"]+)"/);
    return m ? m[1] : null;
  }

  private unsubUrl(token: string): string {
    return `${this.siteUrl}/api/backend/promoter/emails/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  /** One-off send of either template to one address (a review copy). */
  async testSend(kind: PromoterEmailKind, to: string): Promise<{ ok: boolean; subject: string }> {
    const email = (to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error('valid "to" address required');
    const subject = kind === 'welcome' ? this.welcomeSubject() : (await this.buildMonthly()).subject;
    const html = kind === 'welcome' ? this.renderWelcome('preview-token') : (await this.buildMonthly()).html('preview-token');
    await this.send(kind, email, subject, html);
    return { ok: true, subject };
  }

  /** Send the monthly issue to every active address. */
  async sendMonthly(): Promise<{ sent: number; failed: number; skipped?: string }> {
    await this.ensureTable();
    if (!this.enabled) return { sent: 0, failed: 0, skipped: 'RESEND_API_KEY unset' };
    const issue = await this.buildMonthly();
    if (!issue.hasData) return { sent: 0, failed: 0, skipped: 'no campaigns to report' };
    const rows: any[] = await this.q(
      `SELECT id, email, token FROM promoter_email_subscribers WHERE unsubscribed_at IS NULL ORDER BY id`,
    );
    let sent = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await this.send('monthly', r.email, issue.subject, issue.html(r.token));
        await this.q(`UPDATE promoter_email_subscribers SET last_issue_at = now() WHERE id = $1`, [r.id]);
        sent++;
      } catch {
        failed++;
      }
    }
    this.log.log(`promoter monthly issue: sent=${sent} failed=${failed}`);
    return { sent, failed };
  }

  /** First of the month, 14:00 UTC (10:00 New York). Off until the client
   *  flips PROMOTER_NEWSLETTER_ENABLED=1. */
  @Cron('0 14 1 * *')
  async monthlyCron(): Promise<void> {
    if (!this.enabled || !this.monthlyEnabled) return;
    await this.sendMonthly().catch((e) => this.log.error(e?.message || e));
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /** Preview either template as HTML (admin). */
  async preview(kind: PromoterEmailKind): Promise<{ subject: string; html: string }> {
    if (kind === 'welcome') return { subject: this.welcomeSubject(), html: this.renderWelcome('preview-token') };
    const m = await this.buildMonthly();
    return { subject: m.subject, html: m.html('preview-token') };
  }

  private welcomeSubject(): string {
    return 'Welcome to Promoter Score — what venture issuers pay to be promoted';
  }

  private renderWelcome(token: string): string {
    const site = this.siteUrl;
    const body = [
      `<p style="margin:0 0 16px;">Hello,</p>`,
      `<p style="margin:0 0 16px;">You’re on the Promoter Score list. Here is what that means.</p>`,
      `<p style="margin:0 0 16px;">Canadian venture issuers on the TSX Venture and the CSE have to disclose every investor-relations, promotional and market-making agreement by news release — the firm they hired, the monthly fee, the term, and any options granted. Most people never read those releases. We read all of them.</p>`,
      `<p style="margin:0 0 16px;">From those disclosures we publish two datasets:</p>`,
      `<table style="width:100%;border-collapse:collapse;margin:0 0 18px;">` +
        `<tr><td style="padding:12px 14px;border:1px solid #e5e5e5;background:#fafafa;vertical-align:top;width:50%;">` +
        `<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#666;margin-bottom:4px;">Promoter Score</div>` +
        `<div style="font-size:15px;line-height:1.5;">How much each issuer is paying to be promoted this quarter, ranked, with what its stock did after every contract began.</div>` +
        `<div style="margin-top:8px;"><a href="${site}/promoter-score" style="color:#1a237e;font-weight:700;">Open the ranking →</a></div></td>` +
        `<td style="padding:12px 14px;border:1px solid #e5e5e5;border-left:0;background:#fafafa;vertical-align:top;width:50%;">` +
        `<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#666;margin-bottom:4px;">Top IR Promoters</div>` +
        `<div style="font-size:15px;line-height:1.5;">The IR firms themselves, ranked by their clients’ share-price return and trading-volume growth after each engagement.</div>` +
        `<div style="margin-top:8px;"><a href="${site}/top-ir-promoters" style="color:#1a237e;font-weight:700;">See the top promoters →</a></div></td></tr></table>`,
      `<p style="margin:0 0 16px;"><strong>What you’ll receive.</strong> One email at the start of each month: the new IR campaigns disclosed in the month just ended, the ten campaigns whose stocks moved most after the engagement began, and the top-ranked promoters — as plain tables, straight from the dataset. Nothing else goes to this list.</p>`,
      `<p style="margin:0 0 16px;">Paying for investor relations is legal, disclosed and ordinary. We report the spending and what followed it; we take no view on whether it is a good sign or a bad one. That judgment is yours.</p>`,
      `<p style="margin:0 0 16px;">The full ranking of promoters, with firm names and client tickers, is part of <a href="${this.premiumUrl}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">Insider Access</a>. The monthly email shows you the top of each table free.</p>`,
      `<p style="margin:28px 0 4px;">${SIGNOFF_NAME}</p><p style="margin:0 0 16px;color:#444;">${SIGNOFF_TITLE}</p>`,
    ].join('\n');
    return this.shell(body, token, 'You’re on the Promoter Score list. Here is what that means.');
  }

  /**
   * The monthly issue: three tables, nothing else. Built from the same rows
   * the pages read. Month = the calendar month that just ended (the cron runs
   * on the 1st), so "new campaigns" is a closed window and never changes
   * after it is sent.
   */
  async buildMonthly(): Promise<{ subject: string; hasData: boolean; html: (token: string) => string }> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // 1. New campaigns disclosed in the month.
    const newRows: any[] = await this.q(
      `SELECT a.ticker, COALESCE(i.name, a.issuer_name) AS issuer, a.provider_name, a.start_date,
              a.monthly_fee_cad::float8 AS monthly_fee_cad, a.term_months, d.published_at
         FROM ir_agreements a
         JOIN ir_disclosures d ON d.id = a.disclosure_id
         LEFT JOIN ir_issuers i ON i.ticker = a.ticker
        WHERE a.status <> 'rejected' AND a.provider_slug IS NOT NULL
          AND d.published_at >= $1 AND d.published_at < $2
        ORDER BY d.published_at DESC
        LIMIT 40`,
      [monthStart.toISOString(), monthEnd.toISOString()],
    );

    // 2. Top 10 campaigns by post-engagement return: contracts that started in
    //    the trailing six months and have a price, ranked on the 90-day figure
    //    where it has elapsed, else since start.
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
    const topRows: any[] = await this.q(
      `SELECT a.ticker, COALESCE(i.name, a.issuer_name) AS issuer, a.provider_name, a.start_date,
              COALESCE(p.perf_90d, p.perf_now) AS ret,
              CASE WHEN p.perf_90d IS NOT NULL THEN '90d' ELSE 'since start' END AS win,
              COALESCE(p.vol_growth_90, p.vol_growth_30) AS vol
         FROM ir_agreements a
         JOIN ir_contract_perf p ON p.agreement_id = a.id
         LEFT JOIN ir_issuers i ON i.ticker = a.ticker
        WHERE a.status <> 'rejected' AND a.provider_slug IS NOT NULL
          AND p.perf_now IS NOT NULL AND a.start_date >= $1 AND a.start_date < $2
        ORDER BY COALESCE(p.perf_90d, p.perf_now) DESC
        LIMIT 10`,
      [iso(sixMonthsAgo), iso(monthEnd)],
    );

    // 3. Top promoters, from the same ranking the paid page uses.
    const promoters = (await this.promoter.topPromoters({ limit: 5 })).firms;

    const hasData = newRows.length > 0 || topRows.length > 0;
    const subject = `Promoter Score, ${monthLabel}: ${newRows.length} new IR campaign${newRows.length === 1 ? '' : 's'} and the month’s top movers`;

    const html = (token: string) => {
      const pct = (v: any) => {
        if (v == null) return '—';
        const n = Number(v);
        return `<span style="color:${n > 0 ? '#1b7f3b' : n < 0 ? '#c62828' : '#666'};font-weight:700;">${n > 0 ? '+' : ''}${(n * 100).toFixed(0)}%</span>`;
      };
      const money = (v: any) => {
        if (v == null) return '—';
        const n = Number(v);
        return n >= 1000 ? `C$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K/mo` : `C$${Math.round(n)}/mo`;
      };
      const date = (v: any) => {
        if (!v) return '—';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      };
      const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
      const issuerLink = (t: string, name: string) =>
        `<a href="${this.siteUrl}/promoter-score/${encodeURIComponent(t)}" style="color:#111;text-decoration:none;"><strong>${esc(t)}</strong></a>` +
        (name ? `<span style="color:#666;"> · ${esc(name).slice(0, 34)}</span>` : '');
      const lockCell = `<a href="${this.premiumUrl}" style="color:#e02b2b;font-weight:700;text-decoration:underline;">🔒 Unlock with Insider Access</a>`;
      const blurred = `<span style="letter-spacing:2px;color:#9aa1ad;">████████</span>`;

      const table = (title: string, intro: string, header: string[], rows: string[][], emptyText: string) =>
        `<h2 style="font-size:19px;margin:28px 0 4px;color:#111;">${title}</h2>` +
        `<p style="margin:0 0 10px;font-size:14px;color:#555;">${intro}</p>` +
        (rows.length
          ? `<table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #e5e5e5;">` +
            `<tr>${header.map((h) => `<th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:1px solid #e5e5e5;">${h}</th>`).join('')}</tr>` +
            rows
              .map(
                (cells) =>
                  `<tr style="border-top:1px solid #e5e5e5;">${cells.map((c) => `<td style="padding:8px 10px;font-size:14px;vertical-align:top;">${c}</td>`).join('')}</tr>`,
              )
              .join('') +
            `</table>`
          : `<p style="margin:0;font-size:14px;color:#888;">${emptyText}</p>`);

      const newTable = table(
        `New IR campaigns disclosed in ${monthLabel}`,
        'Every investor-relations or promotional agreement announced under TSXV Policy 3.4 or CSE rules last month.',
        ['Issuer', 'Hired', 'Fee', 'Start'],
        newRows.map((r) => [issuerLink(r.ticker, r.issuer), esc(r.provider_name), money(r.monthly_fee_cad), date(r.start_date)]),
        'No new agreements were disclosed last month.',
      );

      const topTable = table(
        'Top 10 campaigns by what the stock did next',
        'Contracts that began in the past six months, ranked by the client’s share-price change 90 days after the start (since start where 90 days have not passed). The move followed the engagement; we do not claim it was caused by it.',
        ['#', 'Issuer', 'Hired', 'Return', 'Volume'],
        topRows.map((r, i) =>
          i < FREE_RANKS
            ? [String(i + 1), issuerLink(r.ticker, r.issuer), esc(r.provider_name), `${pct(r.ret)}<br><span style="font-size:11px;color:#888;">${r.win}</span>`, pct(r.vol)]
            : [String(i + 1), blurred, lockCell, pct(r.ret), pct(r.vol)],
        ),
        'No priced campaigns in the window yet.',
      );

      const promoTable = table(
        'Top IR Promoters',
        'IR firms ranked by their clients’ median return and trading-volume growth after engagement. Promoter Performance is a 0–100 percentile standing on the list.',
        ['#', 'IR firm', 'Campaigns', 'Client return', 'Volume', 'Score'],
        promoters.map((f, i) =>
          i < FREE_PROMOTERS
            ? [String(f.rank), `<strong>${esc(f.name)}</strong>`, String(f.campaigns), pct(f.postReturn), pct(f.medianVolumeGrowth), `<strong>${f.score ?? '—'}</strong>`]
            : [String(f.rank), blurred, String(f.campaigns), pct(f.postReturn), pct(f.medianVolumeGrowth), lockCell],
        ),
        'No ranked promoters yet.',
      );

      const body =
        `<p style="margin:0 0 16px;">Here is the Promoter Score dataset for ${monthLabel}: the IR campaigns issuers disclosed last month, the campaigns whose stocks moved most after the engagement began, and the promoters ranked by client results. Free readers see the top of each table; the full lists are part of <a href="${this.premiumUrl}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">Insider Access</a>.</p>` +
        newTable +
        topTable +
        promoTable +
        `<p style="margin:24px 0 6px;"><a href="${this.siteUrl}/promoter-score" style="color:#1a237e;font-weight:700;">Full Promoter Score ranking →</a> &nbsp;·&nbsp; <a href="${this.siteUrl}/top-ir-promoters" style="color:#1a237e;font-weight:700;">Top IR Promoters →</a></p>` +
        `<p style="margin:28px 0 4px;">${SIGNOFF_NAME}</p><p style="margin:0 0 16px;color:#444;">${SIGNOFF_TITLE}</p>`;
      return this.shell(body, token, `${newRows.length} new IR campaigns, the month’s top movers, and the top promoters.`);
    };

    return { subject, hasData, html };
  }

  /** The house shell: masthead, navy rule, body, footer with the unsubscribe link. */
  private shell(bodyHtml: string, token: string, preheader: string): string {
    const unsub = this.unsubUrl(token);
    return (
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` +
      `<div style="max-width:620px;margin:0 auto;padding:28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#111;">` +
      `<div style="text-align:center;margin:6px 0 2px;font-size:30px;font-weight:900;letter-spacing:1px;color:#000;">${BRAND}</div>` +
      `<div style="text-align:center;margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#666;">by InsiderBuying.com</div>` +
      `<div style="border-bottom:3px solid #1a237e;margin:0 0 26px;"></div>` +
      bodyHtml +
      `<div style="margin-top:34px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;line-height:1.6;">` +
      `You’re receiving this because you joined the Promoter Score list at <a href="${this.siteUrl}" style="color:#999;">insiderbuying.com</a>. ` +
      `This list covers the Promoter Score and Top IR Promoters datasets only. ` +
      `<a href="${unsub}" style="color:#999;">Unsubscribe</a>.<br>` +
      `Informational only, not investment advice.</div>` +
      `</div>`
    );
  }
}
