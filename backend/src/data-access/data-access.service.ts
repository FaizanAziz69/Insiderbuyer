import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataAccessRequest } from '../entities/data-access-request.entity';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { FlowEmail } from '../email-flows/content/types';

/** A request as the review page sees it: everything except the access token. */
export interface PublicRequest {
  id: string;
  dataset: string;
  datasetLabel: string;
  name: string;
  title: string;
  company: string;
  companyEmail: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
}

/** A signed pair of decisions for one request, minted for a proven link. */
export interface ActionSigs {
  exp: string;
  approveSig: string;
  declineSig: string;
}

/** A queue row carries its own signed actions so the list can act on any row. */
export type QueueRow = PublicRequest & ActionSigs;

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

  /** Who gets told that someone asked for a dataset. George owns these
   *  decisions, and on 2026-09-24 asked for every request to reach him rather
   *  than the devs mailbox, so his address is the default rather than a
   *  deployment detail. EMAIL_REPLY_TO is deliberately no longer in the chain:
   *  it is the site-wide reply-to for outbound mail, not an inbox anyone
   *  watches, and falling back to it once meant nobody saw a request.
   *  DATA_ACCESS_NOTIFY still overrides it, with one address (the notify mail
   *  goes out through sendOneOff, which sends to a single recipient). */
  private get deskAddress(): string {
    return process.env.DATA_ACCESS_NOTIFY || 'george@insiderbuying.com';
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

  // ────────────────────────────────────────────────────────────────────────
  // Deciding from the inbox.
  //
  // George asked to approve or decline straight from the notification email
  // (2026-09-24) — there is no admin screen behind a login, and handing him
  // the ADMIN_API_TOKEN to paste into a browser would be worse than the
  // problem. So each email carries links signed with an HMAC over the request
  // id, the action and an expiry. Possession of the link is the authority,
  // which is sound because the link only ever exists in the desk mailbox.
  //
  // TWO RULES THIS DEPENDS ON. A signed GET only ever SHOWS the request —
  // mail scanners and link previewers fetch every URL in an email, so a GET
  // that decided anything would auto-approve requests the moment the mail
  // arrived. The decision is a POST from the page. And the signature is
  // compared in constant time, because a plain === on a hex digest leaks it a
  // byte at a time to anyone who can time the endpoint.
  private get linkSecret(): string {
    return process.env.DATA_ACCESS_LINK_SECRET || process.env.ADMIN_API_TOKEN || '';
  }

  /** 30 days: long enough that a request survives a holiday, short enough
   *  that an old forwarded mail stops working. */
  private static readonly LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  private sign(payload: string): string {
    return createHmac('sha256', this.linkSecret).update(payload).digest('hex').slice(0, 32);
  }

  private signatureOk(payload: string, sig: string): boolean {
    if (!this.linkSecret) return false;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(String(sig || ''));
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /** Validate a link and hand back what it points at. `action` is part of the
   *  signed payload, so an approve link cannot be edited into a decline. */
  private checkLink(scope: string, exp: string, sig: string): void {
    if (!this.linkSecret) {
      throw new BadRequestException('Review links are not configured on this server.');
    }
    const expMs = Number(exp);
    if (!Number.isFinite(expMs)) throw new BadRequestException('Malformed link.');
    if (!this.signatureOk(`${scope}:${exp}`, sig)) {
      throw new BadRequestException('This link is not valid.');
    }
    if (Date.now() > expMs) {
      throw new BadRequestException('This link has expired. Open the request list instead.');
    }
  }

  private linkFor(scope: string, path: string): string {
    const exp = String(Date.now() + DataAccessService.LINK_TTL_MS);
    const sig = this.sign(`${scope}:${exp}`);
    const sep = path.includes('?') ? '&' : '?';
    return `${this.siteUrl}${path}${sep}exp=${exp}&sig=${sig}`;
  }

  /** The one-click link in the email: opens the review page for this request
   *  with an action pre-selected. Nothing is decided until the page posts. */
  decisionUrl(id: string, action: 'approve' | 'decline'): string {
    return this.linkFor(`${id}:${action}`, `/admin/access-requests?id=${id}&action=${action}`);
  }

  /** "See every request" — the same machinery, scoped to the whole queue. */
  queueUrl(): string {
    return this.linkFor('queue', '/admin/access-requests');
  }

  /** What the review page shows before anyone clicks anything.
   *
   *  It hands back a signature for BOTH actions, not just the one the email
   *  button carried. Arriving on an Approve link and then deciding to decline
   *  is an ordinary thing to do, and the link's own signature only covers the
   *  action it was minted for — so the already-proven link mints the pair. */
  async reviewByLink(
    id: string,
    action: 'approve' | 'decline',
    exp: string,
    sig: string,
  ): Promise<{ request: PublicRequest; actions: ActionSigs }> {
    this.checkLink(`${id}:${action}`, exp, sig);
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new BadRequestException('No such request.');
    return { request: this.publicView(row), actions: this.actionSigs(row.id) };
  }

  private actionSigs(id: string): ActionSigs {
    const exp = String(Date.now() + DataAccessService.LINK_TTL_MS);
    return {
      exp,
      approveSig: this.sign(`${id}:approve:${exp}`),
      declineSig: this.sign(`${id}:decline:${exp}`),
    };
  }

  /** The decision itself. Same signature, but it has to arrive as a POST. */
  async decideByLink(
    id: string,
    action: 'approve' | 'decline',
    exp: string,
    sig: string,
    note?: string,
  ): Promise<{ ok: boolean; status: string }> {
    this.checkLink(`${id}:${action}`, exp, sig);
    return this.decide(id, action === 'approve', note);
  }

  /** The queue behind the "see all requests" link: every row, each carrying
   *  its own pair of signed actions so the page can act without a token. */
  async queueByLink(exp: string, sig: string): Promise<{ rows: QueueRow[] }> {
    this.checkLink('queue', exp, sig);
    const rows = await this.list('all');
    return { rows: rows.map((r) => ({ ...this.publicView(r), ...this.actionSigs(r.id) })) };
  }

  /** Never hand the minted access token back to the review page — it belongs
   *  in the requester's mailbox and nowhere else. */
  private publicView(row: DataAccessRequest): PublicRequest {
    return {
      id: row.id,
      dataset: row.dataset,
      datasetLabel: this.datasetLabel(row.dataset),
      name: row.name,
      title: row.title,
      company: row.company,
      companyEmail: row.companyEmail,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
    };
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
        // Two buttons, because the alternative was "go and find the admin
        // list", and there is no admin list (George, 2026-09-24). Laid out as
        // a table with inline styles: Outlook ignores flexbox, margins on
        // anchors and most of everything else.
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 18px;"><tr>
           <td style="padding-right:10px;">
             <a href="${this.decisionUrl(row.id, 'approve')}" style="display:inline-block;background:#11824d;color:#ffffff;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;text-decoration:none;">Approve</a>
           </td>
           <td>
             <a href="${this.decisionUrl(row.id, 'decline')}" style="display:inline-block;background:#ffffff;color:#1d1e1f;font-weight:700;font-size:14px;padding:10px 21px;border:1px solid #c2c9cf;border-radius:6px;text-decoration:none;">Decline</a>
           </td>
         </tr></table>`,
        '<p style="margin:0 0 14px;">Either button opens the request in your browser and asks you to confirm — nothing is decided by the click itself. Approving emails them the access link automatically.</p>',
        `<p style="margin:0 0 14px;"><a href="${this.queueUrl()}" style="color:#005882;font-weight:600;">See every access request</a>, including the ones already decided.</p>`,
        `<p style="margin:0;color:#6c7783;font-size:12px;">Request id: ${row.id}. These links work for 30 days and carry the authority to decide, so treat them as you would a password.</p>`,
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
