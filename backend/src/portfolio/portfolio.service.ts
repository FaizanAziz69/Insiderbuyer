import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PortfolioHolding } from '../entities/portfolio-holding.entity';
import {
  PortfolioAlert,
  PortfolioAlertKind,
} from '../entities/portfolio-alert.entity';
import { BillingService } from '../billing/billing.service';
import { SmsService } from './sms.service';
import { plausibleTxSql } from '../iqs/tx-sanity';

/** The brief: "Free users: allow adding up to 5 stocks." */
export const FREE_HOLDING_LIMIT = 5;
const PAID_HOLDING_LIMIT = 60;

/** Windows the alert rules use, matching the brief's own SMS mockups. */
const CLUSTER_DAYS = 8;
const CLUSTER_MIN_BUYERS = 3;
const PRE_EARNINGS_WINDOW_DAYS = 30;
const PRE_EARNINGS_LOOKAHEAD_DAYS = 30;
const QUIET_DAYS = 90;

export interface HoldingRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  /** Null for a free user — the score is the thing the tier unlocks. */
  iqs: number | null;
  locked: boolean;
  buyers90d: number;
  bought90d: number;
  lastBuy: string | null;
  addedAt: string;
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(PortfolioHolding)
    private readonly holdings: Repository<PortfolioHolding>,
    @InjectRepository(PortfolioAlert)
    private readonly alerts: Repository<PortfolioAlert>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly billing: BillingService,
    private readonly sms: SmsService,
  ) {}

  // ── Holdings ──────────────────────────────────────────────────────────

  /** The portfolio table. Insider Scores come back null and `locked: true`
   *  for a free user — the brief shows them blurred behind the upgrade. */
  async list(user: User): Promise<{ holdings: HoldingRow[]; active: boolean; limit: number }> {
    const active = this.billing.isPortfolioActive(user);
    const rows = await this.holdings.find({
      where: { userId: user.id },
      order: { createdAt: 'ASC' },
    });
    if (!rows.length) {
      return { holdings: [], active, limit: active ? PAID_HOLDING_LIMIT : FREE_HOLDING_LIMIT };
    }

    const tickers = rows.map((r) => r.ticker);
    const stats = await this.holdings.query(
      `
      WITH latest AS (
        SELECT s.company_id, s.iqs
        FROM iqs_scores s
        WHERE s."asOfDate" = (
          SELECT MAX(s2."asOfDate") FROM iqs_scores s2 WHERE s2.company_id = s.company_id
        )
      ),
      buys AS (
        SELECT t.company_id,
               COUNT(DISTINCT t."insiderName") AS buyers,
               SUM(t."sharesBought" * t."pricePerShare") AS bought,
               MAX(t."transactionDate") AS last_buy
        FROM insider_transactions t
        JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '90 days')
          AND ${plausibleTxSql('t', 'c')}
        GROUP BY t.company_id
      )
      SELECT c.ticker, c.name, c.sector, c."lastPrice"::float8 AS price,
             l.iqs::float8 AS iqs, COALESCE(b.buyers, 0)::int AS buyers,
             COALESCE(b.bought, 0)::float8 AS bought, b.last_buy AS "lastBuy"
      FROM companies c
      LEFT JOIN latest l ON l.company_id = c.id
      LEFT JOIN buys b ON b.company_id = c.id
      WHERE c.ticker = ANY($1)
      `,
      [tickers],
    );
    const byTicker = new Map(
      (stats as Record<string, unknown>[]).map((r) => [String(r.ticker).toUpperCase(), r]),
    );

    const holdings: HoldingRow[] = rows.map((r) => {
      const s = byTicker.get(r.ticker);
      const iqs = s?.iqs != null ? Math.round(Number(s.iqs)) : null;
      return {
        ticker: r.ticker,
        name: (s?.name as string) ?? null,
        sector: (s?.sector as string) ?? null,
        price: s?.price != null ? Number(s.price) : null,
        iqs: active ? iqs : null,
        locked: !active,
        buyers90d: s?.buyers != null ? Number(s.buyers) : 0,
        bought90d: s?.bought != null ? Number(s.bought) : 0,
        lastBuy: isoDate(s?.lastBuy),
        addedAt: r.createdAt.toISOString().slice(0, 10),
      };
    });
    return { holdings, active, limit: active ? PAID_HOLDING_LIMIT : FREE_HOLDING_LIMIT };
  }

  async add(user: User, tickerRaw: string): Promise<{ ok: true; count: number }> {
    const ticker = (tickerRaw || '').trim().toUpperCase().slice(0, 16);
    if (!/^[A-Z0-9.\-]{1,16}$/.test(ticker)) {
      throw new BadRequestException('Enter a valid ticker.');
    }
    const active = this.billing.isPortfolioActive(user);
    const limit = active ? PAID_HOLDING_LIMIT : FREE_HOLDING_LIMIT;
    const existing = await this.holdings.find({ where: { userId: user.id } });
    if (existing.some((h) => h.ticker === ticker)) {
      return { ok: true, count: existing.length };
    }
    if (existing.length >= limit) {
      throw new BadRequestException(
        active
          ? `Portfolios are capped at ${limit} stocks.`
          : `Free portfolios hold up to ${FREE_HOLDING_LIMIT} stocks. Unlock Portfolio Intelligence for more.`,
      );
    }
    await this.holdings.save(this.holdings.create({ userId: user.id, ticker }));
    return { ok: true, count: existing.length + 1 };
  }

  async remove(user: User, tickerRaw: string): Promise<{ ok: true }> {
    const ticker = (tickerRaw || '').trim().toUpperCase();
    await this.holdings.delete({ userId: user.id, ticker });
    return { ok: true };
  }

  // ── Phone collection (brief: on purchase, collect + confirm by SMS) ────

  async savePhone(user: User, raw: string): Promise<{ ok: boolean; sms: boolean; phone: string }> {
    const phone = this.sms.normalizePhone(raw);
    if (!phone) throw new BadRequestException('Enter a valid mobile number, including country code.');
    user.phone = phone;
    user.phoneConfirmedAt = new Date();
    await this.users.save(user);
    const res = await this.sms.sendConfirmation(phone);
    return { ok: true, sms: res.sent, phone };
  }

  async status(user: User) {
    const count = await this.holdings.count({ where: { userId: user.id } });
    return {
      active: this.billing.isPortfolioActive(user),
      status: user.portfolioStatus,
      renewsAt: user.portfolioCurrentPeriodEnd,
      phone: user.phone ? maskPhone(user.phone) : null,
      smsConfigured: this.sms.configured,
      holdings: count,
      freeLimit: FREE_HOLDING_LIMIT,
    };
  }

  // ── The alert engine (brief 3B: the four things subscribers get) ───────

  /** Hourly: every paid portfolio, every holding, the four signals. */
  @Cron('7 * * * *')
  async alertCron(): Promise<void> {
    try {
      const sent = await this.runAlerts();
      if (sent.evaluated) {
        this.logger.log(
          `Portfolio alerts: ${sent.matched} signals, ${sent.delivered} texted across ${sent.evaluated} portfolios`,
        );
      }
    } catch (e) {
      this.logger.error(`Portfolio alert run failed: ${(e as Error)?.message || e}`);
    }
  }

  /** Same run, callable from the admin endpoint for a manual sweep. */
  async runAlerts(): Promise<{ evaluated: number; matched: number; delivered: number }> {
    const subscribers = await this.users
      .createQueryBuilder('u')
      .where("u.portfolioStatus IN ('active','trialing','past_due')")
      .getMany();
    let evaluated = 0;
    let matched = 0;
    let delivered = 0;

    for (const user of subscribers) {
      if (!this.billing.isPortfolioActive(user)) continue;
      const rows = await this.holdings.find({ where: { userId: user.id } });
      if (!rows.length) continue;
      evaluated += 1;
      for (const holding of rows) {
        const signals = await this.signalsFor(holding.ticker);
        for (const signal of signals) {
          const already = await this.alerts.findOne({
            where: { userId: user.id, kind: signal.kind, dedupeKey: signal.dedupeKey },
          });
          if (already) continue;
          matched += 1;
          const res = user.phone
            ? await this.sms.send(user.phone, signal.body)
            : { sent: false };
          if (res.sent) delivered += 1;
          await this.alerts.save(
            this.alerts.create({
              userId: user.id,
              ticker: holding.ticker,
              kind: signal.kind,
              dedupeKey: signal.dedupeKey,
              body: signal.body,
              delivered: res.sent,
            }),
          );
        }
      }
    }
    return { evaluated, matched, delivered };
  }

  /**
   * The four alert types from the brief, in the order it lists them. Each
   * returns the exact text that gets texted; the wording follows the brief's
   * mockups, minus two things a live message must not do: it says "their"
   * rather than assuming an insider's gender, and it never claims a
   * past-quarters pattern we cannot verify (the brief's Earnings Alignment
   * Index does not exist yet).
   */
  private async signalsFor(
    ticker: string,
  ): Promise<Array<{ kind: PortfolioAlertKind; dedupeKey: string; body: string }>> {
    const out: Array<{ kind: PortfolioAlertKind; dedupeKey: string; body: string }> = [];
    const rows = await this.holdings.query(
      `
      WITH company AS (
        SELECT id, ticker, "lastPrice" FROM companies WHERE ticker = $1 LIMIT 1
      ),
      score AS (
        SELECT s.iqs::float8 AS iqs, s."asOfDate"
        FROM iqs_scores s JOIN company c ON c.id = s.company_id
        ORDER BY s."asOfDate" DESC LIMIT 1
      ),
      prev_score AS (
        SELECT s.iqs::float8 AS iqs
        FROM iqs_scores s JOIN company c ON c.id = s.company_id
        WHERE s."asOfDate" <= (CURRENT_DATE - INTERVAL '30 days')
        ORDER BY s."asOfDate" DESC LIMIT 1
      ),
      cluster AS (
        SELECT COUNT(DISTINCT t."insiderName")::int AS buyers,
               SUM(t."sharesBought" * t."pricePerShare")::float8 AS value,
               MAX(t."transactionDate") AS last_buy
        FROM insider_transactions t JOIN company c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '${CLUSTER_DAYS} days')
          AND (t."sharesBought" * t."pricePerShare") > 0
      ),
      ceo_first AS (
        SELECT t."accessionNumber" AS accession,
               (t."sharesBought" * t."pricePerShare")::float8 AS value,
               t."transactionDate" AS date
        FROM insider_transactions t JOIN company c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t.role = 'CEO'
          AND COALESCE(t."previousHoldings", 0) = 0
          AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '7 days')
        ORDER BY t."transactionDate" DESC LIMIT 1
      ),
      pre_earnings AS (
        SELECT e."reportDate" AS report_date,
               (SELECT SUM(t."sharesBought" * t."pricePerShare")::float8
                  FROM insider_transactions t JOIN company c2 ON c2.id = t.company_id
                 WHERE c2.ticker = $1 AND t."transactionCode" = 'P'
                   AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '${PRE_EARNINGS_WINDOW_DAYS} days')
               ) AS bought
        FROM earnings_events e
        WHERE e.ticker = $1
          AND e."reportDate" BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '${PRE_EARNINGS_LOOKAHEAD_DAYS} days')
        ORDER BY e."reportDate" ASC LIMIT 1
      ),
      quiet AS (
        SELECT MAX(t."transactionDate") AS last_buy
        FROM insider_transactions t JOIN company c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
      )
      SELECT (SELECT ticker FROM company) AS ticker,
             (SELECT iqs FROM score) AS iqs,
             (SELECT iqs FROM prev_score) AS prev_iqs,
             (SELECT buyers FROM cluster) AS cluster_buyers,
             (SELECT value FROM cluster) AS cluster_value,
             (SELECT last_buy FROM cluster) AS cluster_last_buy,
             (SELECT accession FROM ceo_first) AS ceo_accession,
             (SELECT value FROM ceo_first) AS ceo_value,
             (SELECT report_date FROM pre_earnings) AS earnings_date,
             (SELECT bought FROM pre_earnings) AS pre_earnings_bought,
             (SELECT last_buy FROM quiet) AS last_buy_any
      `,
      [ticker.toUpperCase()],
    );
    const r = (rows as Record<string, unknown>[])[0];
    if (!r || !r.ticker) return out;

    const sym = String(r.ticker).toUpperCase();
    const iqs = r.iqs != null ? Math.round(Number(r.iqs)) : null;
    const score = iqs != null ? `IQS Score: ${iqs}/100. ` : '';
    const link = `insiderbuying.com/companies/${sym}`;

    // 1 — cluster buy
    const buyers = Number(r.cluster_buyers || 0);
    if (buyers >= CLUSTER_MIN_BUYERS && Number(r.cluster_value) > 0) {
      out.push({
        kind: 'cluster-buy',
        dedupeKey: `${sym}:${isoDate(r.cluster_last_buy) ?? "recent"}:${buyers}`,
        body:
          `InsiderBuying.com: ALERT — ${buyers} insiders at $${sym} bought a combined ` +
          `${money(Number(r.cluster_value))} in the last ${CLUSTER_DAYS} days. ${score}` +
          `This is a cluster buy — the rarest and strongest insider signal. Full details: ${link}`,
      });
    }

    // 2 — CEO's first-ever open-market purchase
    if (r.ceo_accession) {
      out.push({
        kind: 'ceo-new-position',
        dedupeKey: String(r.ceo_accession),
        body:
          `InsiderBuying.com: ALERT — The CEO of $${sym} just made their FIRST-EVER ` +
          `open-market stock purchase. ${money(Number(r.ceo_value))}. ${score}` +
          `New positions by CEOs are one of the highest-conviction signals we track. ${link}`,
      });
    }

    // 3 — insider buying into earnings
    if (r.earnings_date && Number(r.pre_earnings_bought) > 0) {
      const days = daysUntil(isoDate(r.earnings_date) ?? "");
      out.push({
        kind: 'pre-earnings',
        dedupeKey: `${sym}:${isoDate(r.earnings_date) ?? "next"}`,
        body:
          `InsiderBuying.com: WATCH — Insiders at $${sym} bought ` +
          `${money(Number(r.pre_earnings_bought))} of stock ${days} days before earnings. ${score}` +
          `Earnings in ${days} days. ${link}`,
      });
    }

    // 4 — conviction fading
    const lastBuyAny = r.last_buy_any ? new Date(String(r.last_buy_any)) : null;
    const quietFor =
      lastBuyAny ? (Date.now() - lastBuyAny.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    const prev = r.prev_iqs != null ? Math.round(Number(r.prev_iqs)) : null;
    if (quietFor >= QUIET_DAYS && iqs != null && prev != null && iqs < prev) {
      out.push({
        kind: 'conviction-fading',
        dedupeKey: `${sym}:${new Date().toISOString().slice(0, 7)}`,
        body:
          `InsiderBuying.com: UPDATE — No insider buying at $${sym} in ${QUIET_DAYS} days. ` +
          `IQS Score dropped to ${iqs}/100 (was ${prev}). When insiders go quiet after heavy ` +
          `buying, it can signal the thesis is resolved. Details: ${link}`,
      });
    }

    return out;
  }
}

/** A SQL `date` arrives as a JS Date from node-postgres, so String(x) gives
 *  "Tue Aug 11 2026 …". Always format explicitly. */
function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function money(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function daysUntil(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((d - Date.now()) / 86_400_000));
}

function maskPhone(p: string): string {
  return p.length > 4 ? `${p.slice(0, p.length - 4).replace(/\d/g, '•')}${p.slice(-4)}` : p;
}
