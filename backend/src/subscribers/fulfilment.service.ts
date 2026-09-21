import { Injectable, Logger } from '@nestjs/common';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { FlowEmail } from '../email-flows/content/types';
import { InsiderAlertsService } from '../insider-alerts/insider-alerts.service';
import { ReportsService } from '../reports/reports.service';
import { LandingService } from '../reports/landing.service';
import { FreeReportService } from '../free-report/free-report.service';

/**
 * Client 2026-09-08: "Refine all the email pop ups, subscribe opt-ins, and
 * email flows so that they are getting immediately what they signed up for.
 * Create a clean email template that provides what we are promising in each
 * pop up, then our flows start after this initial email."
 *
 * One fulfilment email per opt-in source, sent the moment the row is stored,
 * BEFORE the welcome sequence (whose first step now waits 30 minutes):
 *
 *   popup-30s / popup-exit / home-right-rail / cta-TOP5
 *       → "This week's top insider buys" — the same top-10 body the Monday
 *         newsletter sends (ranks 1–5 open, 6–10 locked), so the promise
 *         "the top insider buys of the week, scored and ranked" is met now.
 *   alerts
 *       → "You're on the insider alerts list" — the latest qualifying CEO/CFO
 *         and $1M+ buys from the last 7 days, rendered as the real alert
 *         cards, so the reader sees exactly what the hourly engine will send.
 *   cta-<TICKER>
 *       → the standard insider report for that ticker (the same HTML the
 *         /insider-report landing delivers).
 *
 * Every other source (B2B lead, $3 report buyer, …) promised nothing beyond
 * the list, so nothing is sent here. Failures are logged, never thrown — the
 * subscribe request must succeed regardless.
 */
@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  constructor(
    private readonly emailFlows: EmailFlowsService,
    private readonly alerts: InsiderAlertsService,
    private readonly reports: ReportsService,
    private readonly freeReport: FreeReportService,
    private readonly landing: LandingService,
  ) {}

  /** Fire-and-forget: pick the email for `source` and send it. */
  fulfil(email: string, source: string | null): void {
    void this.send(email, source).catch((e) =>
      this.logger.warn(`fulfilment failed (${source} → ${email}): ${e?.message || e}`),
    );
  }

  private async send(email: string, sourceRaw: string | null): Promise<void> {
    const source = (sourceRaw || '').trim().toLowerCase();
    if (!source) return;
    if (source === 'alerts') return this.sendAlertsWelcome(email);
    if (source === 'free-report') return this.sendFreeReport(email);
    if (source === 'penny-spotlight') return this.sendPennySpotlight(email);
    if (source === 'popup-30s' || source === 'popup-exit' || source === 'home-right-rail' || source === 'cta-top5') {
      return this.sendWeeklyTopBuys(email, source);
    }
    if (source.startsWith('cta-')) {
      const ticker = source.slice(4).toUpperCase();
      if (/^[A-Z0-9.\-]{1,12}$/.test(ticker)) {
        await this.reports.sendReportEmail(email, ticker);
        this.logger.log(`fulfilled ${source} → ${email}: ticker report`);
      }
    }
  }

  private async sendWeeklyTopBuys(email: string, source: string): Promise<void> {
    const body = await this.emailFlows.buildWeeklyBody();
    if (!body) return;
    const step: FlowEmail = {
      id: `fulfil-weekly`,
      offsetMinutes: 0,
      brand: 'INSIDER BUYING',
      signoffTitle: 'CEO and Publisher, Insider Buying',
      subjects: [
        {
          subject: 'This week’s top insider buys, scored and ranked',
          preview: 'What you signed up for: the week’s highest Insider Scores, delivered now',
        },
      ],
      body: [
        `<p style="margin:0 0 14px;">You asked for this week’s top insider buys. Here they are, ranked by Insider Score, exactly as they stand today. You’ll get the fresh list every Monday.</p>`,
        body,
        'See you on the inside,',
        '__SIGNOFF__',
      ],
    };
    await this.emailFlows.sendOneOff(email, step);
    this.logger.log(`fulfilled ${source} → ${email}: weekly top buys`);
  }

  /** The "Get On The Inside" free investor report (George's lead-magnet
   *  document, 2026-09-16). The PDF travels AS AN ATTACHMENT — Faizan:
   *  "email mein http wala option nai hona chaiya, sirf pdf" — so the email
   *  carries no link to it at all. */
  private async sendFreeReport(email: string): Promise<void> {
    const pdf = await this.freeReport.pdf();
    const step: FlowEmail = {
      id: `fulfil-free-report`,
      offsetMinutes: 0,
      brand: 'INSIDER BUYING',
      signoffTitle: 'CEO and Publisher, Insider Buying',
      subjects: [
        {
          subject: 'Your free report: Get On The Inside',
          preview: 'A guide to following insider buying, plus 3 stocks insiders are buying right now',
        },
      ],
      body: [
        `<p style="margin:0 0 14px;">Here is the report you asked for: <strong>Get On The Inside: A Guide to Following Insider Buying, and 3 Stocks Insiders Are Buying Right Now</strong>. It is attached to this email as a PDF.</p>`,
        `<p style="margin:0 0 18px;">It explains how the insider buying signal works, why decades of research back it up, and walks through three current situations where executives are putting their own money into their company’s stock — with the filings behind each one.</p>`,
        `<p style="margin:0 0 14px;">Filings update daily. Before acting on anything in the report, check the current figures on InsiderBuying.com.</p>`,
        'See you on the inside,',
        '__SIGNOFF__',
      ],
    };
    await this.emailFlows.sendOneOff(email, step, null, [{ filename: 'InsiderBuying-Get-On-The-Inside.pdf', content: pdf }]);
    this.logger.log(`fulfilled free-report → ${email} (${pdf.length} bytes attached)`);
  }

  /** George 2026-09-21, the /welcome page CTA: "get our penny stock
   *  spotlight — one stock under $100M". One real name from our Form 4
   *  record: the sub-$100M company with the most open-market insider buying
   *  in the last 90 days. */
  private async sendPennySpotlight(email: string): Promise<void> {
    const pick = await this.landing.pennySpotlight();
    if (!pick) {
      this.logger.warn('penny-spotlight: no sub-$100M company with insider buying in the window');
      return;
    }
    const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
    const cap = pick.marketCap >= 1e6 ? `$${(pick.marketCap / 1e6).toFixed(1)} million` : usd(pick.marketCap);
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    const b = pick.biggest;
    const step: FlowEmail = {
      id: 'penny-spotlight',
      offsetMinutes: 0,
      brand: 'INSIDER BUYING',
      signoffTitle: 'CEO and Publisher, Insider Buying',
      subjects: [
        { subject: `Your Penny Stock Spotlight: ${pick.ticker}, one stock under $100M`, preview: 'Where the insiders are buying small' },
      ],
      body: [
        'Hello {{FIRSTNAME}},',
        'You asked for our Penny Stock Spotlight, so here it is: one company under $100 million in market value where the insiders have been buying with their own money.',
        `<h2 style="margin:18px 0 6px;font-size:22px;">${pick.name} (${pick.ticker})</h2>`,
        `<p style="margin:0 0 16px;color:#444;">${pick.sector || 'Sector not classified'} · Market cap about ${cap}${pick.lastPrice ? ` · Last price $${pick.lastPrice.toFixed(2)}` : ''}</p>`,
        `Over the last 90 days, ${pick.insiders === 1 ? 'one insider' : `${pick.insiders} insiders`} made ${pick.buys === 1 ? 'one open-market purchase' : `${pick.buys} open-market purchases`} totalling <strong>${usd(pick.totalBought)}</strong>, according to SEC Form 4 filings reviewed by InsiderBuying.com.`,
        b
          ? `The largest single purchase came from <strong>${b.insiderName}</strong>${b.title ? ` (${b.title})` : ''} on ${b.date}: ${b.shares.toLocaleString('en-US')} shares at $${b.price.toFixed(2)}, or <strong>${usd(b.value)}</strong>.`
          : '',
        'Small companies are where insider buying tells you the most, because a purchase like this is a large share of the person’s net worth and the stock has almost no analyst coverage to price it in.',
        `<p style="margin:16px 0;"><a href="${site}/companies/${encodeURIComponent(pick.ticker)}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">See every ${pick.ticker} insider filing, the chart and the Insider Score band</a></p>`,
        'Insider Access members get the Insider Score itself, the full ranked list of sub-$100M names insiders are buying, and an alert the moment the next Form 4 lands.',
        `<p style="margin:0 0 16px;"><a href="${site}/premium" style="color:#e02b2b;font-weight:600;text-decoration:underline;">Join Insider Access</a></p>`,
        '<p style="margin:16px 0 0;font-size:12px;color:#666;">Informational only, not investment advice. Micro-cap stocks are volatile and thinly traded. Insider buying is one signal among many and does not guarantee future performance.</p>',
        'See you on the inside,',
        '__SIGNOFF__',
      ].filter(Boolean),
    };
    await this.emailFlows.sendOneOff(email, step);
    this.logger.log(`fulfilled penny-spotlight → ${email} (${pick.ticker})`);
  }

  private async sendAlertsWelcome(email: string): Promise<void> {
    const items = await this.alerts.latestQualifying(24 * 7, 5);
    const cards = items.length
      ? this.alerts.renderCards(items)
      : `<p style="margin:0;color:#555;">No CEO, CFO or $1M+ open-market buy has been filed in the last seven days. Your first alert goes out the moment one is.</p>`;
    const step: FlowEmail = {
      id: `fulfil-alerts`,
      offsetMinutes: 0,
      brand: 'INSIDER ALERTS',
      signoffTitle: 'CEO and Publisher, Insider Buying',
      subjects: [
        {
          subject: 'You’re on the insider alerts list. Here are the latest buys',
          preview: 'CEO, CFO and $1M+ open-market buys, within hours of the Form 4',
        },
      ],
      body: [
        `<p style="margin:0 0 14px;">You’re in. From now on, every open-market purchase by a CEO or CFO, and every $1 million-plus insider buy, reaches this inbox within hours of the SEC filing, each with the company’s Insider Score. This is what the last seven days looked like:</p>`,
        cards,
        `<p style="margin:16px 0 0;font-size:13px;color:#555;">One buy per email, no digests, no noise. Awards, option exercises and 10b5-1 plan trades never trigger an alert.</p>`,
        'See you on the inside,',
        '__SIGNOFF__',
      ],
    };
    await this.emailFlows.sendOneOff(email, step);
    this.logger.log(`fulfilled alerts → ${email}: ${items.length} latest buys`);
  }
}
