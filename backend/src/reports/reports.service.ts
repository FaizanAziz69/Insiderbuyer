import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
   * Delivery stub. No email/SMS provider is configured yet (no API keys), so
   * leads stay 'pending' in report_leads and the report renders on demand at
   * /report-requests/:id/preview. When a provider lands, implement this to
   * render renderInsiderReportHtml(await buildReportData(...)) into the send
   * call and flip status to 'sent'/'failed'.
   */
  private async deliver(lead: ReportLead): Promise<void> {
    this.logger.log(
      `Report lead stored (${lead.channel}: ${lead.contact} → ${lead.ticker}); ` +
        'delivery deferred — no email/SMS provider configured.',
    );
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
