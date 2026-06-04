import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscriber } from '../entities/subscriber.entity';

@Controller('subscribers')
export class SubscribersController {
  constructor(
    @InjectRepository(Subscriber)
    private readonly repo: Repository<Subscriber>,
  ) {}

  @Post()
  async create(
    @Body() body: { email?: string; phone?: string; source?: string },
  ) {
    const email = (body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email required');
    }
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) return { ok: true, deduped: true, id: existing.id };
    const saved = await this.repo.save(
      this.repo.create({
        email,
        phone: body?.phone?.trim() || null,
        source: body?.source?.slice(0, 80) || null,
      }),
    );
    return { ok: true, id: saved.id };
  }
}
