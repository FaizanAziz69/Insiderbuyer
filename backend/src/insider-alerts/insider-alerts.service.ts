import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import axios from 'axios';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { InsiderAlertDispatch } from '../entities/insider-alert-dispatch.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { IqsService } from '../iqs/iqs.service';

/**
 * IQS Alerts — the email delivery the /alerts page promises: "IQS Alerts
 * deliver the signal to your inbox within hours of an EDGAR filing — with the
 * IQS score, the dollar amount, and what it means."
 *
 * Runs hourly. Qualifying = an open-market BUY that is either a CEO/CFO
 * purchase or $1M+ — the same two categories the page itself filters on.
 *
 * Sending is OFF unless INSIDER_ALERT_EMAILS is set. Everything else (the
 * sweep, the dedupe record, the rendered digest) runs regardless, so the switch
 * can be flipped with the behaviour already proven by a dry run.
 */
const LOOKBACK_HOURS = 24;
const MAX_ITEMS = 25;
const BIG_BUY_USD = 1_000_000;
const EXEC_ROLES = /(chief executive|chief financial|\bceo\b|\bcfo\b)/i;

export interface AlertItem {
  transactionId: string;
  ticker: string | null;
  companyName: string;
  insiderName: string;
  role: string;
  value: number;
  transactionDate: string;
  filingUrl: string | null;
  iqs: number | null;
  tags: string[];
  meaning: string;
}

@Injectable()
export class InsiderAlertsService {
  private readonly log = new Logger(InsiderAlertsService.name);
  private running = false;
  lastRunAt: Date | null = null;

  constructor(
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(InsiderAlertDispatch)
    private readonly dispatch: Repository<InsiderAlertDispatch>,
    @InjectRepository(Subscriber)
    private readonly subscribers: Repository<Subscriber>,
    private readonly iqs: IqsService,
  ) {}

  /** Resend is configured AND sending has been switched on for alerts. */
  get sendingEnabled(): boolean {
    const flag = (process.env.INSIDER_ALERT_EMAILS || '').toLowerCase();
    return !!process.env.RESEND_API_KEY && (flag === '1' || flag === 'true');
  }

  @Cron('11 * * * *')
  async hourly() {
    await this.run().catch((e) => this.log.error(`IQS alert sweep: ${e?.message || e}`));
  }

  /**
   * Find, render and (when enabled) mail the filings that landed since the last
   * sweep. `dryRun` renders and returns without sending or recording.
   */
  async run(dryRun = false): Promise<{
    found: number;
    sent: number;
    recipients: number;
    skipped: string | null;
    items: AlertItem[];
  }> {
    if (this.running) {
      return { found: 0, sent: 0, recipients: 0, skipped: 'already running', items: [] };
    }
    this.running = true;
    try {
      const items = await this.collect();
      if (!items.length) {
        this.lastRunAt = new Date();
        return { found: 0, sent: 0, recipients: 0, skipped: null, items: [] };
      }
      const recipients = await this.recipients();
      if (dryRun) {
        return { found: items.length, sent: 0, recipients: recipients.length, skipped: 'dry run', items };
      }
      if (!this.sendingEnabled) {
        // Deliberately do NOT record a dispatch: once sending is switched on,
        // the backlog of the last 24h goes out rather than being lost.
        this.lastRunAt = new Date();
        this.log.log(`IQS alerts: ${items.length} qualifying filings held — sending is off.`);
        return {
          found: items.length,
          sent: 0,
          recipients: recipients.length,
          skipped: 'sending disabled (INSIDER_ALERT_EMAILS)',
          items,
        };
      }
      if (!recipients.length) {
        this.lastRunAt = new Date();
        return { found: items.length, sent: 0, recipients: 0, skipped: 'no subscribers', items };
      }

      const subject =
        items.length === 1
          ? `IQS Alert: ${items[0].ticker || items[0].companyName} — ${this.usd(items[0].value)} insider buy`
          : `IQS Alert: ${items.length} high-conviction insider buys`;
      const html = this.renderDigest(items);
      let sent = 0;
      for (const email of recipients) {
        try {
          await this.send(email, subject, html);
          sent++;
        } catch (e: any) {
          this.log.warn(`IQS alert to ${email} failed: ${e?.message || e}`);
        }
      }
      // Record once per filing regardless of per-recipient failures — a partial
      // send must not re-mail everyone on the next pass.
      await this.dispatch.save(
        items.map((i) =>
          this.dispatch.create({
            transactionId: i.transactionId,
            ticker: i.ticker,
            iqs: i.iqs,
            recipients: sent,
          }),
        ),
      );
      this.lastRunAt = new Date();
      this.log.log(`IQS alerts: ${items.length} filings → ${sent} inboxes.`);
      return { found: items.length, sent: items.length, recipients: sent, skipped: null, items };
    } finally {
      this.running = false;
    }
  }

  /** Qualifying, not-yet-alerted purchases from the last LOOKBACK_HOURS. */
  private async collect(): Promise<AlertItem[]> {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);
    const rows = await this.txRepo.find({
      where: { createdAt: MoreThan(since), transactionCode: 'P' },
      relations: { company: true },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    if (!rows.length) return [];

    const alreadySent = new Set(
      (
        await this.dispatch.find({
          where: { transactionId: In(rows.map((r) => r.id)) },
          select: { transactionId: true },
        })
      ).map((d) => d.transactionId),
    );

    // One rankings read gives every score we need for this batch.
    const ranked = await this.iqs
      .getRankings({ limit: 5000 })
      .catch(() => ({ rows: [] as any[] }));
    const iqsByTicker = new Map<string, number>();
    for (const r of ranked.rows || []) {
      if (r.ticker) iqsByTicker.set(String(r.ticker).toUpperCase(), Number(r.iqs));
    }

    const items: AlertItem[] = [];
    for (const t of rows) {
      if (alreadySent.has(t.id)) continue;
      const value = Number(t.totalValue) || 0;
      const roleText = `${t.role || ''} ${t.rawTitle || ''}`;
      const isExec = EXEC_ROLES.test(roleText);
      const isBig = value >= BIG_BUY_USD;
      if (!isExec && !isBig) continue;
      // "when the highest-conviction insider buys hit EDGAR" — EDGAR is the
      // SEC's system, so a German or Canadian listing in the feed is not an
      // EDGAR filing and does not belong in this email.
      if ((t.company?.exchange || 'US').toUpperCase() !== 'US') continue;
      const ticker = t.company?.ticker ? t.company.ticker.toUpperCase() : null;
      const iqs = ticker && iqsByTicker.has(ticker) ? Math.round(iqsByTicker.get(ticker)!) : null;
      const tags = [isExec ? 'EXEC BUY' : null, isBig ? 'BIG BUY' : null].filter(Boolean) as string[];
      items.push({
        transactionId: t.id,
        ticker,
        companyName: t.company?.name || ticker || '—',
        insiderName: t.insiderName,
        role: t.rawTitle || t.role || 'Insider',
        value,
        transactionDate: this.isoDate(t.transactionDate),
        filingUrl: t.filingUrl || null,
        iqs,
        tags,
        meaning: this.meaning({ isExec, isBig, iqs, value }),
      });
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  }

  /** The "what it means" line the page promises beside every alert. */
  private meaning(o: { isExec: boolean; isBig: boolean; iqs: number | null; value: number }): string {
    const parts: string[] = [];
    if (o.isExec) {
      parts.push('A C-suite officer bought their own stock on the open market');
    } else {
      parts.push('An insider bought on the open market');
    }
    if (o.isBig) parts.push(`a seven-figure commitment (${this.usd(o.value)})`);
    if (o.iqs != null) {
      parts.push(
        o.iqs >= 70
          ? `and our Insider Score of ${o.iqs} puts this among the highest-quality signals we track`
          : `with an Insider Score of ${o.iqs}`,
      );
    }
    return `${parts.join(', ')}.`;
  }

  /** Everyone who asked for alerts on /alerts. */
  private async recipients(): Promise<string[]> {
    const rows = await this.subscribers
      .createQueryBuilder('s')
      .select('s.email', 'email')
      .where("COALESCE(s.source, '') ILIKE :src", { src: '%alert%' })
      .getRawMany<{ email: string }>();
    return Array.from(new Set(rows.map((r) => r.email).filter(Boolean)));
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

  private renderDigest(items: AlertItem[]): string {
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    const card = (i: AlertItem) => `
      <tr><td style="padding:14px 0;border-top:1px solid #e5e5e5;">
        <div style="font-size:15px;font-weight:800;color:#111;">
          ${i.ticker ? `<a href="${site}/companies/${encodeURIComponent(i.ticker)}" style="color:#e02b2b;text-decoration:none;">${i.ticker}</a> · ` : ''}${this.esc(i.companyName)}
        </div>
        <div style="font-size:13px;color:#444;margin-top:2px;">
          ${this.esc(i.insiderName)} — ${this.esc(i.role)} · ${this.usd(i.value)} · ${i.transactionDate}
        </div>
        <div style="font-size:13px;color:#111;margin-top:6px;">
          ${i.iqs != null ? `<span style="display:inline-block;background:#d4a92a;color:#141620;font-weight:800;border-radius:4px;padding:2px 6px;margin-right:6px;">IQS ${i.iqs}</span>` : ''}
          ${i.tags.map((t) => `<span style="display:inline-block;background:#f1f2f4;color:#333;font-weight:700;font-size:11px;border-radius:4px;padding:3px 6px;margin-right:4px;">${t}</span>`).join('')}
        </div>
        <div style="font-size:13px;color:#555;margin-top:6px;line-height:1.5;">${this.esc(i.meaning)}</div>
        ${i.filingUrl ? `<div style="font-size:12px;margin-top:6px;"><a href="${i.filingUrl}" style="color:#666;">View the Form 4 on EDGAR →</a></div>` : ''}
      </td></tr>`;
    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#888;">IQS Alerts</div>
        <h1 style="font-size:22px;margin:6px 0 4px;">${items.length} new high-conviction insider ${items.length === 1 ? 'buy' : 'buys'}</h1>
        <p style="font-size:14px;color:#555;margin:0 0 8px;">
          Filed with the SEC in the last few hours, scored the moment they landed.
        </p>
        <table style="width:100%;border-collapse:collapse;">${items.map(card).join('')}</table>
        <p style="font-size:12px;color:#888;margin-top:22px;line-height:1.6;">
          You are receiving this because you signed up for insider alerts at
          <a href="${site}/alerts" style="color:#888;">insiderbuying.com/alerts</a>.
          Informational only — not financial advice.
        </p>
      </div>`;
  }

  private esc(s: string): string {
    return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string);
  }

  private usd(n: number): string {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return `$${Math.round(n)}`;
  }

  /** node-postgres hands back a Date for `date` columns; keep the ISO day. */
  private isoDate(d: Date | string): string {
    return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  }

  async status() {
    const dispatched = await this.dispatch.count();
    return {
      sendingEnabled: this.sendingEnabled,
      resendConfigured: !!process.env.RESEND_API_KEY,
      lastRunAt: this.lastRunAt,
      filingsAlerted: dispatched,
      recipients: (await this.recipients()).length,
      rules: { bigBuyUsd: BIG_BUY_USD, execRoles: 'CEO / CFO', lookbackHours: LOOKBACK_HOURS },
    };
  }
}
