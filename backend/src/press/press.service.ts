import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import axios from 'axios';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PressOrder, PressOrderStatus, PressPackage, PRESS_ORDER_STATUSES } from '../entities/press-order.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { Company } from '../entities/company.entity';
import { InsiderAlertDispatch } from '../entities/insider-alert-dispatch.entity';
import { BillingService } from '../billing/billing.service';

/** Brief v3 §6 — the two packages. Prices are the brief's; everything else
 *  about each package (outlets, reach, DA, delivery) lives in the FRONTEND
 *  config with its own [verify] flags, because those figures are placeholders
 *  until the distribution partner confirms them. */
export const PRESS_PACKAGES: Record<PressPackage, { name: string; amountCents: number; product: 'press-authority' | 'press-ultimate' }> = {
  authority: { name: 'Authority', amountCents: 470_000, product: 'press-authority' },
  ultimate: { name: 'Ultimate', amountCents: 970_000, product: 'press-ultimate' },
};

const UPLOAD_DIR = process.env.PRESS_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'press-kits');
const MAX_KIT_BYTES = 25 * 1024 * 1024;
const KIT_MIME = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/zip|application\/x-zip-compressed|image\/(png|jpeg)|text\/plain)$/;

export interface UploadedKit {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PressStats {
  filingsToday: number;
  filingsLast24h: number;
  /** Open-market insider transactions in our database. */
  filingsOnFile: number;
  /** Public companies with a record in our companies table. */
  companiesTracked: number;
  /** Insider-alert emails dispatched to date. */
  alertsSent: number;
}

@Injectable()
export class PressService {
  private readonly logger = new Logger(PressService.name);

  constructor(
    @InjectRepository(PressOrder) private readonly orders: Repository<PressOrder>,
    @InjectRepository(InsiderTransaction) private readonly tx: Repository<InsiderTransaction>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderAlertDispatch) private readonly alerts: Repository<InsiderAlertDispatch>,
    private readonly billing: BillingService,
  ) {}

  /** Stripe Checkout for a package. Guest checkout — Stripe collects the email. */
  async checkout(pkgRaw: string, attribution?: Record<string, unknown>): Promise<{ url: string }> {
    const pkg = (pkgRaw || '').toLowerCase() as PressPackage;
    const cfg = PRESS_PACKAGES[pkg];
    if (!cfg) throw new BadRequestException('Unknown package.');
    const attr = this.cleanAttribution(attribution);
    return this.billing.createOneTimeCheckout(cfg.product, null, '/press/order', {
      cancelPath: '/press?checkout=cancelled#pricing',
      metadata: { pressPackage: pkg, ...attr },
    });
  }

  /** Verify the paid session and materialise the order (idempotent). The
   *  intake page calls this on arrival — no webhook dependency. */
  async orderFromSession(sessionId: string): Promise<PressOrder> {
    if (!/^cs_/.test(sessionId || '')) throw new BadRequestException('Bad session id.');
    const existing = await this.orders.findOne({ where: { stripeSessionId: sessionId } });
    if (existing) return existing;
    const v = await this.billing.verifyOneTimeSession(sessionId);
    if (!v.paid) throw new BadRequestException('Payment not completed.');
    const pkg = (v.metadata?.pressPackage as PressPackage | undefined) || this.packageFromProduct(v.product);
    if (!pkg) throw new BadRequestException('Not a press package.');
    const attribution: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.metadata || {})) {
      if (/^(entry|(initial_)?utm_|(initial_)?landing_path)/.test(k) && typeof val === 'string') attribution[k] = val;
    }
    const order = await this.orders.save(
      this.orders.create({
        package: pkg,
        amountCents: v.amountTotal ?? PRESS_PACKAGES[pkg].amountCents,
        currency: 'usd',
        email: v.email || '',
        stripeSessionId: sessionId,
        status: 'received',
        attribution: Object.keys(attribution).length ? attribution : null,
      }),
    );
    this.logger.log(`press order ${order.id} created (${pkg}, ${order.email})`);
    return order;
  }

  /** Brief v3 §6 intake: company, ticker, press kit upload or "write it for
   *  me", contact. Then the confirmation email with the timeline. */
  async intake(
    id: string,
    body: Record<string, string | undefined>,
    kit: UploadedKit | undefined,
  ): Promise<PressOrder> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found.');
    const company = (body.company || '').trim().slice(0, 200);
    const contactName = (body.contactName || '').trim().slice(0, 120);
    const contactEmail = (body.contactEmail || '').trim().toLowerCase().slice(0, 320);
    if (!company) throw new BadRequestException('Company name is required.');
    if (!contactName) throw new BadRequestException('Contact name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new BadRequestException('A valid contact email is required.');
    const writeForMe = body.writeForMe === 'true' || body.writeForMe === '1';
    if (!writeForMe && !kit && !order.pressKitPath) {
      throw new BadRequestException('Upload your press kit, or choose "write it for me".');
    }
    if (kit) {
      if (kit.size > MAX_KIT_BYTES) throw new BadRequestException('Press kit must be under 25 MB.');
      if (!KIT_MIME.test(kit.mimetype)) throw new BadRequestException('Press kit must be a PDF, Word document, ZIP, PNG, JPEG or text file.');
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const safe = kit.originalname.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'press-kit';
      const dest = path.join(UPLOAD_DIR, `${order.id}-${safe}`);
      await fs.writeFile(dest, kit.buffer);
      order.pressKitFilename = kit.originalname.slice(0, 255);
      order.pressKitPath = dest;
      order.pressKitMime = kit.mimetype;
    }
    order.company = company;
    order.ticker = (body.ticker || '').trim().toUpperCase().slice(0, 16) || null;
    order.contactName = contactName;
    order.contactEmail = contactEmail;
    order.contactPhone = (body.contactPhone || '').trim().slice(0, 40) || null;
    order.writeForMe = writeForMe;
    order.notes = (body.notes || '').trim().slice(0, 4000) || null;
    order.intakeCompletedAt = new Date();
    await this.orders.save(order);
    void this.sendConfirmation(order).catch((e) => this.logger.warn(`confirmation email failed for ${order.id}: ${e?.message || e}`));
    return order;
  }

  async list(): Promise<PressOrder[]> {
    return this.orders.find({ order: { createdAt: 'DESC' }, take: 500 });
  }

  async setStatus(id: string, statusRaw: string): Promise<PressOrder> {
    const status = statusRaw as PressOrderStatus;
    if (!PRESS_ORDER_STATUSES.includes(status)) throw new BadRequestException('Unknown status.');
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found.');
    order.status = status;
    return this.orders.save(order);
  }

  /** The Editorial Focus band's live chip plus the network-stats strip: only
   *  figures we can evidence from our own tables (Brief v3 §6 — never a claim
   *  we can't back). Cached 10 minutes; the counts are heavy. */
  private statsCache: { at: number; value: PressStats } | null = null;
  async stats(): Promise<PressStats> {
    if (this.statsCache && Date.now() - this.statsCache.at < 10 * 60_000) return this.statsCache.value;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [filingsToday, filingsLast24h, filingsOnFile, companiesTracked, alertsSent] = await Promise.all([
      this.tx.count({ where: { createdAt: MoreThan(startOfDay) } }),
      this.tx.count({ where: { createdAt: MoreThan(new Date(Date.now() - 24 * 3_600_000)) } }),
      this.tx.count(),
      this.companies.count(),
      this.alerts.count(),
    ]);
    const value = { filingsToday, filingsLast24h, filingsOnFile, companiesTracked, alertsSent };
    this.statsCache = { at: Date.now(), value };
    return value;
  }

  /** Public view of an order for the intake / confirmation page — no file paths. */
  publicView(o: PressOrder) {
    return {
      id: o.id,
      package: o.package,
      packageName: PRESS_PACKAGES[o.package]?.name ?? o.package,
      amountCents: o.amountCents,
      email: o.email,
      status: o.status,
      company: o.company,
      ticker: o.ticker,
      contactName: o.contactName,
      contactEmail: o.contactEmail,
      contactPhone: o.contactPhone,
      writeForMe: o.writeForMe,
      pressKitFilename: o.pressKitFilename,
      notes: o.notes,
      intakeCompleted: !!o.intakeCompletedAt,
      createdAt: o.createdAt,
    };
  }

  private packageFromProduct(product: string | null): PressPackage | null {
    if (product === 'press-authority') return 'authority';
    if (product === 'press-ultimate') return 'ultimate';
    return null;
  }

  private cleanAttribution(raw?: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (/^(entry|(initial_)?utm_(source|medium|campaign|content|term)|(initial_)?landing_path)$/.test(k) && typeof v === 'string' && v) {
        out[k.slice(0, 40)] = v.slice(0, 200);
      }
    }
    return out;
  }

  /** Brief v3 §6: "confirmation email with timeline". */
  private async sendConfirmation(order: PressOrder): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const site = process.env.SITE_URL || 'https://insiderbuying.com';
    const pkg = PRESS_PACKAGES[order.package];
    const to = Array.from(new Set([order.contactEmail, order.email].filter(Boolean))) as string[];
    const step = (n: number, title: string, when: string, done = false) =>
      `<tr><td style="padding:10px 12px 10px 0;vertical-align:top;"><span style="display:inline-block;width:26px;height:26px;border-radius:13px;background:${done ? '#0E9F6E' : '#0A1E3C'};color:#fff;font-weight:800;text-align:center;line-height:26px;font-size:13px;">${n}</span></td><td style="padding:10px 0;vertical-align:top;"><div style="font-weight:800;color:#0A1E3C;">${title}</div><div style="font-size:13px;color:#555;">${when}</div></td></tr>`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
        <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#C9A227;font-weight:800;">InsiderBuying.com · Press Publishing</div>
        <h1 style="font-size:22px;margin:8px 0 4px;color:#0A1E3C;">Your ${pkg.name} order is received</h1>
        <p style="font-size:14px;color:#444;margin:0 0 16px;">Thank you, ${this.esc(order.contactName || '')}. We have your details for <strong>${this.esc(order.company || '')}</strong>${order.ticker ? ` (${this.esc(order.ticker)})` : ''}${order.writeForMe ? ' and our team will write the release for you' : ' and your press kit'}. Here is what happens next:</p>
        <table style="border-collapse:collapse;">
          ${step(1, 'Received', 'Today — order and intake on file', true)}
          ${step(2, 'In Review', 'Within 1 business day — our editors review the material' + (order.writeForMe ? ' and draft your release' : ''))}
          ${step(3, 'Approve', 'You review the final copy and request any changes')}
          ${step(4, 'Published', 'Distributed to the network and featured on InsiderBuying.com, within the delivery window for your package')}
          ${step(5, 'Reported', 'You receive a report with live links and SEO data')}
        </table>
        <p style="font-size:13px;color:#555;margin:18px 0 0;">Order reference: <code>${order.id}</code>. Questions or changes: reply to this email. Money-back guarantee terms: <a href="${site}/press/guarantee" style="color:#0A1E3C;">${site}/press/guarantee</a>.</p>
        <p style="font-size:12px;color:#888;margin-top:18px;line-height:1.6;">Published pieces are labeled as sponsored or paid distribution per outlet rules and our disclosure policy. Paid placement never affects Insider Scores or editorial rankings on InsiderBuying.com.</p>
      </div>`;
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'InsiderBuying.com <info@insiderbuying.com>',
        to,
        reply_to: process.env.EMAIL_REPLY_TO || 'info@insiderbuying.com',
        subject: `Order received — ${pkg.name} press package for ${order.company || 'your company'}`,
        html,
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20_000 },
    );
    this.logger.log(`press order ${order.id}: confirmation sent → ${to.join(', ')}`);
  }

  private esc(s: string): string {
    return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string);
  }
}
