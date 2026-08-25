import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscriber } from '../entities/subscriber.entity';
import { EmailFlowsService } from '../email-flows/email-flows.service';

@Controller('subscribers')
export class SubscribersController {
  constructor(
    @InjectRepository(Subscriber)
    private readonly repo: Repository<Subscriber>,
    private readonly emailFlows: EmailFlowsService,
  ) {}

  @Post()
  async create(
    @Body() body: { email?: string; phone?: string; source?: string },
  ) {
    const email = (body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email required');
    }
    // The brief allowed "ActiveCampaign or current email provider"; the client
    // confirmed Resend on 2026-08-25, so the tag lives in `source` here and the
    // welcome flow below is the whole integration.
    const source = body?.source?.slice(0, 80) || null;
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
