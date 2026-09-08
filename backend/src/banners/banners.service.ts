import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BannerAudience, BannerPlacement, SiteBanner } from '../entities/site-banner.entity';

const AUDIENCES: BannerAudience[] = ['all', 'guest', 'free', 'premium'];
const PLACEMENTS: BannerPlacement[] = ['bar', 'card'];

/** Workstream H — banner / announcement system. */
@Injectable()
export class BannersService {
  constructor(@InjectRepository(SiteBanner) private readonly repo: Repository<SiteBanner>) {}

  /** Active banners for a path + audience: at most one bar and one card,
   *  highest priority first. The fetch is tiny so it never blocks first paint. */
  async active(path: string, audience: BannerAudience): Promise<{ bar: SiteBanner | null; card: SiteBanner | null }> {
    const now = new Date();
    const rows = await this.repo.find({ where: { active: true }, order: { priority: 'DESC', createdAt: 'DESC' } });
    const fits = (b: SiteBanner) =>
      (!b.startsAt || b.startsAt <= now) &&
      (!b.endsAt || b.endsAt >= now) &&
      (b.audience === 'all' || b.audience === audience) &&
      (!b.pagePrefix || (path || '/').startsWith(b.pagePrefix));
    const pick = (p: BannerPlacement) => rows.find((b) => b.placement === p && fits(b)) ?? null;
    return { bar: pick('bar'), card: pick('card') };
  }

  async event(id: string, type: 'impression' | 'click'): Promise<void> {
    if (type !== 'impression' && type !== 'click') throw new BadRequestException('Bad event.');
    await this.repo.increment({ id }, type === 'click' ? 'clicks' : 'impressions', 1);
  }

  list(): Promise<SiteBanner[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async create(body: Partial<SiteBanner>): Promise<SiteBanner> {
    return this.repo.save(this.repo.create(this.clean(body)));
  }

  async update(id: string, body: Partial<SiteBanner>): Promise<SiteBanner> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Banner not found.');
    Object.assign(row, this.clean(body, row));
    return this.repo.save(row);
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.repo.delete({ id });
    return { ok: true };
  }

  private clean(b: Partial<SiteBanner>, base?: SiteBanner): Partial<SiteBanner> {
    const out: Partial<SiteBanner> = {};
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    if (b.title !== undefined || !base) {
      const t = str(b.title, 200);
      if (!t) throw new BadRequestException('Title is required.');
      out.title = t;
    }
    if (b.body !== undefined) out.body = str(b.body, 2000);
    if (b.ctaLabel !== undefined) out.ctaLabel = str(b.ctaLabel, 80);
    if (b.ctaUrl !== undefined) out.ctaUrl = str(b.ctaUrl, 500);
    if (b.placement !== undefined) {
      if (!PLACEMENTS.includes(b.placement)) throw new BadRequestException('placement must be bar or card.');
      out.placement = b.placement;
    }
    if (b.audience !== undefined) {
      if (!AUDIENCES.includes(b.audience)) throw new BadRequestException('audience must be all, guest, free or premium.');
      out.audience = b.audience;
    }
    if (b.pagePrefix !== undefined) out.pagePrefix = str(b.pagePrefix, 200);
    if (b.startsAt !== undefined) out.startsAt = b.startsAt ? new Date(b.startsAt as unknown as string) : null;
    if (b.endsAt !== undefined) out.endsAt = b.endsAt ? new Date(b.endsAt as unknown as string) : null;
    if (b.active !== undefined) out.active = !!b.active;
    if (b.dismissible !== undefined) out.dismissible = !!b.dismissible;
    if (b.priority !== undefined) out.priority = Math.max(-1000, Math.min(1000, Number(b.priority) || 0));
    if (b.frequencyCapHours !== undefined) out.frequencyCapHours = Math.max(0, Math.min(24 * 365, Number(b.frequencyCapHours) || 0));
    if (b.utmCampaign !== undefined) out.utmCampaign = str(b.utmCampaign, 100);
    return out;
  }
}
