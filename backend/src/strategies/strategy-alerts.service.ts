import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { strategyBySlug } from './registry';

/**
 * Brief v8 §5.3: "alerts when a strategy rebalances" — Premium.
 *
 * The alert fires on a CHANGE, never on a schedule. A weekly strategy
 * rebalances every week whether or not anything moved, and an email that says
 * "Congress Buys rebalanced" with the same twenty names as last week trains
 * people to ignore the next one. So this compares the holdings a run produced
 * against the holdings it produced last time and sends only what entered and
 * what left.
 */
@Injectable()
export class StrategyAlertsService {
  private readonly log = new Logger(StrategyAlertsService.name);

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companyRepo.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS strategy_alert_state (
      slug       text PRIMARY KEY,
      tickers    jsonb NOT NULL,
      notified_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  /** After the nightly recompute — the library must be fresh before it is read. */
  @Cron('10 5 * * *')
  async nightly(): Promise<void> {
    try {
      await this.run({ send: true });
    } catch (e: any) {
      this.log.warn(`strategy rebalance alerts failed: ${e?.message || e}`);
    }
  }

  async run(opts: { send?: boolean } = {}): Promise<any> {
    await this.ensureTables();
    const runs: Array<{ slug: string; holdings: any }> = await this.q(
      `SELECT slug, holdings FROM strategy_runs WHERE holdings IS NOT NULL`,
    );
    const prev: Array<{ slug: string; tickers: any }> = await this.q(
      `SELECT slug, tickers FROM strategy_alert_state`,
    );
    const prevBySlug = new Map(prev.map((r) => [r.slug, new Set<string>(r.tickers || [])]));

    const events: Array<{ slug: string; name: string; added: string[]; dropped: string[] }> = [];
    for (const r of runs) {
      const def = strategyBySlug(r.slug);
      if (!def) continue;
      const now = new Set<string>((r.holdings || []).map((h: any) => String(h.ticker).toUpperCase()));
      const before = prevBySlug.get(r.slug);
      // First time we have seen this strategy is not a rebalance. Record the
      // book silently, or every subscriber's first email is a wall of names
      // that did not move.
      if (!before) {
        await this.remember(r.slug, now);
        continue;
      }
      const added = [...now].filter((t) => !before.has(t));
      const dropped = [...before].filter((t) => !now.has(t));
      if (!added.length && !dropped.length) continue;
      events.push({ slug: r.slug, name: def.name, added, dropped });
      if (opts.send !== false) await this.remember(r.slug, now);
    }

    if (!events.length) return { events: 0, recipients: 0, sent: 0 };
    if (opts.send === false) return { events: events.length, recipients: 0, sent: 0, preview: events };

    const to = await this.recipients();
    const html = this.html(events);
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
              events.length === 1
                ? `${events[0].name} rebalanced`
                : `${events.length} strategies rebalanced`,
            html,
          },
          { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeout: 20_000 },
        );
        sent++;
      } catch (e: any) {
        this.log.warn(`strategy alert to ${email} failed: ${e?.message || e}`);
      }
    }
    this.log.log(`Strategy rebalance alerts: ${events.length} changes to ${sent} recipients`);
    return { events: events.length, recipients: to.length, sent };
  }

  private async remember(slug: string, tickers: Set<string>): Promise<void> {
    await this.q(
      `INSERT INTO strategy_alert_state (slug, tickers, notified_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (slug) DO UPDATE SET tickers = EXCLUDED.tickers, notified_at = now()`,
      [slug, JSON.stringify([...tickers])],
    );
  }

  private async recipients(): Promise<string[]> {
    const rows = await this.subscribers
      .createQueryBuilder('s')
      .select('s.email', 'email')
      .where("COALESCE(s.source, '') ILIKE :src", { src: '%alert%' })
      .getRawMany<{ email: string }>();
    return Array.from(new Set(rows.map((r) => r.email).filter(Boolean)));
  }

  private html(events: Array<{ slug: string; name: string; added: string[]; dropped: string[] }>): string {
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    const list = (xs: string[]) =>
      xs
        .map(
          (t) =>
            `<a href="${site}/companies/${t}" style="color:#0A1E3C;text-decoration:none;font-weight:600;">${t}</a>`,
        )
        .join(', ');
    const rows = events
      .map(
        (e) => `
      <tr><td style="padding:14px 0;border-top:1px solid #e5e5e5;">
        <div style="font:600 15px system-ui,sans-serif;color:#0A1E3C;">
          <a href="${site}/strategies/${e.slug}" style="color:#0A1E3C;text-decoration:none;">${e.name} rebalanced</a>
        </div>
        ${e.added.length ? `<div style="font:14px system-ui,sans-serif;color:#166534;margin-top:4px;">Added: ${list(e.added)}</div>` : ''}
        ${e.dropped.length ? `<div style="font:14px system-ui,sans-serif;color:#9a1c1c;margin-top:2px;">Dropped: ${list(e.dropped)}</div>` : ''}
      </td></tr>`,
      )
      .join('');
    return `<table style="width:100%;max-width:560px;margin:0 auto;">
      <tr><td style="font:700 18px system-ui,sans-serif;color:#0A1E3C;padding-bottom:6px;">Strategy rebalances</td></tr>
      ${rows}
      <tr><td style="padding-top:16px;font:12px system-ui,sans-serif;color:#666;">
        These are rules-based strategies computed from public filings. Performance figures on the
        site are labelled hypothetical, paper or live. Nothing here is investment advice.
      </td></tr>
    </table>`;
  }
}
