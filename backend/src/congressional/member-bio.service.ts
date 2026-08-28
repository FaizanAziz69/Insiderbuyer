import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Company } from '../entities/company.entity';
import { CivicService } from './civic.service';
import { CongressionalService } from './congressional.service';

/**
 * Politician "About" blurb for the Congress Bubbles click panel (client request
 * 2026-08-28): "Kevin H is a Republican who sits on the Energy committee … he is
 * most influential on matters such as abc, xyz."
 *
 * Grounding, in order of trust:
 *   1. @unitedstates legislators roster — party, state, chamber, and the
 *      committees the member actually sits on (public domain, refreshed weekly
 *      by CongressionalService).
 *   2. Wikipedia lead paragraph (politician-guarded) and Congress.gov sponsored
 *      legislation titles when a key is configured (CivicService).
 *   3. The model writes 2–3 sentences and a short "influence" list from those
 *      facts only. Committees are never invented: the prompt lists them and the
 *      response echoes the list we passed, not a generated one.
 *
 * Cached 30 days in politician_bio_cache (raw-SQL, created on demand). A
 * failed generation is never cached, so the next open retries.
 */

export interface MemberBio {
  name: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  committees: string[];
  /** 2–3 plain sentences in the requested style. */
  summary: string;
  /** 3–6 short policy areas, e.g. "energy permitting", "defense appropriations". */
  influence: string[];
  source: string;
  generatedAt: string;
}

const MODEL = process.env.POLITICIAN_BIO_MODEL || process.env.INSIDER_BIO_MODEL || 'claude-opus-5';
const TTL_MS = 30 * 86_400_000;

function partyWord(p: string | null): string | null {
  if (!p) return null;
  const c = p.charAt(0).toUpperCase();
  return c === 'D' ? 'Democrat' : c === 'R' ? 'Republican' : c === 'I' ? 'Independent' : p;
}

@Injectable()
export class MemberBioService {
  private readonly logger = new Logger(MemberBioService.name);
  private readonly client: Anthropic | null;
  private tableReady = false;
  private readonly mem = new Map<string, { ts: number; data: MemberBio }>();
  private readonly inflight = new Map<string, Promise<MemberBio | null>>();

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly congress: CongressionalService,
    private readonly civic: CivicService,
  ) {
    const key = process.env.ANTHROPIC_API_KEY;
    this.client = key ? new Anthropic({ apiKey: key }) : null;
  }

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await this.companies.query(`CREATE TABLE IF NOT EXISTS politician_bio_cache (
      name_key    text PRIMARY KEY,
      payload     jsonb NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    this.tableReady = true;
  }

  private key(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async get(name: string): Promise<MemberBio | null> {
    const key = this.key(name);
    if (!key) return null;
    const hit = this.mem.get(key);
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.load(name, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async load(name: string, key: string): Promise<MemberBio | null> {
    try {
      await this.ensureTable();
      const rows = await this.companies.query(`SELECT payload, "updatedAt" FROM politician_bio_cache WHERE name_key = $1`, [key]);
      const row = rows?.[0];
      if (row?.payload && Date.now() - new Date(row.updatedAt).getTime() < TTL_MS) {
        const data = row.payload as MemberBio;
        this.mem.set(key, { ts: Date.now(), data });
        return data;
      }
    } catch (e: any) {
      this.logger.warn(`politician bio read failed for ${name}: ${e?.message || e}`);
    }

    const meta = await this.congress.memberMeta(name);
    const [extras, bills] = await Promise.all([
      this.civic.getMemberExtras(name).catch(() => ({ bio: null as string | null, birthYear: null, birthDate: null })),
      this.civic.getSponsoredLegislation(name).catch(() => []),
    ]);
    const data = await this.generate({
      name,
      party: meta.party,
      state: meta.state,
      chamber: meta.chamber,
      committees: meta.committees,
      wiki: extras.bio,
      bills: bills.slice(0, 8).map((b) => b.title).filter(Boolean),
    });
    if (!data) return null;
    this.mem.set(key, { ts: Date.now(), data });
    try {
      await this.companies.query(
        `INSERT INTO politician_bio_cache (name_key, payload, "updatedAt") VALUES ($1, $2::jsonb, now())
         ON CONFLICT (name_key) DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()`,
        [key, JSON.stringify(data)],
      );
    } catch (e: any) {
      this.logger.warn(`politician bio write failed for ${name}: ${e?.message || e}`);
    }
    return data;
  }

  private async generate(f: {
    name: string;
    party: string | null;
    state: string | null;
    chamber: string | null;
    committees: string[];
    wiki: string | null;
    bills: string[];
  }): Promise<MemberBio | null> {
    const party = partyWord(f.party);
    // Without a model we still return the factual half — party, seat, committees.
    if (!this.client) {
      if (!party && !f.committees.length) return null;
      const seat = [party, f.chamber ? `${f.chamber === 'Senate' ? 'U.S. Senator' : 'U.S. Representative'}${f.state ? ` from ${f.state}` : ''}` : null].filter(Boolean).join(' ');
      return {
        name: f.name,
        party: f.party,
        state: f.state,
        chamber: f.chamber,
        committees: f.committees,
        summary: `${f.name} is a ${seat}${f.committees.length ? ` who sits on the ${f.committees.slice(0, 3).join(', ')}` : ''}.`,
        influence: [],
        source: 'Congressional roster (@unitedstates)',
        generatedAt: new Date().toISOString(),
      };
    }

    const facts = [
      `Name: ${f.name}`,
      party ? `Party: ${party}` : 'Party: unknown',
      f.chamber ? `Chamber: ${f.chamber}` : '',
      f.state ? `State: ${f.state}` : '',
      f.committees.length ? `Committee assignments (authoritative — use ONLY these): ${f.committees.join('; ')}` : 'Committee assignments: none on record',
      f.bills.length ? `Recently sponsored legislation (titles): ${f.bills.join(' | ')}` : '',
      f.wiki ? `Public biography (Wikipedia lead): ${f.wiki.slice(0, 700)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const schema: Record<string, unknown> = {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: {
          type: 'string',
          description:
            'Two or three plain third-person sentences for a reader who has never heard the name, in this shape: "<First name + surname> is a <party> who represents <state> in the <chamber> and sits on the <committee(s)>. <One sentence on what they are known for, from the biography, if any>. They are most influential on matters such as <2–4 areas>." Use ONLY the supplied facts. If committees are none on record, say so instead of inventing one.',
        },
        influence: {
          type: 'array',
          items: { type: 'string' },
          description:
            '3 to 6 short lower-case policy areas (2–4 words each, e.g. "energy permitting", "defense appropriations", "banking regulation") derived from the committee assignments and sponsored bills. Empty array if there is nothing to derive from.',
        },
      },
      required: ['summary', 'influence'],
    };

    const system =
      'You write short neutral "About" blurbs for members of the U.S. Congress on a financial-data site. These are real, named public officials, so accuracy outranks completeness. ' +
      'State party, state, chamber and committee assignments exactly as supplied — never add a committee, leadership title, or vote that is not in the facts. Areas of influence must follow directly from the listed committees and bills. ' +
      'No opinions, no praise or criticism, no speculation about their trading, no investment advice. Plain English, present tense.';

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 700,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: `Write the About blurb for this member of Congress.\n\n${facts}` }],
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) return null;
      const parsed = JSON.parse(text) as { summary?: string; influence?: unknown[] };
      const summary = String(parsed.summary || '').trim();
      if (!summary) return null;
      const influence = Array.isArray(parsed.influence)
        ? parsed.influence.map((x) => String(x || '').trim().toLowerCase()).filter((x) => x && x.length <= 40).slice(0, 6)
        : [];
      return {
        name: f.name,
        party: f.party,
        state: f.state,
        chamber: f.chamber,
        committees: f.committees,
        summary,
        influence,
        source: `Congressional roster (@unitedstates)${f.wiki ? ', Wikipedia' : ''}${f.bills.length ? ', Congress.gov' : ''}`,
        generatedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      this.logger.warn(`politician bio generation failed for ${f.name}: ${e?.message || e}`);
      return null;
    }
  }
}
