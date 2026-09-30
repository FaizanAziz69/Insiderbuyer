import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finding a REAL photograph of the buyer, and the REAL logo of the firm they
 * buy through.
 *
 * WHY THIS EXISTS. The desk's cover had three branches: a photo we hold, a face
 * drawn from a name, or — when the buyer was a fund with no face behind it — an
 * anonymous suited figure seen from behind. The client's verdict on the third,
 * 2026-09-30, looking at the GoldenTree/QVC cover: *"these images thumbnails
 * created are too fake. We need to keep real photos of insiders on here, for
 * these ones that include the hedge fund name, we need to find their logo and
 * work it into a photo of the real insider."*
 *
 * A fund is not faceless. "GoldenTree Asset Management LP" files the Form 4,
 * but GoldenTree is Steven Tananbaum's firm and there is a real, freely
 * licensed photograph of him. The back-of-head silhouette was not a missing
 * photo, it was a lookup we had never written.
 *
 * WHERE THE PICTURES COME FROM. Wikidata, then Wikimedia Commons. Wikidata is a
 * structured graph, so a firm resolves to its people by PROPERTY rather than by
 * reading prose: P112 founded-by, P169 chief-executive, P1037 director. Each of
 * those is an entity that either carries P18 (an image) or does not. The firm
 * itself carries P154 (logo). Everything on Commons ships its licence and
 * author in the same API call, which is what makes the credit line possible —
 * most of these are CC BY, and CC BY without attribution is just taking.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not scrape a firm's own team page
 * and it does not pull a face off an image search. Both would hand us pictures
 * we have no right to put through a generator and no way to credit. A buyer who
 * is not in Wikidata comes back empty, and empty has a good answer now: the
 * censored-subject branch in CoverService, which is a real-looking press
 * photograph with the eyes redacted rather than an invented likeness.
 */

/** A picture on disk, with everything needed to credit it. */
export interface RefImage {
  /** Absolute path to the cached file. */
  path: string;
  /** Author/source, as Commons records it ("World Economic Forum"). */
  credit: string | null;
  /** Short licence name ("CC BY 3.0", "Public domain"). */
  license: string | null;
  /** The Commons file page, so a credit can link to the terms. */
  sourceUrl: string | null;
}

export interface SubjectMaterial {
  /** A real photograph of the person the cover should show. */
  person:
    | (RefImage & {
        /** How the article should name them. */
        display: string;
        /** Why they stand for the filer ("founder of GoldenTree"). */
        role: string | null;
        /** 'registry' = one of our own thumbs; 'wikidata' = fetched. */
        source: 'registry' | 'wikidata';
      })
    | null;
  /** The buying firm's real logo, to be composited onto the finished cover. */
  logo: (RefImage & { firm: string }) | null;
}

const EMPTY: SubjectMaterial = { person: null, logo: null };

/** Wikimedia asks every client to identify itself and blocks the ones that do
 *  not. This is that identification, not decoration. */
const UA =
  'InsiderBuying-EditorialCovers/1.0 (https://insiderbuying.com; devs@insiderbuying.com)';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';

/** Wikidata property ids, named so the queries read as English. */
const P_INSTANCE_OF = 'P31';
const P_HUMAN = 'Q5';
const P_IMAGE = 'P18';
const P_LOGO = 'P154';
const P_DATE_OF_DEATH = 'P570';
/** Qualifier: the date a statement stopped being true. On a P169 that is
 *  "former chief executive". */
const P_END_TIME = 'P582';
/** Who stands for a firm, in the order a reader would accept: the founder whose
 *  name is on the door first, then the chief executive, then a named director.
 *  GoldenTree's CEO has no photograph on Commons and its founder does, so the
 *  order matters less than trying all three. */
const PRINCIPALS: Array<{ prop: string; role: string }> = [
  { prop: 'P112', role: 'founder' },
  { prop: 'P169', role: 'chief executive' },
  { prop: 'P1037', role: 'director' },
];

/** Legal-entity noise that must not take part in matching. Kept separate from
 *  the token filter in person-photos.ts because that one also drops words a
 *  FIRM name legitimately contains ("capital", "partners", "group"): dropping
 *  those here would make "Oaktree Capital" match "Oaktree" the place. */
const LEGAL_SUFFIX =
  /\b(l\.?l\.?c|l\.?l\.?p|l\.?p|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|gmbh|s\.?a|n\.?v|a\/s|pte|pty|trust|the)\b/gi;

/**
 * Filers whose Wikidata entity is PINNED by hand.
 *
 * The search cannot always disambiguate, and when it cannot the right answer is
 * to refuse — five entities answer to "John Malone", one of whom is the cable
 * billionaire who files on Liberty Broadband and four of whom are a footballer,
 * a college basketball player and two researchers. Refusing costs us a face we
 * could legitimately have shown.
 *
 * This is the escape hatch: a name we have checked BY EYE, pinned to the one
 * entity we mean. It is the same kind of object as the registry in
 * person-photos.ts — an editorial decision, written down — and it should grow
 * the same way, one filer at a time, only when someone has actually looked.
 *
 * Every token listed must be present in the filed name, so "Malone John C" and
 * "John C. Malone" both land and "Malone Gregory" does not.
 */
const PINNED: Array<{ tokens: string[]; id: string; why: string }> = [
  { tokens: ['john', 'malone'], id: 'Q3181165', why: 'Liberty Media; 5 homonyms on Wikidata' },
];

/** Words that survive the 3-letter cut but carry no identity, so a label may
 *  add or drop them freely: "The Vanguard Group" is "Vanguard Group Inc". */
const FIRM_FILLER = new Set(['the', 'and', 'for', 'inc', 'ltd', 'llc', 'plc']);

/** Corporate scaffolding at the END of a firm name, stripped one word at a
 *  time by firmVariants. Roman numerals and digits are here because filings
 *  number their vehicles: "Blackstone Holdings IV". */
const STRUCTURAL_TAIL =
  /^(holdings?|partners?|management|capital|investments?|company|group|funds?|advisors?|advisers?|associates|ventures?|trust|international|global|america|usa|[ivx]+|\d+)$/i;

/** How long a miss is believed. A filer who is not in Wikidata today is very
 *  unlikely to be there tomorrow, and the desk asks about the same handful of
 *  funds every day; without this the batch spends its time on 404s. A month is
 *  short enough that a newly created entity still gets picked up. */
const MISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SubjectLookupService {
  private readonly logger = new Logger(SubjectLookupService.name);

  /** Cache root. A SUBFOLDER of editorial-thumbs on purpose: the folder is
   *  already deployed, already backed up and already served, and `refs` is
   *  invisible to everything that reads it — the og prebuild takes only
   *  `*.jpg` at the top level, and the thumb matcher works off a hand-written
   *  list in lib/editorial-thumbs.ts, never a directory scan. */
  private readonly refsDir = join(this.thumbsDir(), 'refs');

  private thumbsDir(): string {
    return (
      process.env.EDITORIAL_THUMBS_DIR ||
      join(process.cwd(), '..', 'frontend', 'public', 'editorial-thumbs')
    );
  }

  /**
   * Everything we can find for this buyer: their face, or their firm's face and
   * its logo.
   *
   * Never throws and never blocks an article. Every failure — no network, a
   * Wikimedia outage, an entity with no picture — returns an empty result, and
   * an empty result is a cover the client has already approved (the censored
   * subject), not a missing cover.
   */
  async lookup(
    buyerName: string,
    opts: { institutional: boolean } = { institutional: false },
  ): Promise<SubjectMaterial> {
    const name = (buyerName || '').trim();
    if (!name) return EMPTY;

    try {
      const cached = this.readCache(name);
      if (cached) return cached;

      const found = opts.institutional
        ? await this.lookupFirm(name)
        : await this.lookupPerson(name);

      this.writeCache(name, found);
      return found;
    } catch (e: any) {
      // A lookup failure must never cost the article its cover, so it is not
      // even cached: the next run gets a clean try.
      this.logger.warn(`subject lookup for "${name}" failed: ${e?.message || e}`);
      return EMPTY;
    }
  }

  /** A named individual: their own Wikidata entity, their own P18. */
  private async lookupPerson(name: string): Promise<SubjectMaterial> {
    const entity = await this.findEntity(this.nameVariants(name), 'human', (e) =>
      // The candidate has to be usable, not merely well-typed. Accepting the
      // first human and only then asking for a picture stops at the first
      // namesake with no photograph and never reaches the one who has one.
      //
      // A dead man did not file this Form 4, and that matters most here: a
      // common name reaches deep into history. "Smith John Q" found John
      // Raphael Smith, an English mezzotint engraver who died in 1812, and he
      // cleared every other test.
      !this.claimValue(e.claims, P_DATE_OF_DEATH, { anyType: true }) &&
      !!this.claimValue(e.claims, P_IMAGE),
    );
    if (!entity) return EMPTY;

    const img = await this.commonsFile(this.claimValue(entity.claims, P_IMAGE) as string, 1000);
    if (!img) return EMPTY;

    return {
      person: { ...img, display: entity.label, role: null, source: 'wikidata' },
      logo: null,
    };
  }

  /**
   * A firm: its logo, and the face of whoever stands for it.
   *
   * Both halves are optional and independent. A firm with a logo and no
   * photographed principal still improves the cover — a real mark on a
   * censored subject beats an invented mark on an invented one.
   */
  private async lookupFirm(name: string): Promise<SubjectMaterial> {
    const entity = await this.findEntity(
      this.firmVariants(name),
      'organisation',
      // Worth stopping for only if it carries a logo or names somebody. A
      // holding company with neither is a correct match that cannot improve
      // the cover, and giving up on it hides the parent that could.
      (e) =>
        !!this.claimValue(e.claims, P_LOGO) ||
        !!this.claimValue(e.claims, P_IMAGE) ||
        PRINCIPALS.some(({ prop }) => this.claimIds(e.claims, prop).length > 0),
    );
    if (!entity) return EMPTY;

    const logoFile =
      this.claimValue(entity.claims, P_LOGO) || this.claimValue(entity.claims, P_IMAGE);
    const logo = logoFile ? await this.commonsFile(logoFile, 1200) : null;

    let person: SubjectMaterial['person'] = null;
    for (const { prop, role } of PRINCIPALS) {
      // `currentOnly` drops statements carrying an end date. Without it a firm
      // resolves to whoever ran it longest, not whoever runs it, and the cover
      // captions a former chief executive as the current one.
      for (const id of this.claimIds(entity.claims, prop, { currentOnly: true })) {
        const who = await this.getEntity(id);
        if (!who || !this.isHuman(who.claims)) continue;
        // A dead founder is the wrong face for a purchase made this quarter.
        // Vanguard resolves to John Bogle, who died in 2019, and Renaissance to
        // Jim Simons, who died in 2024; both would have shipped a photograph of
        // a man who could not have bought anything. Wikidata knows, so ask.
        if (this.claimValue(who.claims, P_DATE_OF_DEATH, { anyType: true })) continue;
        const file = this.claimValue(who.claims, P_IMAGE);
        if (!file) continue;
        const img = await this.commonsFile(file, 1000);
        if (!img) continue;
        person = {
          ...img,
          display: who.label,
          role: `${role} of ${entity.label}`,
          source: 'wikidata',
        };
        break;
      }
      if (person) break;
    }

    if (!person && !logo) return EMPTY;
    return { person, logo: logo ? { ...logo, firm: entity.label } : null };
  }

  // ---------------------------------------------------------------- wikidata

  /**
   * The first search hit whose label really is the name we asked about.
   *
   * `wbsearchentities` is a fuzzy prefix search and will happily return
   * "Goldman Sachs" for "GoldenTree", or an unrelated person who shares a
   * surname. Taking hit zero is how a cover ends up with a stranger's face on
   * it, so every candidate has to clear two bars: its type must be right, and
   * every significant word of the query must appear in its label.
   */
  private async findEntity(
    variants: string[],
    want: 'human' | 'organisation',
    accept: (e: { label: string; claims: any }) => boolean,
  ): Promise<{ id: string; label: string; claims: any } | null> {
    // A pinned entity skips the search entirely — it exists precisely because
    // the search got this name wrong or refused it.
    const pinned = this.pinnedFor(variants[0]);
    if (pinned) {
      const entity = await this.getEntity(pinned);
      if (entity && (want === 'human') === this.isHuman(entity.claims) && accept(entity)) {
        return { id: pinned, label: entity.label, claims: entity.claims };
      }
    }

    for (let i = 0; i < variants.length; i += 1) {
      const q = variants[i];
      // A shortened firm name ("Blackstone" for "Blackstone Holdings IV L.P.")
      // is a guess, and guesses get the strict rule — see labelMatches.
      const strict = want === 'human' || i > 0;
      const hits = await this.search(q);
      const matching = hits.filter((h) => this.labelMatches(h.label, q, want, strict));

      // AMBIGUITY IS A REFUSAL, NOT A COIN TOSS. Wikidata holds three distinct
      // people labelled exactly "John Malone". Nothing in a Form 4 says which,
      // and picking the best-ranked one puts a stranger's face on the site
      // under a real person's name. Two hits wearing the same name end the
      // search for this variant.
      const labels = new Set(matching.map((h) => h.label.toLowerCase().trim()));
      if (matching.length > 1 && labels.size < matching.length) continue;

      for (const hit of matching) {
        const entity = await this.getEntity(hit.id);
        if (!entity) continue;
        const human = this.isHuman(entity.claims);
        if (want === 'human' ? !human : human) continue;
        if (!accept(entity)) continue;
        return { id: hit.id, label: entity.label || hit.label, claims: entity.claims };
      }
    }
    return null;
  }

  /** The pinned entity for this name, if one was written down for it. */
  private pinnedFor(name: string): string | null {
    const have = new Set(
      (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
    return PINNED.find((p) => p.tokens.every((t) => have.has(t)))?.id ?? null;
  }

  private async search(term: string): Promise<Array<{ id: string; label: string }>> {
    const url =
      `${WIKIDATA}?action=wbsearchentities&format=json&language=en&uselang=en&limit=5` +
      `&search=${encodeURIComponent(term)}`;
    const body: any = await this.json(url);
    return (body?.search || []).map((s: any) => ({ id: s.id, label: s.label || '' }));
  }

  private async getEntity(id: string): Promise<{ label: string; claims: any } | null> {
    const url =
      `${WIKIDATA}?action=wbgetentities&format=json&languages=en&props=labels%7Cclaims` +
      `&ids=${encodeURIComponent(id)}`;
    const body: any = await this.json(url);
    const e = body?.entities?.[id];
    if (!e) return null;
    return { label: e.labels?.en?.value || '', claims: e.claims || {} };
  }

  private isHuman(claims: any): boolean {
    return this.claimIds(claims, P_INSTANCE_OF).includes(P_HUMAN);
  }

  /**
   * Value of the first statement for a property.
   *
   * Commons filenames are plain strings; dates are objects. `anyType` is for
   * the callers that only need to know whether the statement EXISTS — a date
   * of death, say — and would otherwise read a present date as absent because
   * it is not a string.
   */
  private claimValue(
    claims: any,
    prop: string,
    opts: { anyType?: boolean } = {},
  ): string | null {
    const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
    if (typeof v === 'string') return v;
    return opts.anyType && v != null ? String(v?.time ?? true) : null;
  }

  /** Entity ids of every statement for a property, newest first when dated. */
  private claimIds(claims: any, prop: string, opts: { currentOnly?: boolean } = {}): string[] {
    return (claims?.[prop] || [])
      .filter((s: any) => !opts.currentOnly || !s?.qualifiers?.[P_END_TIME])
      .map((s: any) => s?.mainsnak?.datavalue?.value?.id)
      .filter((id: any): id is string => typeof id === 'string');
  }

  // ----------------------------------------------------------------- commons

  /**
   * Download a Commons file and record its terms.
   *
   * `iiurlwidth` is what keeps this honest about bandwidth: the Tananbaum
   * original is a 220 KB PNG and some Commons portraits are 40 MB TIFFs, and
   * the generator is fed a 1000px reference either way.
   */
  private async commonsFile(fileName: string, width: number): Promise<RefImage | null> {
    const title = `File:${fileName}`;
    const url =
      `${WIKIPEDIA}?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata` +
      `&iiurlwidth=${width}&titles=${encodeURIComponent(title)}`;
    const body: any = await this.json(url);
    const page: any = Object.values(body?.query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    if (!info) return null;

    // thumburl is absent for formats Commons cannot thumbnail (SVG logos come
    // back as PNG, but a few types do not); the full file is the fallback.
    const src: string = info.thumburl || info.url;
    if (!src) return null;

    const ext = this.extensionFor(src);
    // sharp reads JPEG, PNG and WebP; an SVG or a TIFF would have to be
    // rasterised first, and skipping is better than shipping a broken ref.
    if (!ext) return null;

    const dest = join(this.refsDir, `${this.slug(fileName)}.${ext}`);
    if (!existsSync(dest)) {
      const bytes = await this.bytes(src);
      if (!bytes) return null;
      mkdirSync(this.refsDir, { recursive: true });
      writeFileSync(dest, bytes);
    }

    const meta = info.extmetadata || {};
    return {
      path: dest,
      credit: this.plain(meta.Artist?.value || meta.Credit?.value) || null,
      license: this.plain(meta.LicenseShortName?.value) || null,
      sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    };
  }

  /** Commons Artist fields are HTML ("<a href=…>World Economic Forum</a>"). */
  private plain(html: string | undefined): string {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  }

  private extensionFor(url: string): 'jpg' | 'png' | 'webp' | null {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpg';
    if (clean.endsWith('.png')) return 'png';
    if (clean.endsWith('.webp')) return 'webp';
    return null;
  }

  // ------------------------------------------------------------------- names

  /**
   * The shapes a person's name arrives in.
   *
   * Form 4 reporting owners are surname-first and unpunctuated ("Tananbaum
   * Steven", "Monroe James III"); prose and congressional rows are natural
   * ("Steven Tananbaum"). Wikidata labels are natural, so the reversed form has
   * to be offered too or every Form 4 filer misses.
   */
  private nameVariants(name: string): string[] {
    const clean = name.replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean
      .split(' ')
      .filter((w) => w && !/^(jr|sr|ii|iii|iv|md|phd|et|al)\.?$/i.test(w));
    // Middle initials are the common miss. "Icahn Carl C" reversed is "Carl C
    // Icahn", which Wikidata's search does not find, while "Carl Icahn" is hit
    // one. Every filing carrying an initial — most of them — depends on this.
    const ws = words.filter((w) => w.replace(/\./g, '').length > 1);

    const out: string[] = [];
    const push = (...parts: string[]) => {
      const s = parts.filter(Boolean).join(' ').trim();
      if (s) out.push(s);
    };

    push(...ws);
    if (ws.length >= 2) push(...ws.slice(1), ws[0]);
    // TWO NAMES, AND ONLY TWO. A filing carries every name a person has —
    // "Tan Anthony Ping Yeow" — and Wikidata labels them the way the world
    // does, "Anthony Tan". Neither full ordering finds anything at all, so the
    // pair has to be asked for directly: given+surname read both ways round,
    // because the filing's own order is a convention we cannot rely on.
    if (ws.length > 2) {
      push(ws[1], ws[0]);
      push(ws[0], ws[ws.length - 1]);
    }
    if (words.length !== ws.length) {
      push(...words);
      if (words.length >= 2) push(...words.slice(1), words[0]);
    }
    return [...new Set(out)];
  }

  /**
   * A firm, progressively shortened from the tail.
   *
   * SEC filings name the VEHICLE, Wikidata names the HOUSE. "Blackstone
   * Holdings IV L.P." is a real filer and there is no such Wikidata entity —
   * searching it returns nothing at all — while "Blackstone" returns Blackstone
   * Inc. with its logo, its founders and its chief executive. Every word after
   * the distinctive one is corporate scaffolding, so it comes off one word at a
   * time and each stage is tried in turn.
   *
   * Shortening is a guess, which is why findEntity marks every variant after
   * the first as strict: "Juniper Investment Company, LLC" shortens to
   * "Juniper", whose best hit is Juniper Networks, and the strict rule is what
   * throws it out.
   */
  private firmVariants(name: string): string[] {
    const clean = name.replace(/[^A-Za-z0-9 &.'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const stripped = clean
      .replace(LEGAL_SUFFIX, ' ')
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const out = [stripped, clean];
    let words = stripped.split(' ').filter(Boolean);
    while (words.length > 1 && STRUCTURAL_TAIL.test(words[words.length - 1])) {
      words = words.slice(0, -1);
      out.push(words.join(' '));
    }
    return [...new Set(out.filter((s) => s.length > 2))];
  }

  /**
   * Does this label actually name the thing we searched for?
   *
   * There are two failure directions and they need different rules, because a
   * wrong face costs far more than a miss — a miss falls through to the
   * censored subject, which the client has already approved.
   *
   * A FIRM, matched on its FULL filed name, only has to CONTAIN every word of
   * the query. Labels legitimately carry words the filing drops: "Nippon Life
   * Insurance Company" for "NIPPON LIFE INSURANCE CO".
   *
   * STRICT, which covers every person and every SHORTENED firm name, adds the
   * other direction: the label may not introduce a word we did not ask for.
   * That is what separates the two hardest cases in this file.
   *
   *   "Anthony Tan" is a legitimate label for "Tan Anthony Ping Yeow" — a
   *   label may DROP given names, and it does so constantly.
   *   "John Raphael Smith" is not a legitimate label for "Smith John Q" — the
   *   label ADDED "Raphael", and that engraver died in 1812.
   *   "Blackstone Inc." is right for a shortened "Blackstone" ("inc" is
   *   filler); "Juniper Networks" is wrong for a shortened "Juniper", because
   *   "networks" is a word the filing never contained.
   *
   * Two words minimum on a person, so a bare surname cannot match a whole
   * family.
   */
  private labelMatches(
    label: string,
    query: string,
    want: 'human' | 'organisation',
    strict: boolean,
  ): boolean {
    const words = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !FIRM_FILLER.has(w));
    const have = words(label);
    const asked = words(query);
    if (!asked.length || !have.length) return false;

    if (!strict) return asked.every((w) => have.includes(w));

    if (want === 'human' && have.length < 2) return false;
    const askedSet = new Set(asked);
    if (!have.every((w) => askedSet.has(w))) return false;
    // The label may drop given names, but never the last one asked for: on a
    // Form 4 that is the surname, and it is the word that identifies.
    return have.includes(asked[asked.length - 1]) || have.includes(asked[0]);
  }

  // ------------------------------------------------------------------- cache

  /** One JSON sidecar per buyer, holding the resolved paths and their terms.
   *  Hits never expire (a Commons file does not change under its own name);
   *  misses expire, because an entity can be created later. */
  private cachePath(name: string): string {
    return join(this.refsDir, `lookup-${this.slug(name.toLowerCase())}.json`);
  }

  private readCache(name: string): SubjectMaterial | null {
    const p = this.cachePath(name);
    if (!existsSync(p)) return null;
    try {
      const row = JSON.parse(readFileSync(p, 'utf8'));
      const empty = !row.value?.person && !row.value?.logo;
      if (empty && Date.now() - (row.at || 0) > MISS_TTL_MS) return null;
      // A cached path whose file has since been cleaned up is not a hit.
      if (row.value?.person?.path && !existsSync(row.value.person.path)) return null;
      if (row.value?.logo?.path && !existsSync(row.value.logo.path)) return null;
      return row.value as SubjectMaterial;
    } catch {
      return null;
    }
  }

  private writeCache(name: string, value: SubjectMaterial): void {
    try {
      mkdirSync(this.refsDir, { recursive: true });
      writeFileSync(this.cachePath(name), JSON.stringify({ at: Date.now(), value }, null, 2));
    } catch {
      /* a cache that cannot be written is a slow lookup, not a failure */
    }
  }

  private slug(s: string): string {
    return s
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 90);
  }

  // ------------------------------------------------------------------- fetch

  /** One retry, because a batch makes twenty of these calls in a row and a
   *  single dropped connection would otherwise cache a miss for a month. */
  private async json(url: string): Promise<any> {
    let last: any;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 80)}`);
        return await res.json();
      } catch (e) {
        last = e;
        // Wikimedia resets connections under a burst. A short pause is the
        // difference between a retry that works and one that fails the same
        // way a millisecond later.
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    throw last;
  }

  private async bytes(url: string): Promise<Buffer | null> {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
}
