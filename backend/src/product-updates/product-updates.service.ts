import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { Company } from '../entities/company.entity';
import { DRIP_INTERVAL_DAYS, FEATURES, FeatureEmail, featureById } from './product-updates.content';

/**
 * Product Updates email list — George 2026-09-16.
 *
 * A dedicated list, separate from the site-wide `subscribers` sequence and
 * from the Promoter Score list: a welcome email at signup that says what the
 * list is for, then one short email every few days, each about one feature
 * — what it is, why it could be useful, how to use it, a screenshot, a link.
 *
 * Mechanics mirror the Promoter Score list (own table, per-address
 * unsubscribe token in every footer and in List-Unsubscribe, Resend for
 * transport, a send log). The drip is time-based per subscriber: feature N
 * becomes due N × DRIP_INTERVAL_DAYS after signup, and the scheduler sends at
 * most one feature email per subscriber per tick, inside daytime hours (UTC
 * 13–21, i.e. the Americas' working day), so a late enrolment never dumps a
 * backlog into one inbox.
 *
 * Kill switch: PRODUCT_UPDATES_DRIP_ENABLED=0 stops the automatic drip
 * (welcome, test sends and manual sends still work). Nothing else is gated —
 * the list starts empty, so nothing goes out until someone joins.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND = 'PRODUCT UPDATES';
const SIGNOFF_NAME = 'George Aizpurua';
const SIGNOFF_TITLE = 'CEO and Publisher, InsiderBuying.com';
const DAY_MS = 86_400_000;
/** UTC hours inside which the drip sends (start inclusive, end exclusive). */
const SEND_HOURS_UTC: [number, number] = [13, 21];
/** UTM tags so every click from these emails is attributable in GA4. */
const UTM = 'utm_source=product-updates&utm_medium=email';
/** Resend allows about two requests a second; back-to-back sends need a pause. */
const SEND_GAP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProductUpdateKind = 'welcome' | 'feature';

@Injectable()
export class ProductUpdatesService implements OnModuleInit {
  private readonly log = new Logger(ProductUpdatesService.name);
  private tableReady = false;

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTable();
    } catch (e: any) {
      this.log.error(`product_update tables check failed: ${e?.message || e}`);
    }
  }

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  // ── Config ───────────────────────────────────────────────────────────────

  get enabled(): boolean {
    return !!process.env.RESEND_API_KEY;
  }
  get dripEnabled(): boolean {
    return process.env.PRODUCT_UPDATES_DRIP_ENABLED !== '0';
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

  async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await this.q(`CREATE TABLE IF NOT EXISTS product_update_subscribers (
      id              bigserial PRIMARY KEY,
      email           varchar(320) NOT NULL UNIQUE,
      source          varchar(120),
      token           varchar(64) NOT NULL UNIQUE,
      created_at      timestamptz NOT NULL DEFAULT now(),
      welcomed_at     timestamptz,
      unsubscribed_at timestamptz,
      sent_steps      jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_sent_at    timestamptz,
      completed_at    timestamptz
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS product_update_sends (
      id          bigserial PRIMARY KEY,
      kind        varchar(24) NOT NULL,
      step        varchar(64),
      email       varchar(320) NOT NULL,
      subject     text,
      ok          boolean NOT NULL,
      error       text,
      sent_at     timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(
      `CREATE INDEX IF NOT EXISTS product_update_subscribers_active_idx
         ON product_update_subscribers (created_at) WHERE unsubscribed_at IS NULL AND completed_at IS NULL`,
    );
    this.tableReady = true;
  }

  // ── List management ──────────────────────────────────────────────────────

  /** Add an address (idempotent) and send the welcome email once. */
  async subscribe(
    emailRaw: string,
    source?: string,
  ): Promise<{ ok: boolean; existing: boolean; welcomed: boolean }> {
    await this.ensureTable();
    const email = (emailRaw || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || email.length > 320) return { ok: false, existing: false, welcomed: false };
    const token = randomBytes(24).toString('base64url');
    const rows: any[] = await this.q(
      `INSERT INTO product_update_subscribers (email, source, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         -- a returning unsubscriber who signs up again is back on the list,
         -- and the drip clock restarts for them from here
         unsubscribed_at = NULL,
         created_at = CASE WHEN product_update_subscribers.unsubscribed_at IS NOT NULL THEN now() ELSE product_update_subscribers.created_at END,
         sent_steps = CASE WHEN product_update_subscribers.unsubscribed_at IS NOT NULL THEN '[]'::jsonb ELSE product_update_subscribers.sent_steps END,
         completed_at = CASE WHEN product_update_subscribers.unsubscribed_at IS NOT NULL THEN NULL ELSE product_update_subscribers.completed_at END,
         source = COALESCE(product_update_subscribers.source, EXCLUDED.source)
       RETURNING id, email, token, welcomed_at, (xmax = 0) AS inserted`,
      [email, (source || '').slice(0, 120) || null, token],
    );
    const row = rows[0];
    let welcomed = false;
    if (row && !row.welcomed_at && this.enabled) {
      try {
        await this.send('welcome', null, row.email, this.welcomeSubject(), this.renderWelcome(row.token));
        await this.q(`UPDATE product_update_subscribers SET welcomed_at = now() WHERE id = $1`, [row.id]);
        welcomed = true;
      } catch (e: any) {
        this.log.warn(`welcome email failed for ${email}: ${e?.message || e}`);
      }
    }
    return { ok: true, existing: !row?.inserted, welcomed };
  }

  /** Admin bulk enrolment (a list George pastes). Each address gets the
   *  welcome and starts its own drip clock now. Returns per-address results. */
  async enroll(emails: string[], source = 'admin-enroll'): Promise<{ added: number; existing: number; invalid: number }> {
    let added = 0;
    let existing = 0;
    let invalid = 0;
    for (const e of (emails || []).slice(0, 2000)) {
      const r = await this.subscribe(e, source);
      if (!r.ok) invalid++;
      else if (r.existing) existing++;
      else added++;
      await sleep(SEND_GAP_MS);
    }
    return { added, existing, invalid };
  }

  async unsubscribe(token: string): Promise<boolean> {
    await this.ensureTable();
    if (!token || token.length > 64) return false;
    const r: any[] = await this.q(
      `UPDATE product_update_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, now())
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
              count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
              max(created_at) AS latest_signup,
              max(last_sent_at) AS last_feature_send
         FROM product_update_subscribers`,
    );
    const [s] = await this.q(
      `SELECT count(*)::int AS sends, count(*) FILTER (WHERE ok)::int AS ok, max(sent_at) AS last_send
         FROM product_update_sends`,
    );
    const perStep: any[] = await this.q(
      `SELECT step, count(*) FILTER (WHERE ok)::int AS sent FROM product_update_sends WHERE kind = 'feature' GROUP BY step ORDER BY step`,
    );
    return {
      resendConfigured: this.enabled,
      dripEnabled: this.dripEnabled,
      intervalDays: DRIP_INTERVAL_DAYS,
      sendHoursUtc: SEND_HOURS_UTC,
      list: c,
      sends: s,
      perStep,
      schedule: FEATURES.map((f) => ({ id: f.id, name: f.name, day: f.order * DRIP_INTERVAL_DAYS, subject: f.subject })),
    };
  }

  // ── Scheduler ────────────────────────────────────────────────────────────

  /** Every 15 minutes; sends only inside the daytime window. */
  @Cron('*/15 * * * *')
  async cron(): Promise<void> {
    if (!this.enabled || !this.dripEnabled) return;
    const h = new Date().getUTCHours();
    if (h < SEND_HOURS_UTC[0] || h >= SEND_HOURS_UTC[1]) return;
    await this.processDue().catch((e) => this.log.error(e?.message || e));
  }

  /** Send the next due feature email to every active subscriber who has one.
   *  One email per subscriber per call; idempotent via sent_steps. */
  async processDue(opts: { ignoreWindow?: boolean } = {}): Promise<{ sent: number; checked: number; skipped?: string }> {
    await this.ensureTable();
    if (!this.enabled) return { sent: 0, checked: 0, skipped: 'RESEND_API_KEY unset' };
    const rows: any[] = await this.q(
      `SELECT id, email, token, created_at, sent_steps
         FROM product_update_subscribers
        WHERE unsubscribed_at IS NULL AND completed_at IS NULL AND welcomed_at IS NOT NULL
        ORDER BY id`,
    );
    let sent = 0;
    const now = Date.now();
    for (const r of rows) {
      const sentSet = new Set<string>(Array.isArray(r.sent_steps) ? r.sent_steps : []);
      const elapsedDays = (now - new Date(r.created_at).getTime()) / DAY_MS;
      const due = FEATURES.filter((f) => !sentSet.has(f.id) && elapsedDays >= f.order * DRIP_INTERVAL_DAYS).sort(
        (a, b) => a.order - b.order,
      );
      if (!due.length) {
        if (FEATURES.every((f) => sentSet.has(f.id))) {
          await this.q(`UPDATE product_update_subscribers SET completed_at = now() WHERE id = $1`, [r.id]);
        }
        continue;
      }
      const step = due[0];
      try {
        await this.send('feature', step.id, r.email, step.subject, this.renderFeature(step, r.token));
        sentSet.add(step.id);
        const done = FEATURES.every((f) => sentSet.has(f.id));
        await this.q(
          `UPDATE product_update_subscribers
              SET sent_steps = $2::jsonb, last_sent_at = now(), completed_at = CASE WHEN $3 THEN now() ELSE completed_at END
            WHERE id = $1`,
          [r.id, JSON.stringify([...sentSet]), done],
        );
        sent++;
      } catch (e: any) {
        this.log.warn(`feature ${step.id} → ${r.email} failed: ${e?.message || e}`);
      }
      await sleep(SEND_GAP_MS);
    }
    if (sent) this.log.log(`product updates drip: sent=${sent} checked=${rows.length}`);
    return { sent, checked: rows.length };
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  private async send(kind: ProductUpdateKind, step: string | null, to: string, subject: string, html: string): Promise<void> {
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
      await this.q(`INSERT INTO product_update_sends (kind, step, email, subject, ok) VALUES ($1,$2,$3,$4,true)`, [
        kind,
        step,
        to,
        subject,
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      await this.q(`INSERT INTO product_update_sends (kind, step, email, subject, ok, error) VALUES ($1,$2,$3,$4,false,$5)`, [
        kind,
        step,
        to,
        subject,
        msg.slice(0, 500),
      ]);
      throw e;
    }
  }

  private unsubUrlIn(html: string): string | null {
    const m = html.match(/href="([^"]*\/product-updates\/unsubscribe\?token=[^"]+)"/);
    return m ? m[1] : null;
  }

  private unsubUrl(token: string): string {
    return `${this.siteUrl}/api/backend/product-updates/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  /** One-off send of the welcome or one feature email to one address (a review copy). */
  async testSend(step: string, to: string): Promise<{ ok: boolean; subject: string }> {
    const email = (to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error('valid "to" address required');
    const { subject, html } = this.preview(step);
    await this.send(step === 'welcome' ? 'welcome' : 'feature', step === 'welcome' ? null : step, email, subject, html);
    return { ok: true, subject };
  }

  /** Send every email in the sequence to one address, back to back (a full review set). */
  async testSendAll(to: string): Promise<{ sent: string[] }> {
    const sent: string[] = [];
    for (const step of ['welcome', ...FEATURES.map((f) => f.id)]) {
      await this.testSend(step, to);
      sent.push(step);
      await sleep(SEND_GAP_MS);
    }
    return { sent };
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /** Render the welcome or a feature email as HTML with a placeholder token. */
  preview(step: string): { subject: string; html: string } {
    if (step === 'welcome') return { subject: this.welcomeSubject(), html: this.renderWelcome('preview-token') };
    const f = featureById(step);
    if (!f) throw new Error(`unknown step '${step}'`);
    return { subject: f.subject, html: this.renderFeature(f, 'preview-token') };
  }

  steps(): Array<{ id: string; name: string; day: number }> {
    return [{ id: 'welcome', name: 'Welcome', day: 0 }, ...FEATURES.map((f) => ({ id: f.id, name: f.name, day: f.order * DRIP_INTERVAL_DAYS }))];
  }

  private link(path: string, campaign: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.siteUrl}${path}${sep}${UTM}&utm_campaign=${encodeURIComponent(campaign)}`;
  }

  private welcomeSubject(): string {
    return 'Welcome to Product Updates from InsiderBuying.com';
  }

  private renderWelcome(token: string): string {
    const list = FEATURES.map(
      (f) =>
        `<tr><td style="padding:6px 10px 6px 0;font-size:14px;color:#666;vertical-align:top;white-space:nowrap;">${f.order}.</td>` +
        `<td style="padding:6px 0;font-size:15px;line-height:1.45;"><a href="${this.link(f.path, 'welcome')}" style="color:#1a237e;font-weight:700;text-decoration:none;">${esc(f.name)}</a>` +
        `<span style="color:#555;"> — ${esc(f.preview.replace(/\.$/, ''))}</span></td></tr>`,
    ).join('');
    const body = [
      p('Hello,'),
      p('You’re on the Product Updates list. This is where I’ll share new features and capabilities on InsiderBuying.com so you can get the most out of the site.'),
      p(
        `Here is how it works. Every few days you’ll get one short email about one feature: what it is, what it does, why it could be useful to you, and how to use it, with a screenshot and a link that takes you straight to the page. No sales pitch.`,
      ),
      p('Over the next few weeks the emails will cover:'),
      `<table style="border-collapse:collapse;margin:0 0 18px;">${list}</table>`,
      p('If a feature isn’t relevant to you, skip that email. If you have a question about any of them, reply to this email and it reaches us.'),
      signoff(),
    ].join('\n');
    return this.shell(body, token, 'Where I’ll share new features and how to use them.');
  }

  private renderFeature(f: FeatureEmail, token: string): string {
    const url = this.link(f.path, f.id);
    const steps = f.how
      .map(
        (h, i) =>
          `<tr><td style="padding:4px 10px 4px 0;font-size:15px;color:#666;vertical-align:top;white-space:nowrap;">${i + 1}.</td>` +
          `<td style="padding:4px 0;font-size:15px;line-height:1.55;">${h}</td></tr>`,
      )
      .join('');
    const body = [
      p('Hello,'),
      `<h2 style="font-size:21px;line-height:1.3;margin:0 0 14px;color:#111;">${esc(f.name)}</h2>`,
      h3('What it is'),
      p(f.what),
      h3('Why it could be useful'),
      p(f.why),
      h3('How to use it'),
      `<table style="border-collapse:collapse;margin:0 0 18px;">${steps}</table>`,
      f.note ? `<p style="margin:0 0 18px;font-size:14px;color:#555;">${f.note}</p>` : '',
      `<a href="${url}" style="display:block;margin:0 0 18px;"><img src="${this.siteUrl}${f.image}" alt="${esc(f.imageAlt)}" width="576" style="display:block;width:100%;max-width:576px;height:auto;border:1px solid #e5e5e5;border-radius:6px;" /></a>`,
      `<p style="margin:0 0 ${f.also ? 8 : 18}px;"><a href="${url}" style="display:inline-block;background:#1a237e;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:11px 18px;border-radius:6px;">${esc(f.cta)} →</a></p>`,
      f.also ? `<p style="margin:0 0 18px;font-size:14px;"><a href="${this.link(f.also.path, f.id)}" style="color:#1a237e;font-weight:600;">${esc(f.also.label)} →</a></p>` : '',
      signoff(),
    ].join('\n');
    return this.shell(body, token, f.preview);
  }

  /** The house shell: masthead, navy rule, body, footer with the unsubscribe link. */
  private shell(bodyHtml: string, token: string, preheader: string): string {
    const unsub = this.unsubUrl(token);
    return (
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>` +
      `<div style="max-width:620px;margin:0 auto;padding:28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#111;">` +
      `<div style="text-align:center;margin:6px 0 2px;font-size:30px;font-weight:900;letter-spacing:1px;color:#000;">${BRAND}</div>` +
      `<div style="text-align:center;margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#666;">by InsiderBuying.com</div>` +
      `<div style="border-bottom:3px solid #1a237e;margin:0 0 26px;"></div>` +
      bodyHtml +
      `<div style="margin-top:34px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;line-height:1.6;">` +
      `You’re receiving this because you joined the Product Updates list at <a href="${this.siteUrl}" style="color:#999;">insiderbuying.com</a>. ` +
      `It covers new features and how to use them, nothing else. ` +
      `<a href="${unsub}" style="color:#999;">Unsubscribe</a>.<br>` +
      `Informational only, not investment advice.</div>` +
      `</div>`
    );
  }
}

function p(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`;
}
function h3(text: string): string {
  return `<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#666;margin:0 0 6px;">${text}</div>`;
}
function signoff(): string {
  return `<p style="margin:28px 0 4px;">${SIGNOFF_NAME}</p><p style="margin:0 0 16px;color:#444;">${SIGNOFF_TITLE}</p>`;
}
function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}
