import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * ActiveCampaign sync for the funnel (Round-2 brief, Section 2: "All flows
 * must connect to ActiveCampaign (or current email provider) via API").
 *
 * Every capture in the funnel — both popups, the /join pre-sell page and the
 * $3 report purchase — passes through here with its tag. The service is
 * OPTIONAL by design: with no credentials configured it logs once and does
 * nothing, so the site's own list (subscribers table + Resend flows) stays the
 * source of truth until ops sets:
 *
 *   ACTIVECAMPAIGN_API_URL=https://<account>.api-us1.com
 *   ACTIVECAMPAIGN_API_KEY=<key from Settings → Developer>
 *
 * Failures never propagate: a CRM hiccup must not fail a visitor's opt-in.
 */
@Injectable()
export class ActiveCampaignService {
  private readonly logger = new Logger(ActiveCampaignService.name);
  /** Tag name → AC tag id, resolved once per process. */
  private tagIds = new Map<string, number>();
  private warned = false;

  private get baseUrl(): string {
    return (process.env.ACTIVECAMPAIGN_API_URL || '').replace(/\/$/, '');
  }

  private get apiKey(): string {
    return process.env.ACTIVECAMPAIGN_API_KEY || '';
  }

  get enabled(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  private headers() {
    return { 'Api-Token': this.apiKey, 'Content-Type': 'application/json' };
  }

  /**
   * Upsert the contact and apply `tag` (the brief's 'source:…' tags, e.g.
   * 'popup-30s', 'Sales Opt In', 'purchased:$3-report'). Fire-and-forget:
   * callers should not await success.
   */
  async syncContact(email: string, tag: string): Promise<void> {
    if (!this.enabled) {
      if (!this.warned) {
        this.warned = true;
        this.logger.log(
          'ActiveCampaign not configured (ACTIVECAMPAIGN_API_URL / _API_KEY) — ' +
            'funnel leads stay on the local list + Resend flows.',
        );
      }
      return;
    }
    try {
      const contactId = await this.upsertContact(email);
      if (!contactId) return;
      const tagId = await this.ensureTag(tag);
      if (!tagId) return;
      await axios.post(
        `${this.baseUrl}/api/3/contactTags`,
        { contactTag: { contact: contactId, tag: tagId } },
        { headers: this.headers(), timeout: 15_000 },
      );
      this.logger.log(`ActiveCampaign: ${email} tagged "${tag}"`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`ActiveCampaign sync failed for "${tag}": ${msg}`);
    }
  }

  /** POST /api/3/contact/sync — creates or updates by email. */
  private async upsertContact(email: string): Promise<string | null> {
    const res = await axios.post(
      `${this.baseUrl}/api/3/contact/sync`,
      { contact: { email } },
      { headers: this.headers(), timeout: 15_000 },
    );
    const id = res.data?.contact?.id;
    return id ? String(id) : null;
  }

  /** Find the tag by name, create it when the account does not have it yet. */
  private async ensureTag(name: string): Promise<number | null> {
    const cached = this.tagIds.get(name);
    if (cached) return cached;
    const found = await axios.get(`${this.baseUrl}/api/3/tags`, {
      headers: this.headers(),
      params: { 'filters[search][eq]': name, limit: 100 },
      timeout: 15_000,
    });
    const match = (found.data?.tags || []).find(
      (t: { tag?: string; id?: string }) => t.tag === name,
    );
    let id = match?.id ? Number(match.id) : null;
    if (!id) {
      const created = await axios.post(
        `${this.baseUrl}/api/3/tags`,
        { tag: { tag: name, tagType: 'contact', description: 'InsiderBuying funnel' } },
        { headers: this.headers(), timeout: 15_000 },
      );
      id = created.data?.tag?.id ? Number(created.data.tag.id) : null;
    }
    if (id) this.tagIds.set(name, id);
    return id;
  }
}
