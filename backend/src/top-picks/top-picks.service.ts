import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { plausibleTxSql } from '../iqs/tx-sanity';
import { BillingService } from '../billing/billing.service';
import { renderTopPicksPdf } from './report-pdf';

/** One row of the $3 report: a stock trading BELOW the average price the
 *  insiders paid, i.e. you can buy in cheaper than the people who filed. */
export interface TopPick {
  ticker: string;
  name: string;
  sector: string | null;
  /** Live share price on our record. */
  price: number;
  /** Σ(value) ÷ Σ(shares) across the qualifying open-market buys. */
  insiderAvgPrice: number;
  /** How much cheaper than the insiders you can buy, in percent. */
  discountPct: number;
  iqs: number;
  buyers: number;
  filings: number;
  totalValue: number;
  firstBuy: string;
  lastBuy: string;
  /** The largest single buy in the window — the name that anchors the row. */
  topInsider: string;
  topRole: string;
  topValue: number;
}

const LOOKBACK_DAYS = 180;
/** Ignore rows whose "discount" is really a stale price or a filer error. */
const MAX_DISCOUNT_PCT = 60;
const MIN_DISCOUNT_PCT = 2;
const MIN_TOTAL_VALUE = 100_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class TopPicksService {
  private readonly logger = new Logger(TopPicksService.name);
  private cache: { ts: number; rows: TopPick[] } | null = null;

  constructor(
    @InjectRepository(InsiderTransaction)
    private readonly txs: Repository<InsiderTransaction>,
    @InjectRepository(Subscriber)
    private readonly subscribers: Repository<Subscriber>,
    private readonly billing: BillingService,
  ) {}

  /** The report itself: stocks where the live price is below the weighted
   *  average price insiders paid in the last 180 days, ranked by Insider
   *  Score. Cached 6h — the underlying scores move once a day. */
  async getPicks(limit = 10): Promise<TopPick[]> {
    const hit = this.cache;
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows.slice(0, limit);

    const rows = await this.txs.query(
      `
      WITH buys AS (
        SELECT
          t.company_id,
          SUM(t."sharesBought" * t."pricePerShare")            AS value_sum,
          SUM(t."sharesBought")                                AS share_sum,
          COUNT(*)                                             AS filings,
          COUNT(DISTINCT t."insiderName")                      AS buyers,
          MIN(t."transactionDate")                             AS first_buy,
          MAX(t."transactionDate")                             AS last_buy
        FROM insider_transactions t
        JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '${LOOKBACK_DAYS} days')
          AND ${plausibleTxSql('t', 'c')}
        GROUP BY t.company_id
      ),
      latest AS (
        SELECT s.company_id, s.iqs
        FROM iqs_scores s
        WHERE s."asOfDate" = (
          SELECT MAX(s2."asOfDate") FROM iqs_scores s2 WHERE s2.company_id = s.company_id
        )
      ),
      biggest AS (
        SELECT DISTINCT ON (t.company_id)
          t.company_id,
          t."insiderName" AS insider_name,
          COALESCE(NULLIF(t."rawTitle", ''), t.role) AS insider_role,
          t."sharesBought" * t."pricePerShare" AS insider_value
        FROM insider_transactions t
        JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P'
          AND t."transactionDate" >= (CURRENT_DATE - INTERVAL '${LOOKBACK_DAYS} days')
          AND ${plausibleTxSql('t', 'c')}
        ORDER BY t.company_id, (t."sharesBought" * t."pricePerShare") DESC
      )
      SELECT
        c.ticker                                   AS ticker,
        c.name                                     AS name,
        c.sector                                   AS sector,
        c."lastPrice"::float8                      AS price,
        (b.value_sum / b.share_sum)::float8        AS "insiderAvgPrice",
        l.iqs::float8                              AS iqs,
        b.buyers::int                              AS buyers,
        b.filings::int                             AS filings,
        b.value_sum::float8                        AS "totalValue",
        b.first_buy                                AS "firstBuy",
        b.last_buy                                 AS "lastBuy",
        g.insider_name                             AS "topInsider",
        g.insider_role                             AS "topRole",
        g.insider_value::float8                    AS "topValue"
      FROM buys b
      JOIN companies c ON c.id = b.company_id
      JOIN latest l ON l.company_id = b.company_id
      LEFT JOIN biggest g ON g.company_id = b.company_id
      WHERE c."lastPrice" IS NOT NULL
        AND c."lastPrice" > 0
        AND b.share_sum > 0
        AND b.value_sum >= ${MIN_TOTAL_VALUE}
        -- the whole premise: the market price is BELOW what insiders paid
        AND c."lastPrice" < (b.value_sum / b.share_sum)
      ORDER BY l.iqs DESC, b.value_sum DESC
      LIMIT 60
      `,
    );

    const picks: TopPick[] = (rows as Record<string, unknown>[])
      .map((r) => {
        const price = Number(r.price);
        const avg = Number(r.insiderAvgPrice);
        const discountPct = avg > 0 ? ((avg - price) / avg) * 100 : 0;
        return {
          ticker: String(r.ticker),
          name: String(r.name),
          sector: (r.sector as string) || null,
          price,
          insiderAvgPrice: avg,
          discountPct,
          iqs: Math.round(Number(r.iqs)),
          buyers: Number(r.buyers),
          filings: Number(r.filings),
          totalValue: Number(r.totalValue),
          firstBuy: String(r.firstBuy).slice(0, 10),
          lastBuy: String(r.lastBuy).slice(0, 10),
          topInsider: titleCaseName(String(r.topInsider || '')),
          topRole: String(r.topRole || '').slice(0, 60),
          topValue: Number(r.topValue || 0),
        };
      })
      // A 90%-off "discount" is a pre-split price or a stale quote, not a
      // setup — the same lesson as the analyst price-target guard.
      .filter((p) => p.discountPct >= MIN_DISCOUNT_PCT && p.discountPct <= MAX_DISCOUNT_PCT)
      .slice(0, 10);

    this.cache = { ts: Date.now(), rows: picks };
    return picks.slice(0, limit);
  }

  /** What the landing page may show before payment: how many stocks are in
   *  this month's report and the shape of the setup — no tickers. */
  async getPreview(): Promise<{
    count: number;
    updated: string;
    maxDiscountPct: number;
    topIqs: number;
    totalInsiderValue: number;
  }> {
    const picks = await this.getPicks(10);
    return {
      count: picks.length,
      updated: new Date().toISOString().slice(0, 10),
      maxDiscountPct: picks.length ? Math.max(...picks.map((p) => p.discountPct)) : 0,
      topIqs: picks.length ? Math.max(...picks.map((p) => p.iqs)) : 0,
      totalInsiderValue: picks.reduce((a, p) => a + p.totalValue, 0),
    };
  }

  /** Stripe checkout for the $3 one-off. Guest flow: the email typed on the
   *  landing page is captured first (so an abandoned checkout still leaves a
   *  lead), then Stripe takes over. */
  async startCheckout(emailRaw: string): Promise<{ url: string }> {
    const email = (emailRaw || '').trim().toLowerCase();
    // The landing page is a single button (brief copy has no email field), so
    // an email here is optional: when we have one we pre-fill Stripe and keep
    // the lead even if checkout is abandoned; when we don't, Stripe collects
    // it and fulfilment reads it back off the session.
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (email && !valid) throw new BadRequestException('Valid email required');
    if (valid) await this.tagSubscriber(email, 'report-checkout-started');
    return this.billing.createOneTimeCheckout(
      'top-picks-report',
      valid ? email : null,
      '/thank-you-report',
    );
  }

  /** Fulfilment, driven by the thank-you page rather than a webhook: verify
   *  the session with Stripe, tag the buyer, email the PDF, hand the rows
   *  back so the page can show the report immediately. Idempotent per
   *  session id — a refresh re-renders but does not re-send. */
  async fulfil(sessionId: string): Promise<{
    paid: boolean;
    email: string | null;
    emailed: boolean;
    picks: TopPick[];
  }> {
    if (!sessionId) throw new BadRequestException('session_id required');
    const { paid, email } = await this.billing.verifyOneTimeSession(sessionId);
    if (!paid) return { paid: false, email, emailed: false, picks: [] };

    const picks = await this.getPicks(10);
    let emailed = false;
    if (email) {
      await this.tagSubscriber(email, 'purchased:$3-report');
      if (!this.fulfilled.has(sessionId)) {
        this.fulfilled.add(sessionId);
        emailed = await this.emailReport(email, picks).catch((e) => {
          this.logger.error(`report email failed: ${e?.message || e}`);
          this.fulfilled.delete(sessionId);
          return false;
        });
      }
    }
    return { paid: true, email, emailed, picks };
  }

  /** Session ids already delivered this process — a refresh of the thank-you
   *  page must not send a second copy. */
  private readonly fulfilled = new Set<string>();

  /** Upsert the lead with its funnel tag. `source` is our CRM tag field. */
  private async tagSubscriber(email: string, source: string): Promise<void> {
    const existing = await this.subscribers.findOne({ where: { email } });
    if (existing) {
      // A buyer outranks whatever brought them in — the purchase tag wins.
      if (source.startsWith('purchased:') && existing.source !== source) {
        existing.source = source.slice(0, 80);
        await this.subscribers.save(existing);
      }
      return;
    }
    await this.subscribers.save(
      this.subscribers.create({ email, source: source.slice(0, 80), phone: null }),
    );
  }

  /** Deliver the report: PDF attachment + the same table inline, so it is
   *  readable on a phone without opening the file. */
  private async emailReport(email: string, picks: TopPick[]): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY missing — report not emailed');
      return false;
    }
    const from = process.env.EMAIL_FROM || 'InsiderBuying.com <reports@insiderbuying.com>';
    const pdf = await renderTopPicksPdf(picks);
    await axios.post(
      'https://api.resend.com/emails',
      {
        from,
        to: [email],
        subject: 'Your report: stocks you can buy cheaper than the insiders did',
        html: reportEmailHtml(picks),
        attachments: [
          {
            filename: `insiderbuying-top-picks-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: pdf.toString('base64'),
          },
        ],
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30_000 },
    );
    this.logger.log(`report delivered → ${email} (${picks.length} picks)`);
    return true;
  }
}

/** "TAN LIP BU" → "Tan Lip Bu" (EDGAR files names in caps). */
function titleCaseName(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString('en-US')}`;

function reportEmailHtml(picks: TopPick[]): string {
  const rows = picks
    .map(
      (p) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e6e6e6;"><b>${p.ticker}</b><br>
          <span style="font-size:12px;color:#666;">${escapeHtml(p.name)}</span></td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6e6e6;text-align:right;">$${p.price.toFixed(2)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6e6e6;text-align:right;">$${p.insiderAvgPrice.toFixed(2)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6e6e6;text-align:right;color:#0a7d33;"><b>${p.discountPct.toFixed(1)}%</b></td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6e6e6;text-align:right;">${p.iqs}</td>
      </tr>`,
    )
    .join('');
  return (
    `<div style="max-width:640px;margin:0 auto;padding:26px 20px;font-family:Arial,Helvetica,sans-serif;color:#111;">` +
    `<div style="font-size:26px;font-weight:900;letter-spacing:0.5px;">InsiderBuying.com</div>` +
    `<div style="border-bottom:3px solid #1a237e;margin:8px 0 22px;"></div>` +
    `<h1 style="font-size:22px;margin:0 0 10px;">Stocks You Can Buy Cheaper Than the Insiders Did</h1>` +
    `<p style="font-size:15px;line-height:1.6;">Your report is attached as a PDF. Here it is inline as well — ` +
    `${picks.length} stocks where the current market price sits below the average price insiders actually paid.</p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0;">` +
    `<thead><tr style="text-align:left;background:#0D1F35;color:#fff;">` +
    `<th style="padding:9px 8px;">Stock</th><th style="padding:9px 8px;text-align:right;">Price now</th>` +
    `<th style="padding:9px 8px;text-align:right;">Insiders paid</th>` +
    `<th style="padding:9px 8px;text-align:right;">Discount</th>` +
    `<th style="padding:9px 8px;text-align:right;">IQS</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<p style="font-size:13px;line-height:1.6;color:#444;">Every figure comes from public SEC Form 4 filings. ` +
    `"Insiders paid" is the share-weighted average price across their open-market purchases in the last 180 days. ` +
    `Prices move — check the live page for each stock before acting.</p>` +
    `<p style="font-size:15px;margin-top:22px;">Want this in real time, the moment a filing lands? ` +
    `<a href="https://insiderbuying.com/premium" style="color:#1a237e;font-weight:bold;">Get Premium — $199/year</a>.</p>` +
    `<div style="margin-top:26px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;">` +
    `Not investment advice. Summarized from public SEC Form 4 filings. 30-day money-back guarantee — reply to this email.</div>` +
    `</div>`
  );
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

export { money as formatMoney };
