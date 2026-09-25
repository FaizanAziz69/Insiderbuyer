import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Subscriber } from '../entities/subscriber.entity';

/**
 * Brief v9 §7 alerts: "new A-grade CQS, score jumps ≥ 15 points, overlap flag
 * turning on."
 *
 * All three are transitions, not states, so each one is yesterday's row read
 * against today's. `cqs_scores` already keeps a short history per ticker for
 * exactly this — the board filters to the newest scoring date, the table does
 * not — so nothing new had to be stored.
 *
 * Sent only where there IS a previous row. A stock scoring for the first time
 * has not "jumped"; firing on it would make every new qualifier look like a
 * surge, which is the same error as treating a missing component as a zero.
 */

const JUMP_POINTS = 15;

interface CqsAlert {
  kind: 'gold' | 'jump' | 'overlap';
  ticker: string;
  headline: string;
  detail: string;
}

@Injectable()
export class CqsAlertsService {
  private readonly log = new Logger(CqsAlertsService.name);

  constructor(
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.subscribers.query(sql, params) as Promise<T>;
  }

  /** After the CQS recompute at 06:10. */
  @Cron('45 6 * * *')
  async daily(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.run().catch((e) => this.log.warn(`CQS alerts failed: ${e?.message || e}`));
  }

  /** The transitions, with no side effects — safe to call to preview. */
  async detect(): Promise<CqsAlert[]> {
    const rows = await this.q<any[]>(
      `WITH latest AS (
         SELECT DISTINCT ON (ticker) ticker, "asOfDate", cqs::float8 AS cqs, grade,
                "isGoldRing", "multiplierInsiderOverlap"::float8 AS overlap
           FROM cqs_scores ORDER BY ticker, "asOfDate" DESC
       ),
       prior AS (
         SELECT DISTINCT ON (s.ticker) s.ticker, s.cqs::float8 AS cqs, s.grade,
                s."isGoldRing", s."multiplierInsiderOverlap"::float8 AS overlap
           FROM cqs_scores s JOIN latest l ON l.ticker = s.ticker
          WHERE s."asOfDate" < l."asOfDate"
          ORDER BY s.ticker, s."asOfDate" DESC
       )
       SELECT l.ticker, l.cqs, l.grade, l."isGoldRing" AS gold_now, l.overlap AS overlap_now,
              p.cqs AS prev_cqs, p.grade AS prev_grade, p."isGoldRing" AS gold_prev,
              p.overlap AS overlap_prev
         FROM latest l JOIN prior p ON p.ticker = l.ticker`,
    );

    const out: CqsAlert[] = [];
    for (const r of rows) {
      if (r.gold_now && !r.gold_prev) {
        out.push({
          kind: 'gold',
          ticker: r.ticker,
          headline: `${r.ticker} reached grade ${r.grade}`,
          detail: `Congress Quality Score ${Number(r.cqs).toFixed(0)}, up from ${Number(r.prev_cqs).toFixed(0)} (${r.prev_grade}). A and above carries the gold tier.`,
        });
      }
      const delta = Number(r.cqs) - Number(r.prev_cqs);
      if (delta >= JUMP_POINTS) {
        out.push({
          kind: 'jump',
          ticker: r.ticker,
          headline: `${r.ticker} jumped ${delta.toFixed(0)} points`,
          detail: `Congress Quality Score ${Number(r.prev_cqs).toFixed(0)} → ${Number(r.cqs).toFixed(0)}.`,
        });
      }
      // 1.2 is the §3 insider-overlap multiplier; anything else is off.
      if (Number(r.overlap_now) > 1 && !(Number(r.overlap_prev) > 1)) {
        out.push({
          kind: 'overlap',
          ticker: r.ticker,
          headline: `${r.ticker}: corporate insiders are buying too`,
          detail: 'Congressional buying and an Insider Score of 70 or better now coincide on this stock.',
        });
      }
    }
    return out;
  }

  async run(opts: { send?: boolean } = {}): Promise<unknown> {
    const alerts = await this.detect();
    const send = opts.send !== false;
    if (!alerts.length) {
      this.log.log('CQS alerts: nothing to send');
      return { alerts: 0, recipients: 0, sent: 0 };
    }
    if (!send || !process.env.RESEND_API_KEY) {
      return { alerts: alerts.length, recipients: 0, sent: 0, preview: alerts.slice(0, 20) };
    }
    const to = await this.recipients();
    const html = this.html(alerts);
    let sent = 0;
    for (const email of to) {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: process.env.EMAIL_FROM || 'InsiderBuying.com <info@insiderbuying.com>',
            to: [email],
            reply_to: process.env.EMAIL_REPLY_TO || 'info@insiderbuying.com',
            subject:
              alerts.length === 1
                ? alerts[0].headline
                : `${alerts.length} Congress Quality Score alerts`,
            html,
          },
          { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeout: 20_000 },
        );
        sent++;
      } catch (e: any) {
        this.log.warn(`CQS alert to ${email} failed: ${e?.message || e}`);
      }
    }
    this.log.log(`CQS alerts: ${alerts.length} events to ${sent} recipients`);
    return { alerts: alerts.length, recipients: to.length, sent };
  }

  private async recipients(): Promise<string[]> {
    const rows = await this.subscribers
      .createQueryBuilder('s')
      .select('s.email', 'email')
      .where("COALESCE(s.source, '') ILIKE :src", { src: '%alert%' })
      .getRawMany<{ email: string }>();
    return Array.from(new Set(rows.map((r) => r.email).filter(Boolean)));
  }

  private html(alerts: CqsAlert[]): string {
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    const rows = alerts
      .map(
        (a) => `
      <tr><td style="padding:14px 0;border-top:1px solid #e5e5e5;">
        <div style="font:600 15px system-ui,sans-serif;color:#0A1E3C;">
          <a href="${site}/companies/${a.ticker}" style="color:#0A1E3C;text-decoration:none;">${a.headline}</a>
        </div>
        <div style="font:14px system-ui,sans-serif;color:#444;margin-top:4px;">${a.detail}</div>
      </td></tr>`,
      )
      .join('');
    return `<table style="max-width:560px;width:100%;border-collapse:collapse;">
      <tr><td style="font:700 18px system-ui,sans-serif;color:#0A1E3C;padding-bottom:6px;">Congress Quality Score</td></tr>
      ${rows}
      <tr><td style="padding-top:16px;font:12px system-ui,sans-serif;color:#777;">
        CQS measures the strength of a disclosed, lawful trading signal. It is not a measure of impropriety.
        <a href="${site}/cqs-index" style="color:#777;">See the full index</a>.
      </td></tr>
    </table>`;
  }
}
