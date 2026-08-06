import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { EmailFlowState, EmailFlowName } from '../entities/email-flow-state.entity';
import { FlowEmail } from './content/types';
import { WELCOME_FLOW } from './content/welcome';
import { URGENCY_FLOW } from './content/urgency';
import { ABANDONED_FLOW } from './content/abandoned';
import { POST_PURCHASE_FLOW } from './content/post-purchase';

/** The urgency flow is the tail of the welcome timeline (day 9–10), so it
 *  ships as part of the welcome flow's step list. */
const FLOWS: Record<EmailFlowName, FlowEmail[]> = {
  welcome: [...WELCOME_FLOW, ...URGENCY_FLOW],
  abandoned: ABANDONED_FLOW,
  post_purchase: POST_PURCHASE_FLOW,
};

@Injectable()
export class EmailFlowsService {
  private readonly logger = new Logger(EmailFlowsService.name);

  constructor(
    @InjectRepository(EmailFlowState)
    private readonly states: Repository<EmailFlowState>,
  ) {}

  private get apiKey(): string {
    return process.env.RESEND_API_KEY || '';
  }
  private get from(): string {
    return process.env.EMAIL_FROM || 'Insider Buying <devs@insiderbuying.com>';
  }
  private get subscribeUrl(): string {
    return process.env.EMAIL_SALES_URL || 'https://insiderbuyer-hwrc.vercel.app/premium';
  }
  private get siteUrl(): string {
    return process.env.SITE_URL || 'https://insiderbuyer-hwrc.vercel.app';
  }
  get enabled(): boolean {
    return !!this.apiKey;
  }

  // ── Flow lifecycle ───────────────────────────────────────────────────────

  /** Start (or no-op if already started) a flow for a recipient. */
  async startFlow(flow: EmailFlowName, emailRaw: string, firstName?: string | null): Promise<EmailFlowState | null> {
    const email = (emailRaw || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    const existing = await this.states.findOne({ where: { email, flow } });
    if (existing) return existing;
    const state = await this.states.save(
      this.states.create({
        email,
        firstName: (firstName || '').trim().split(/\s+/)[0] || null,
        flow,
        startedAt: new Date(),
        sentSteps: '[]',
        status: 'active',
      }),
    );
    this.logger.log(`flow ${flow} started for ${email}`);
    return state;
  }

  /** Cancel active flows — e.g. a purchase cancels welcome + abandoned. */
  async cancelFlows(emailRaw: string, flows: EmailFlowName[]): Promise<void> {
    const email = (emailRaw || '').trim().toLowerCase();
    if (!email) return;
    for (const flow of flows) {
      await this.states.update({ email, flow, status: 'active' }, { status: 'cancelled' });
    }
  }

  /** A completed purchase: stop selling to them, start the members flow. */
  async onPurchase(email: string, firstName?: string | null): Promise<void> {
    await this.cancelFlows(email, ['welcome', 'abandoned']);
    await this.startFlow('post_purchase', email, firstName);
  }

  // ── Scheduler ────────────────────────────────────────────────────────────

  /** In-process tick (works on long-lived deployments); the same logic is
   *  exposed at POST /email-flows/cron for an external pinger on serverless. */
  @Cron('*/10 * * * *')
  async scheduled(): Promise<void> {
    if (!this.enabled) return;
    await this.processDue().catch((e) => this.logger.error(e?.message || e));
  }

  /** Send every due, unsent step across all active flow states. Idempotent. */
  async processDue(): Promise<{ sent: number; checked: number }> {
    if (!this.enabled) return { sent: 0, checked: 0 };
    const active = await this.states.find({ where: { status: 'active' } });
    let sent = 0;
    for (const state of active) {
      const steps = FLOWS[state.flow] || [];
      const sentSet = new Set<string>(JSON.parse(state.sentSteps || '[]'));
      const elapsedMin = (Date.now() - new Date(state.startedAt).getTime()) / 60_000;
      let dirty = false;
      for (const step of steps) {
        if (sentSet.has(step.id) || elapsedMin < step.offsetMinutes) continue;
        try {
          await this.sendStep(state, step);
          sentSet.add(step.id);
          dirty = true;
          sent++;
        } catch (e: any) {
          this.logger.warn(`send failed ${state.flow}/${step.id} → ${state.email}: ${e?.message || e}`);
        }
      }
      const done = steps.every((s) => sentSet.has(s.id));
      if (dirty || done) {
        state.sentSteps = JSON.stringify([...sentSet]);
        if (done) state.status = 'completed';
        await this.states.save(state);
      }
    }
    return { sent, checked: active.length };
  }

  // ── Rendering + sending ──────────────────────────────────────────────────

  /** Deterministic subject-variant rotation: stable per recipient+step, so
   *  the doc's A/B variants spread across the list. */
  private pickVariant(email: string, stepId: string, count: number): number {
    let h = 0;
    const s = `${email}|${stepId}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return count > 0 ? h % count : 0;
  }

  private fill(text: string, firstName: string): string {
    return text
      .replace(/\{\{FIRSTNAME\}\}/g, firstName)
      .replace(/\{\{URL\}\}/g, this.subscribeUrl)
      .replace(/\{\{SITE\}\}/g, this.siteUrl);
  }

  renderHtml(step: FlowEmail, firstName: string, preview?: string): string {
    const blocks = step.body
      .map((b) => {
        if (b === '__SIGNOFF__') {
          return (
            `<p style="margin:28px 0 4px;">George Aizpurua</p>` +
            `<p style="margin:0 0 16px;color:#444;">${step.signoffTitle}</p>`
          );
        }
        const filled = this.fill(b, firstName);
        return filled.trimStart().startsWith('<')
          ? filled
          : `<p style="margin:0 0 16px;">${filled}</p>`;
      })
      .join('\n');

    const preheader = preview
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${this.fill(preview, firstName)}</div>`
      : '';

    return (
      `${preheader}` +
      `<div style="max-width:620px;margin:0 auto;padding:28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#111;">` +
      `<div style="text-align:center;margin:6px 0 10px;font-size:34px;font-weight:900;letter-spacing:1px;color:#000;">${step.brand}</div>` +
      `<div style="border-bottom:3px solid #1a237e;margin:0 0 26px;"></div>` +
      blocks +
      `<div style="margin-top:34px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;">` +
      `You’re receiving this because you joined Insider Buying. ` +
      `<a href="${this.siteUrl}" style="color:#999;">insiderbuying</a></div>` +
      `</div>`
    );
  }

  private async sendStep(state: EmailFlowState, step: FlowEmail): Promise<void> {
    const firstName = state.firstName || 'friend';
    const v = step.subjects[this.pickVariant(state.email, step.id, step.subjects.length)];
    const subject = this.fill(v.subject, firstName);
    const html = this.renderHtml(step, firstName, v.preview);
    await axios.post(
      'https://api.resend.com/emails',
      { from: this.from, to: [state.email], subject, html },
      { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: 20_000 },
    );
    this.logger.log(`sent ${state.flow}/${step.id} → ${state.email} ("${subject}")`);
  }

  /** Manual test-send of any step to any address (doesn't touch state). */
  async testSend(flow: EmailFlowName, stepId: string, to: string): Promise<{ ok: boolean; subject?: string }> {
    const step = (FLOWS[flow] || []).find((s) => s.id === stepId);
    if (!step || !this.enabled) return { ok: false };
    const fake = { email: to, firstName: 'Faizan' } as EmailFlowState;
    await this.sendStep(fake, step);
    const v = step.subjects[this.pickVariant(to, step.id, step.subjects.length)];
    return { ok: true, subject: this.fill(v.subject, 'Faizan') };
  }

  /** Flow overview for sanity-checking the schedule. */
  overview() {
    return Object.entries(FLOWS).map(([flow, steps]) => ({
      flow,
      steps: steps.map((s) => ({
        id: s.id,
        afterHours: +(s.offsetMinutes / 60).toFixed(2),
        subjects: s.subjects.length,
      })),
    }));
  }
}
