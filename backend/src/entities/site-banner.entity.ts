import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BannerPlacement = 'bar' | 'card';
export type BannerAudience = 'all' | 'guest' | 'free' | 'premium';

/**
 * Site banner / announcement system (Brief v2, Workstream H; required on the
 * press subdomain by Brief v3 §7). Admin CRUD + scheduling, audience and page
 * targeting, dismissal with a frequency cap, impression/click counts, and a
 * priority so at most one bar and one card render at a time.
 */
@Entity('site_banners')
export class SiteBanner {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ctaLabel!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ctaUrl!: string | null;

  /** "bar" = top announcement bar; "card" = in-content promo card. */
  @Column({ type: 'varchar', length: 8, default: 'bar' })
  placement!: BannerPlacement;

  @Column({ type: 'varchar', length: 8, default: 'all' })
  audience!: BannerAudience;

  /** Path prefix the banner is limited to ("/press", "/stock-lists"); null = site-wide. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  pagePrefix!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Higher wins when several banners match the same placement. */
  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ type: 'boolean', default: true })
  dismissible!: boolean;

  /** After a dismissal, hours before the banner may show again (0 = never). */
  @Column({ type: 'int', default: 168 })
  frequencyCapHours!: number;

  /** utm_campaign appended to the CTA link (auto-UTM for attribution). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  utmCampaign!: string | null;

  @Column({ type: 'int', default: 0 })
  impressions!: number;

  @Column({ type: 'int', default: 0 })
  clicks!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
