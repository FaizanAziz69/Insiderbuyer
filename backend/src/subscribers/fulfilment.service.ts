import { Injectable, Logger } from '@nestjs/common';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { FlowEmail } from '../email-flows/content/types';
import { InsiderAlertsService } from '../insider-alerts/insider-alerts.service';
import { ReportsService } from '../reports/reports.service';

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
          subject: 'This week’s top insider buys — scored and ranked',
          preview: 'What you signed up for: the week’s highest Insider Scores, delivered now',
        },
      ],
      body: [
        `<p style="margin:0 0 14px;">You asked for this week’s top insider buys — here they are, ranked by Insider Score, exactly as they stand today. You’ll get the fresh list every Monday.</p>`,
        body,
        'See you on the inside,',
        '__SIGNOFF__',
      ],
    };
    await this.emailFlows.sendOneOff(email, step);
    this.logger.log(`fulfilled ${source} → ${email}: weekly top buys`);
  }

  private async sendAlertsWelcome(email: string): Promise<void> {
    const items = await this.alerts.latestQualifying(24 * 7, 5);
    const cards = items.length
      ? this.alerts.renderCards(items)
      : `<p style="margin:0;color:#555;">No CEO, CFO or $1M+ open-market buy has been filed in the last seven days — your first alert goes out the moment one is.</p>`;
    const step: FlowEmail = {
      id: `fulfil-alerts`,
      offsetMinutes: 0,
      brand: 'INSIDER ALERTS',
      signoffTitle: 'CEO and Publisher, Insider Buying',
      subjects: [
        {
          subject: 'You’re on the insider alerts list — here are the latest buys',
          preview: 'CEO, CFO and $1M+ open-market buys, within hours of the Form 4',
        },
      ],
      body: [
        `<p style="margin:0 0 14px;">You’re in. From now on, every open-market purchase by a CEO or CFO — and every $1 million-plus insider buy — reaches this inbox within hours of the SEC filing, each with the company’s Insider Score. This is what the last seven days looked like:</p>`,
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
