import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
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

  /**
   * Social-proof count for the subscribe page (Brief v4 §3.4: "wire it to the
   * real subscriber count rounded down to the nearest hundred"). Public, no
   * PII: one integer. `floor` is the config floor the page prints until the
   * real list is larger — the client decides the canonical figure.
   */
  private countCache: { at: number; value: number } | null = null;
  @Get('count')
  async count() {
    const now = Date.now();
    if (!this.countCache || now - this.countCache.at > 10 * 60_000) {
      const n = await this.repo.count();
      this.countCache = { at: now, value: n };
    }
    const exact = this.countCache.value;
    return { exact, roundedDown: Math.floor(exact / 100) * 100 };
  }

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
    if (existing) {
      // Someone who joined through a popup and LATER signs up on /alerts was
      // silently dropped here: the row was deduped and the new tag thrown away,
      // so they never became an alert recipient. Tags accumulate instead.
      const tags = (existing.source || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (source && !tags.includes(source)) {
        tags.push(source);
        existing.source = tags.join(',').slice(0, 255);
        await this.repo.save(existing);
      }
      return { ok: true, deduped: true, id: existing.id, source: existing.source };
    }
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
