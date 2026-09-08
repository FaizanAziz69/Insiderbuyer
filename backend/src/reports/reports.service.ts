import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportLead } from '../entities/report-lead.entity';
import { IqsService } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { ContentService } from '../content/content.service';
import {
  InsiderReportData,
  renderInsiderReportHtml,
} from './report-template';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+.-]{7,20}$/;
const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ReportLead)
    private readonly leads: Repository<ReportLead>,
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
    private readonly content: ContentService,
  ) {}

  /** Store an opt-in from the landing page and queue delivery. */
  async createLead(body: {
    ticker?: string;
    contact?: string;
    channel?: string;
    companyName?: string;
    source?: string;
  }) {
    const ticker = (body?.ticker || '').trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      throw new BadRequestException('Valid ticker required');
    }
    const channel = body?.channel === 'sms' ? 'sms' : 'email';
    const contact = (body?.contact || '').trim();
    if (channel === 'email' && !EMAIL_RE.test(contact.toLowerCase())) {
      throw new BadRequestException('Valid email address required');
    }
    if (channel === 'sms' && !PHONE_RE.test(contact)) {
      throw new BadRequestException('Valid phone number required');
    }

    // Same person re-requesting the same ticker → return the existing lead
    // instead of stacking duplicates in the send queue.
    const existing = await this.leads.findOne({
      where: { contact: channel === 'email' ? contact.toLowerCase() : contact, ticker },
    });
    if (existing) {
      return { ok: true, deduped: true, id: existing.id };
    }

    const lead = await this.leads.save(
      this.leads.create({
        ticker,
        companyName: body?.companyName?.slice(0, 200) || null,
        contact: channel === 'email' ? contact.toLowerCase() : contact,
        channel,
        status: 'pending',
        source: body?.source?.slice(0, 80) || 'insider-report-landing',
      }),
    );

    void this.deliver(lead);
    return { ok: true, id: lead.id };
  }

  /**
   * Deliver the report (client 2026-09-08: "they are getting immediately what
   * they signed up for"). Email goes out through Resend as the full rendered
   * report; there is no SMS provider, so an SMS lead is marked failed and the
   * landing page no longer offers that channel.
   */
  private async deliver(lead: ReportLead): Promise<void> {
    if (lead.channel !== 'email') {
      lead.status = 'failed';
      await this.leads.save(lead).catch(() => undefined);
      this.logger.warn(`Report lead ${lead.id}: SMS requested but no SMS provider is configured.`);
      return;
    }
    try {
      await this.sendReportEmail(lead.contact, lead.ticker);
      lead.status = 'sent';
    } catch (e: any) {
      lead.status = 'failed';
      this.logger.warn(`Report email failed (${lead.contact} → ${lead.ticker}): ${e?.message || e}`);
    }
    await this.leads.save(lead).catch(() => undefined);
  }

  /** Render and email the standard insider report for a ticker. Shared with
   *  the /reports/cta funnel (FulfilmentService). Throws when Resend is not
   *  configured so callers can record the failure. */
  async sendReportEmail(to: string, tickerRaw: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not configured');
    const ticker = (tickerRaw || '').trim().toUpperCase();
    const html = await this.renderForTicker(ticker);
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'InsiderBuying.com <info@insiderbuying.com>',
        to: [to],
        reply_to: process.env.EMAIL_REPLY_TO || 'info@insiderbuying.com',
        subject: `Your insider report: ${ticker}`,
        html,
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20_000 },
    );
    this.logger.log(`report email sent → ${to} (${ticker})`);
  }

  /** Render the standard report for a stored lead (also the future email body). */
  async renderForLead(id: string): Promise<string> {
    const lead = await this.leads.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Unknown report request');
    return this.renderForTicker(lead.ticker);
  }

  /** Render the standard report for any ticker (template preview). */
  async renderForTicker(ticker: string): Promise<string> {
    const data = await this.buildReportData(ticker);
    return renderInsiderReportHtml(data);
  }

  /** Pull everything the report template needs from the existing services. */
  async buildReportData(tickerRaw: string): Promise<InsiderReportData> {
    const ticker = (tickerRaw || '').trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) throw new BadRequestException('Valid ticker required');

    const [composite, detail, analystRows, activity] = await Promise.all([
      this.iqs.getCompositeScore(ticker).catch(() => null),
      this.iqs.getCompanyDetail(ticker).catch(() => null),
      this.marketStats.getAnalystRatings([ticker]).catch(() => []),
      this.content.getInsiderActivity(ticker).catch(() => null),
    ]);

    const company: any = (detail as any)?.company || null;
    const transactions: any[] = ((detail as any)?.transactions || []) as any[];

    const cutoff = Date.now() - 90 * 24 * 60 * 60_000;
    const recent = transactions.filter((t) => {
      const ms = new Date(t.transactionDate).getTime();
      return Number.isFinite(ms) && ms >= cutoff;
    });
    const buys = recent.filter((t) => t.transactionCode === 'P');
    const sells = recent.filter((t) => t.transactionCode === 'S');
    const sum = (rows: any[]) =>
      rows.reduce((a, t) => a + (Number(t.totalValue) || 0), 0);

    const analyst = (analystRows || []).find(
      (r) => r.symbol?.toUpperCase() === ticker,
    );

    return {
      ticker,
      companyName: company?.name || analyst?.name || ticker,
      sector: company?.sector ?? analyst?.sector ?? null,
      price:
        company?.lastPrice != null
          ? Number(company.lastPrice)
          : analyst?.price ?? null,
      marketCap: company?.marketCap != null ? Number(company.marketCap) : null,
      score: composite?.score ?? null,
      pillars: (composite?.pillars || []).map((p) => ({
        label: p.label,
        value: p.value,
        effectiveWeight: p.effectiveWeight,
      })),
      activity: activity || null,
      analyst: analyst
        ? {
            recommendation: analyst.recommendation,
            targetMean: analyst.targetMean,
            upsidePct: analyst.upsidePct,
            numAnalysts: analyst.numAnalysts,
          }
        : null,
      stats90d: {
        buys: buys.length,
        sells: sells.length,
        buyValue: sum(buys),
        sellValue: sum(sells),
        distinctBuyers: new Set(buys.map((t) => t.insiderName)).size,
      },
      transactions: transactions.slice(0, 12).map((t) => ({
        date: String(t.transactionDate).slice(0, 10),
        insider: t.insiderName || 'Insider',
        role: t.rawTitle || t.role || null,
        code: t.transactionCode,
        shares: Number(t.sharesBought) || 0,
        price: Number(t.pricePerShare) || 0,
        value: Number(t.totalValue) || 0,
      })),
      generatedAt: new Date().toISOString().slice(0, 10),
    };
  }
}
