import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { EmailFlowsService } from './email-flows.service';
import { EmailFlowName } from '../entities/email-flow-state.entity';

const FLOW_NAMES: EmailFlowName[] = ['welcome', 'abandoned', 'post_purchase'];

@Controller('email-flows')
export class EmailFlowsController {
  constructor(private readonly flows: EmailFlowsService) {}

  /** External cron target (Vercel serverless can't run in-process crons
   *  reliably) — ping every 5–10 minutes. Idempotent. */
  @Post('cron')
  async cronPost() {
    return this.flows.processDue();
  }
  @Get('cron')
  async cronGet() {
    return this.flows.processDue();
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
