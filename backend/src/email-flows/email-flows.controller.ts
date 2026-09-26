import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EmailFlowsService } from './email-flows.service';
import { EmailFlowName } from '../entities/email-flow-state.entity';

const FLOW_NAMES: EmailFlowName[] = ['welcome', 'abandoned', 'post_purchase', 'discount'];

@Controller('email-flows')
export class EmailFlowsController {
  constructor(private readonly flows: EmailFlowsService) {}

  /** External cron target (kept so a scheduler outside the process can drive
   *  reliably) — ping every 5–10 minutes. Idempotent. */
  @Post('cron')
  async cronPost() {
    return this.flows.processDue();
  }
  @Get('cron')
  async cronGet() {
    return this.flows.processDue();
  }

  /** Weekly paygated newsletter — external-cron target (Mondays). */
  @Post('newsletter')
  async newsletter() {
    return this.flows.sendWeeklyNewsletter();
  }

  /** Rendered HTML of one step, for the /welcome thank-you page (George
   *  2026-09-21: "with our first welcome to insider buying message, same
   *  email we send first"). Public: it is the marketing email every
   *  subscriber receives, nothing account-specific. */
  @Get('preview')
  preview(
    @Query('flow') flowRaw: string | undefined,
    @Query('step') step: string | undefined,
    @Query('firstName') firstName: string | undefined,
    @Res() res: Response,
  ) {
    const flow = flowRaw && FLOW_NAMES.includes(flowRaw as EmailFlowName) ? (flowRaw as EmailFlowName) : null;
    const st = flow && step ? this.flows.getStep(flow, step) : null;
    if (!st) throw new BadRequestException('flow and step are required');
    const name = (firstName || '').trim().slice(0, 40) || 'friend';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(this.flows.renderHtml(st, name, st.subjects[0]?.preview));
  }

  /** The flows and their timings — sanity check. */
  @Get('overview')
  overview() {
    return { enabled: this.flows.enabled, flows: this.flows.overview() };
  }

  /** Manually start a flow (also used by internal wiring). */
  @Post('start')
  async start(@Body() body: { flow?: EmailFlowName; email?: string; firstName?: string }) {
    const flow = body?.flow && FLOW_NAMES.includes(body.flow) ? body.flow : null;
    if (!flow) throw new BadRequestException(`flow must be one of ${FLOW_NAMES.join(', ')}`);
    const state = await this.flows.startFlow(flow, body?.email || '', body?.firstName);
    if (!state) throw new BadRequestException('Valid email required');
    return { ok: true, id: state.id, flow: state.flow };
  }

  /** Send one step to one address for review (doesn't affect real state). */
  @Post('test-send')
  async testSend(@Body() body: { flow?: EmailFlowName; step?: string; to?: string }) {
    const flow = body?.flow && FLOW_NAMES.includes(body.flow) ? body.flow : null;
    if (!flow || !body?.step || !body?.to) {
      throw new BadRequestException('flow, step and to are required');
    }
    return this.flows.testSend(flow, body.step, body.to);
  }
}
