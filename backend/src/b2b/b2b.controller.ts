import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { B2bLead } from '../entities/b2b-lead.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { AdminTokenGuard } from '../common/admin-token.guard';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * press.insiderbuying.com lead capture (Round-2 brief, Section 4).
 *
 * The form is the alternative to the Calendly embed, so it has to be reliable:
 * the lead is stored, tagged 'B2B Lead' on the mailing list, and — when
 * B2B_LEAD_NOTIFY is set — emailed to the team through Resend, because an IR
 * enquiry sitting unread in a table is a lost deal.
 */
@Controller('b2b-leads')
export class B2bController {
  constructor(
    @InjectRepository(B2bLead) private readonly leads: Repository<B2bLead>,
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      name?: string;
      company?: string;
      ticker?: string;
      email?: string;
      phone?: string;
      message?: string;
    },
  ) {
    const name = (body?.name || '').trim().slice(0, 160);
    const email = (body?.email || '').trim().toLowerCase().slice(0, 320);
    if (!name) throw new BadRequestException('Name is required.');
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Valid email required.');

    const lead = await this.leads.save(
      this.leads.create({
        name,
        email,
        company: (body?.company || '').trim().slice(0, 200) || null,
        ticker: (body?.ticker || '').trim().toUpperCase().slice(0, 16) || null,
        phone: (body?.phone || '').trim().slice(0, 40) || null,
        message: (body?.message || '').trim().slice(0, 4000) || null,
        source: 'B2B Lead',
      }),
    );

    // Same list as everything else, with the brief's tag.
    const existing = await this.subscribers.findOne({ where: { email } });
    if (!existing) {
      await this.subscribers.save(
        this.subscribers.create({ email, phone: lead.phone, source: 'B2B Lead' }),
      );
    }

    void this.notify(lead);
    return { ok: true, id: lead.id };
  }

  /** Newest first — for the team, behind the admin token. */
  @Get()
  @UseGuards(AdminTokenGuard)
  async list(@Query('limit') limit?: string) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10)));
    return { rows: await this.leads.find({ order: { createdAt: 'DESC' }, take }) };
  }

  private async notify(lead: B2bLead): Promise<void> {
    const to = process.env.B2B_LEAD_NOTIFY;
    const key = process.env.RESEND_API_KEY;
    if (!to || !key) return;
    const from = process.env.EMAIL_FROM || 'InsiderBuying.com <reports@insiderbuying.com>';
    const rows = [
      ['Name', lead.name],
      ['Company', lead.company || '—'],
      ['Ticker', lead.ticker || '—'],
      ['Email', lead.email],
      ['Phone', lead.phone || '—'],
      ['Message', lead.message || '—'],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;font-weight:bold;">${k}</td><td style="padding:6px 10px;">${escapeHtml(String(v))}</td></tr>`,
      )
      .join('');
    await axios
      .post(
        'https://api.resend.com/emails',
        {
          from,
          to: to.split(',').map((t) => t.trim()),
          subject: `B2B lead: ${lead.company || lead.name}${lead.ticker ? ` (${lead.ticker})` : ''}`,
          html:
            `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">` +
            `<h2 style="margin:0 0 12px;">New discovery-call request</h2>` +
            `<table style="border-collapse:collapse;">${rows}</table></div>`,
        },
        { headers: { Authorization: `Bearer ${key}` }, timeout: 15_000 },
      )
      .catch(() => undefined);
  }
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
