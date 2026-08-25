import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscriber } from '../entities/subscriber.entity';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { ActiveCampaignService } from './activecampaign.service';

@Controller('subscribers')
export class SubscribersController {
  constructor(
    @InjectRepository(Subscriber)
    private readonly repo: Repository<Subscriber>,
    private readonly emailFlows: EmailFlowsService,
    private readonly activeCampaign: ActiveCampaignService,
  ) {}

  @Post()
  async create(
    @Body() body: { email?: string; phone?: string; source?: string },
  ) {
    const email = (body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email required');
    }
    const source = body?.source?.slice(0, 80) || null;
    // Brief, Section 2: every funnel capture reaches the CRM with its tag —
    // including a repeat opt-in, where the tag is the new information.
    if (source) this.activeCampaign.syncContact(email, source).catch(() => undefined);
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) return { ok: true, deduped: true, id: existing.id };
    const saved = await this.repo.save(
      this.repo.create({
        email,
        phone: body?.phone?.trim() || null,
        source,
      }),
    );
    // New list member → start the Welcome Flow (fire-and-forget).
    this.emailFlows.startFlow('welcome', email).catch(() => undefined);
    return { ok: true, id: saved.id };
  }
}
