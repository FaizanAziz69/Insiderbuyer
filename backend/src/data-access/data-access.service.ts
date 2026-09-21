import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { DataAccessRequest } from '../entities/data-access-request.entity';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { FlowEmail } from '../email-flows/content/types';

/** The datasets behind the gate. 'both' is what the pages ask for. */
export const DATASETS = ['promoter-score', 'top-ir-promoters', 'both'] as const;
export type Dataset = (typeof DATASETS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Addresses that are not a company address. The form asks for a COMPANY
 *  email, and the whole point of the gate is knowing who is asking, so a free
 *  mailbox is refused at the door rather than silently accepted and ignored. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'yandex.com',
  'mail.com', 'zoho.com', 'tutanota.com', 'hey.com', 'fastmail.com',
]);

@Injectable()
export class DataAccessService {
  private readonly log = new Logger(DataAccessService.name);

  constructor(
    @InjectRepository(DataAccessRequest)
    private readonly repo: Repository<DataAccessRequest>,
    private readonly emailFlows: EmailFlowsService,
  ) {}

  private get deskAddress(): string {
    return process.env.DATA_ACCESS_NOTIFY || process.env.EMAIL_REPLY_TO || 'devs@insiderbuying.com';
  }

  private get siteUrl(): string {
    return process.env.SITE_URL || 'https://insiderbuying.com';
  }

  /** Store a request and tell the desk. Re-requesting from the same address
   *  for the same dataset returns the existing row rather than stacking
   *  duplicates — and returns the live status, so an already-approved person
   *  is told to check their inbox instead of waiting on a second review. */
  async submit(body: {
    dataset?: string;
    name?: string;
    title?: string;
    company?: string;
    companyEmail?: string;
  }): Promise<{ ok: true; status: string; deduped?: boolean }> {
    const dataset = (DATASETS as readonly string[]).includes(String(body?.dataset))
      ? (body!.dataset as Dataset)
      : 'both';
    const name = (body?.name || '').trim().slice(0, 120);
    const title = (body?.title || '').trim().slice(0, 120);
    const company = (body?.company || '').trim().slice(0, 160);
    const companyEmail = (body?.companyEmail || '').trim().toLowerCase().slice(0, 320);

    const missing = [
      !name && 'name',
      !title && 'title',
      !company && 'company',
      !companyEmail && 'company email',
    ].filter(Boolean);
    if (missing.length) {
      throw new BadRequestException(`Please fill in your ${missing.join(', ')}.`);
    }
    if (!EMAIL_RE.test(companyEmail)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    const domain = companyEmail.split('@')[1] || '';
    if (FREE_MAIL.has(domain)) {
      throw new BadRequestException(
        'Please use your company email address so we can verify who is requesting access.',
      );
    }

    const existing = await this.repo.findOne({ where: { companyEmail, dataset } });
    if (existing) {
      return { ok: true, status: existing.status, deduped: true };
    }
    const saved = await this.repo.save(
      this.repo.create({ dataset, name, title, company, companyEmail, status: 'pending' }),
    );
    this.notifyDesk(saved).catch((e) =>
      this.log.warn(`access-request notify failed: ${e?.message || e}`),
    );
    this.log.log(`data access requested: ${companyEmail} (${company}) → ${dataset}`);
    return { ok: true, status: 'pending' };
  }

  /** Is this token good for this dataset? */
  async verify(token: string, dataset: string): Promise<{ granted: boolean; dataset?: string; company?: string }> {
    const t = (token || '').trim();
    if (!t) return { granted: false };
    const row = await this.repo.findOne({ where: { token: t, status: 'approved' } });
    if (!row) return { granted: false };
    const ok = row.dataset === 'both' || row.dataset === dataset;
    return ok ? { granted: true, dataset: row.dataset, company: row.company } : { granted: false };
  }

  async list(status?: string): Promise<DataAccessRequest[]> {
    const where = status && status !== 'all' ? { status: status as DataAccessRequest['status'] } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }

  /** Approve (minting + emailing a token) or decline. */
  async decide(
    id: string,
    approve: boolean,
    note?: string,
  ): Promise<{ ok: boolean; status: string }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new BadRequestException('No such request.');
    row.status = approve ? 'approved' : 'declined';
    row.note = note?.slice(0, 2000) ?? row.note;
    row.decidedAt = new Date();
    if (approve && !row.token) row.token = randomBytes(24).toString('hex');
    await this.repo.save(row);
    if (approve) {
      this.sendGrant(row).catch((e) =>
        this.log.warn(`access-grant email failed (${row.companyEmail}): ${e?.message || e}`),
      );
    }
    this.log.log(`data access ${row.status}: ${row.companyEmail} (${row.dataset})`);
    return { ok: true, status: row.status };
  }

  private datasetLabel(d: string): string {
    return d === 'promoter-score'
      ? 'the Promoter Score dataset'
      : d === 'top-ir-promoters'
        ? 'the Top IR Promoters dataset'
        : 'the Promoter Score and Top IR Promoters datasets';
  }

  private async notifyDesk(row: DataAccessRequest): Promise<void> {
    const step: FlowEmail = {
      id: 'data-access-request',
      offsetMinutes: 0,
      brand: 'INSIDER BUYING',
      signoffTitle: 'InsiderBuying.com',
      // Internal ops alert to our own desk — nobody 'joined' anything.
      footerKind: 'internal',
      subjects: [{ subject: `Access request: ${row.company} — ${this.datasetLabel(row.dataset)}` }],
      body: [
        `<p style="margin:0 0 14px;"><strong>${row.name}</strong> (${row.title}) at <strong>${row.company}</strong> has requested access to ${this.datasetLabel(row.dataset)}.</p>`,
        `<p style="margin:0 0 14px;">Company email: <a href="mailto:${row.companyEmail}">${row.companyEmail}</a></p>`,
        `<p style="margin:0 0 14px;">Request id: ${row.id}</p>`,
        '<p style="margin:0 0 14px;">Approve or decline it from the admin data-access list. Approving emails them an access link automatically.</p>',
      ],
    };
    await this.emailFlows.sendOneOff(this.deskAddress, step);
  }

  private async sendGrant(row: DataAccessRequest): Promise<void> {
    const url = `${this.siteUrl}/promoter-score?access=${row.token}`;
    const step: FlowEmail = {
      id: 'data-access-granted',
      offsetMinutes: 0,
      brand: 'INSIDER BUYING',
      signoffTitle: 'InsiderBuying.com',
      // They asked for this dataset; they did not join a mailing list.
      footerKind: 'requested',
      subjects: [
        { subject: `Your access to ${this.datasetLabel(row.dataset)}`, preview: 'Open the link to unlock the dataset' },
      ],
      body: [
        `Hello ${row.name.split(' ')[0] || 'there'},`,
        `Your request for ${this.datasetLabel(row.dataset)} has been approved.`,
        `<p style="margin:16px 0;"><a href="${url}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">Open the dataset</a></p>`,
        'That link carries your access key, so open it on the device you want to use. It stays active in that browser; open it again anywhere else you need it.',
        'The data covers disclosed investor-relations, promotional and market-making agreements filed under TSX Venture Policy 3.4 and CSE policy, with the issuer, the provider, the fee, the term, and what the share price and traded volume did afterwards.',
        'Reply to this email if you need the feed as a scheduled export rather than a web table.',
        '__SIGNOFF__',
      ],
    };
    await this.emailFlows.sendOneOff(row.companyEmail, step, row.name.split(' ')[0] || null);
  }
}
