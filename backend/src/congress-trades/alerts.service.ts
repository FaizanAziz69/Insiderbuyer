import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { STANDING_FRAME, checkCopy } from './cts';

/**
 * Top Ranking Congress Trades — Brief v5 §4, alerts.
 *
 * "Premium: new-flag alerts (email/SMS) when score ≥ threshold; internal Slack
 * feed for editorial to pick up data-article-worthy flags."
 *
 * Two things this file refuses to do, both for the same reason — §5 binds
 * every word this product emits, and an alert is the one surface nobody
 * proof-reads before it leaves:
 *
 *  • The body goes through `checkCopy()` before it is sent. A flag whose
 *    sentence trips the banned or intent vocabulary is skipped and logged, not
 *    softened and sent anyway.
 *  • Every alert carries the standing frame. A reader who sees a member's name
 *    and a dollar figure in their inbox, with none of the page's context
 *    around it, is exactly the reader §5 is written for.
 *
 * Only VERIFIED flags are alerted on. §7 P2 forbids a row rendering before the
 * Stage 5 agent has passed it, and an email is a render.
 */

const DEFAULT_THRESHOLD = 70;

@Injectable()
export class CongressAlertsService {
  private readonly log = new Logger(CongressAlertsService.name);
  private ready = false;
  private warnedNoSlack = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    // Keyed by flag id so a nightly re-run cannot mail the same flag twice.
    // A row here is a record that a person was told, which is not something to
    // repeat casually.
    await this.q(`CREATE TABLE IF NOT EXISTS ct_alerts_sent (
      flag_id     bigint PRIMARY KEY,
      score       real,
      recipients  int NOT NULL DEFAULT 0,
      slack       boolean NOT NULL DEFAULT false,
      sent_at     timestamptz NOT NULL DEFAULT now()
    )`);
    // Created here as well as in AwardsService: the threshold is read from it
    // on the first call, and boot order is not something this service should
    // have to depend on.
    await this.q(`CREATE TABLE IF NOT EXISTS ct_config (
      key        varchar(48) PRIMARY KEY,
      value      jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    this.ready = true;
  }

  // ── Threshold (§7 P3: "alert threshold configurable") ──────────────────

  async threshold(): Promise<number> {
    await this.ensureTables();
    const row = (await this.q(`SELECT value FROM ct_config WHERE key = 'alerts'`))?.[0];
    const v = Number(row?.value?.minScore);
    return isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_THRESHOLD;
  }

  async setThreshold(minScore: number, actor: string): Promise<{ minScore: number }> {
    await this.ensureTables();
    const v = Number(minScore);
    // An out-of-range value leaves the current threshold alone rather than
    // snapping to a default: a typo must never widen who gets emailed.
    if (!isFinite(v) || v < 0 || v > 100) return { minScore: await this.threshold() };
    await this.q(
      `INSERT INTO ct_config (key, value, updated_at) VALUES ('alerts', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({ minScore: v })],
    );
    this.log.log(`alert threshold set to ${v} by ${actor}`);
    return { minScore: v };
  }

  // ── Sending ────────────────────────────────────────────────────────────

  async run(limit = 25): Promise<{
    found: number;
    emailed: number;
    slack: number;
    recipients: number;
    skipped: string | null;
  }> {
    await this.ensureTables();
    const minScore = await this.threshold();
    const rows: any[] = await this.q(
      `SELECT f.id, f.member, f.party, f.chamber, f.ticker, f.company, f.agency, f.sub_agency,
              f.award_value::float8 AS award_value, f.award_date, f.committee, f.role,
              f.score, f.headline
         FROM ct_flags f
         LEFT JOIN ct_alerts_sent s ON s.flag_id = f.id
        WHERE f.status = 'verified' AND f.score >= $1 AND s.flag_id IS NULL
        ORDER BY f.score DESC
        LIMIT $2`,
      [minScore, Math.min(Math.max(limit, 1), 100)],
    );
    if (!rows.length) return { found: 0, emailed: 0, slack: 0, recipients: 0, skipped: null };

    const recipients = await this.recipients();
    let emailed = 0;
    let slack = 0;

    for (const f of rows) {
      const html = this.renderEmail(f);
      const copy = checkCopy(stripTags(html));
      if (!copy.ok) {
        this.log.error(
          `alert for flag ${f.id} withheld — copy check: ${copy.violations.map((v) => v.term).join(', ')}`,
        );
        continue;
      }

      let sentTo = 0;
      if (process.env.RESEND_API_KEY && recipients.length) {
        for (const email of recipients) {
          try {
            await this.send(email, this.subject(f), html);
            sentTo++;
          } catch (e: any) {
            this.log.warn(`alert email to ${email} failed: ${e?.message || e}`);
          }
        }
        if (sentTo) emailed++;
      }

      const toSlack = await this.slack(f);
      if (toSlack) slack++;

      await this.q(
        `INSERT INTO ct_alerts_sent (flag_id, score, recipients, slack)
         VALUES ($1,$2,$3,$4) ON CONFLICT (flag_id) DO NOTHING`,
        [f.id, f.score, sentTo, toSlack],
      );
    }

    this.log.log(
      `congress alerts: ${rows.length} flags at or above ${minScore} — ${emailed} emailed to ${recipients.length} subscribers, ${slack} to Slack`,
    );
    return {
      found: rows.length,
      emailed,
      slack,
      recipients: recipients.length,
      skipped: process.env.RESEND_API_KEY ? null : 'RESEND_API_KEY unset',
    };
  }

  /** The same audience the insider alerts use — everyone who asked for alerts
   *  on /alerts. There is one subscriber model on this site and a second one
   *  would drift out of step with it. */
  private async recipients(): Promise<string[]> {
    const rows = await this.subscribers
      .createQueryBuilder('s')
      .select('s.email', 'email')
      .where("COALESCE(s.source, '') ILIKE :src", { src: '%alert%' })
      .getRawMany<{ email: string }>();
    return Array.from(new Set(rows.map((r) => r.email).filter(Boolean)));
  }

  private subject(f: any): string {
    return `${f.member} · ${f.ticker} · ${usd(f.award_value)} ${f.sub_agency || f.agency} award`;
  }

  /**
   * The email states the three legs and nothing else. Every sentence here is
   * one of them, which is what makes §5's headline standard — name, neutral
   * verb, verifiable number — hold in an inbox as well as on the page.
   */
  private renderEmail(f: any): string {
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;">
  <div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#666;">
    Top Ranking Congress Trades
  </div>
  <div style="font-size:18px;font-weight:800;color:#111;margin-top:6px;">
    ${esc(f.member)} &middot; ${esc(f.ticker)}
  </div>
  <p style="font-size:14px;line-height:1.55;color:#222;margin:10px 0;">${esc(f.headline)}</p>
  <table style="font-size:13px;color:#333;border-collapse:collapse;margin-top:8px;">
    <tr><td style="padding:3px 12px 3px 0;color:#666;">Committee</td><td>${esc(f.committee)}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666;">Awarding agency</td><td>${esc(f.sub_agency || f.agency)}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666;">Award</td><td>${usd(f.award_value)}${f.award_date ? ` on ${String(f.award_date).slice(0, 10)}` : ''}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#666;">Congress Trade Score</td><td>${f.score == null ? '—' : Math.round(f.score)}</td></tr>
  </table>
  <p style="font-size:13px;margin:14px 0;">
    <a href="${site}/top-congress-trades" style="color:#005882;font-weight:700;">See the full evidence chain &rarr;</a>
  </p>
  <p style="font-size:11.5px;line-height:1.5;color:#666;border-top:1px solid #e5e5e5;padding-top:10px;">
    ${esc(STANDING_FRAME)}
  </p>
</div>`;
  }

  /**
   * §4's internal feed, "for editorial to pick up data-article-worthy flags".
   * Internal, so it is a plain summary rather than the email's framing — but
   * it still links out, because an editor acting on this needs the evidence
   * chain before they write anything.
   */
  private async slack(f: any): Promise<boolean> {
    const url = process.env.CONGRESS_SLACK_WEBHOOK;
    if (!url) {
      if (!this.warnedNoSlack) {
        this.warnedNoSlack = true;
        this.log.warn('CONGRESS_SLACK_WEBHOOK unset — the editorial feed is off.');
      }
      return false;
    }
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    try {
      await axios.post(
        url,
        {
          text:
            `*CTS ${f.score == null ? '—' : Math.round(f.score)}* · ${f.member} (${f.chamber || '—'}) · ` +
            `${f.ticker} · ${f.sub_agency || f.agency} · ${usd(f.award_value)}\n` +
            `${f.committee}\n${site}/top-congress-trades`,
        },
        { timeout: 15_000 },
      );
      return true;
    } catch (e: any) {
      this.log.warn(`Slack post failed: ${e?.message || e}`);
      return false;
    }
  }

  private async send(to: string, subject: string, html: string) {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'InsiderBuying.com <info@insiderbuying.com>',
        to: [to],
        reply_to: process.env.EMAIL_REPLY_TO || 'info@insiderbuying.com',
        subject,
        html,
      },
      { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeout: 20_000 },
    );
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT count(*)::int AS sent, max(sent_at) AS last_sent FROM ct_alerts_sent`,
    );
    return {
      ...c,
      minScore: await this.threshold(),
      resendConfigured: !!process.env.RESEND_API_KEY,
      slackConfigured: !!process.env.CONGRESS_SLACK_WEBHOOK,
    };
  }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

/** The copy check reads prose, not markup: tags left in would let a banned
 *  word hide inside an attribute and pass. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function usd(n: number | null): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}
