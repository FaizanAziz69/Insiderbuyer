import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { printBrandmark } from './brandmark';
import { enforceCensorBar } from './censor-bar';

/**
 * Cover art for the daily desk, in the editorial-thumbs house look.
 *
 * WHY STYLE REFERENCES AND NOT JUST A PROMPT. The client's requirement is that
 * a generated cover is indistinguishable from the 47 files already in
 * public/editorial-thumbs. Words alone do not get there: prompting "duotone
 * collage, desaturated hero" produces something in the right family but with a
 * different grade, a different crop and a cleaner background every time. So
 * every request also carries two or three ACTUAL thumbs from the folder as
 * image inputs, labelled as style exemplars. The model matches what it can see.
 *
 * The recipe in HOUSE_LOOK was read off all 47 files (2026-09-22/23):
 *   hero person cut out, BIG, head near the top edge, torso cropped by the
 *   bottom, about a third of the frame wide; usually desaturated black and
 *   white with grain; background a COLLAGE of the story's own scenes and
 *   objects, layered and repeated; ONE strong colour grade over the whole
 *   background; often a thin tabloid halo in a clashing colour; grunge, grain
 *   and torn-paper texture; background signage and ticker numbers welcome.
 *
 * The one thing that never appears is the article's own headline: the page
 * draws that over the image, so lettering inside the art would double it.
 */

/** Exemplars chosen to span the look: a desaturated hero on an orange collage,
 *  a white-haloed hero on teal, and a money/chart background. Two are sent per
 *  request (rotating) so the model generalises the treatment instead of
 *  copying one picture's subject. */
const STYLE_EXEMPLARS = [
  'carl-icahn-fertilizer.jpg',
  'musk-congress-wealth.jpg',
  'buffett-value-stock.jpg',
  'kash-patel-shein.jpg',
  'englander-nvidia-etf.jpg',
];

/**
 * The lettering rule, and why it is this specific.
 *
 * The folder DOES carry incidental type: a brand mark on a building, digits on
 * a ticker board, a torn scrap of newsprint. What it never carries is a slab of
 * readable document. The first object cover this service produced was a wall of
 * invented "CONGRESSIONAL TRADE DISCLOSURE" forms whose paragraphs were
 * gibberish, because the scene asked for forms and the model obliged. Any
 * surface a model expects to be covered in words (a document, a form, a
 * contract, a filing, a newspaper page, a screen of prose) comes back as fake
 * text, and fake text on a news cover is worse than no cover.
 */
const NO_TEXT_RULE =
  'Do NOT write any headline, caption, title or watermark into the image, and ' +
  'do not fill the frame with documents, forms, contracts, filings, newspaper ' +
  'pages or screens of prose. ' +
  // The earlier version of this rule allowed "digits on a ticker board" and "a
  // brand mark on a storefront" as incidental. On a finance cover neither is
  // incidental. The semis roundup came back with NVDA -1.60 and TSM -1.45
  // readable on screen beside IKIE -0.70 and SGU -7.20 — tickers that do not
  // exist, at prices nobody quoted — under a Bloomberg logo on two monitors.
  // A publication whose rule is that nothing invents a fact cannot put invented
  // prices on its own cover, and a mark the model draws from memory is invented
  // too. The buying firm's real logo does reach some covers — it is composited
  // from the file Wikimedia served, after generation, by brandmark.ts — which
  // is precisely why the model is still told to draw none: on a finished cover
  // the only legible thing is the one mark we fetched and can name.
  // Retail and studio scenes leak numbers the ticker-board clause never
  // anticipated: a QVC set came back with $179.00 and $30.00 legible on two
  // product cards. A price is a price wherever it is printed, so the list has
  // to name shelf edges and price tags too.
  'Screens, ticker boards, price displays, price tags, shelf labels and ' +
  'product signage must be present but UNREADABLE: out of focus, ' +
  'motion-blurred, seen at a steep angle, or too far away to resolve. No ' +
  'legible ticker symbols, no legible prices or percentages, no legible ' +
  'numbers of any kind, anywhere in the frame. ' +
  'No company logos, no brand marks, no trademarks, no product names — not on ' +
  'screens, buildings, signage, clothing or equipment. ' +
  'Small unreadable lettering that reads as texture is fine. Nothing a viewer ' +
  'could quote.';


const HOUSE_LOOK =
  'Match the visual treatment of the reference cover images exactly: the same ' +
  'kind of photo-collage background built from the story\'s own scenes and ' +
  'objects layered at different scales, the same single strong colour grade ' +
  'across the whole background, the same grain, grunge and halftone texture, ' +
  'the same tabloid-magazine energy. Fill the frame edge to edge. ' +
  NO_TEXT_RULE;


const HERO_TREATMENT =
  'Make the person the hero: cut out, large in the frame, head near the top ' +
  'edge, body cropped by the bottom edge, their head about a third of the ' +
  'picture wide. Render them in high-contrast desaturated black and white with ' +
  'visible film grain so they separate sharply from the colour-graded ' +
  'background, exactly as in the reference covers.';

/**
 * The cover for a story whose subject we hold no photograph of.
 *
 * Three client passes landed here, and the last one is the rule.
 *
 *  - George, 2026-09-25: "show generic people in suits" — a figure seen from
 *    behind, or in silhouette.
 *  - The client, 2026-09-30, on what that produced: "too fake … if you can't
 *    find their face just cover the eyes with a black line." Silhouette out,
 *    front-facing press photograph with a printed bar in.
 *  - The client, 2026-10-01, on the ADARx / Baker Bros / Brown Brothers covers
 *    that produced: the bar is too big and the real answer is upstream —
 *    *"market mein dekho hot topics, top stories jin ke image find ho wo
 *    publish kardo … unke image asani se aaye with no black stripe, in case koi
 *    nai milta phir laga dena."* Pick subjects we can photograph; the bar is the
 *    fallback, and a small one.
 *
 * So this branch is no longer where the desk expects to land — see the portrait
 * ranking in DailyDeskService, which sorts a buyer we can photograph to the
 * front of the pool — and the bar it carries is the admission that we could
 * not. What it must never be is an invented likeness wearing a real person's
 * name: "George Simeon" resolves on Wikidata to an American anthropologist and
 * an English politician, neither of whom filed that Form 4.
 *
 * THE BAR IS NOT ASKED FOR ANY MORE. It used to be part of this prompt and the
 * model drew it at whatever weight it liked — about 15% of the frame, the slab
 * the client objected to. Asking for a clean photograph and painting the stripe
 * afterwards (censor-bar.ts) is the only way its size is ours. The clause
 * telling the model NOT to draw one is load bearing: without it the model
 * volunteers a bar anyway, and a bar already on the picture has to be covered
 * whole rather than restyled.
 */
const CENSORED_SUBJECT =
  'We hold NO photograph of the person this story is about, so the cover must ' +
  'show an ANONYMISED subject. Do not depict any identifiable real individual, ' +
  'living or dead, and do not reproduce the face of any public figure. ' +
  'Depict one adult in business dress as a REAL, straight, front-facing press ' +
  'photograph: a documentary news picture with natural skin texture, real ' +
  'fabric, real depth of field and the slightly imperfect framing of a working ' +
  'photographer. It must look photographed — never illustrated, never ' +
  'rendered, never a smiling stock portrait. ' +
  'Leave the face clean and unobstructed: do NOT draw a censor bar, a black ' +
  'rectangle, a blur, a mask, sunglasses or any other covering over the eyes. ' +
  'The redaction is printed on afterwards and must not be in the picture you ' +
  'make. ';

/**
 * Asked for whenever a real logo is going to be printed into the corner
 * afterwards. The model is never told what the mark is or shown it — only to
 * keep that corner quiet, so the composite lands on flat graded colour instead
 * of on somebody's face or the busiest part of the collage.
 */
const LOGO_SPACE =
  'Leave the upper-left corner of the background calm and uncluttered — a plain ' +
  'block of the graded colour with no important detail and nothing the eye ' +
  'needs — and keep the cut-out subject clear of it. ';

const KEEP_LIKENESS =
  'The first reference image is a photograph of the real person this cover is ' +
  'about. Keep their face, hair, build and clothing exactly as they are: the ' +
  'likeness must not change. ';

export interface CoverRequest {
  /** File stem, normally the article slug. */
  name: string;
  /** What fills the background, in plain words. */
  scene: string;
  /** The one colour the background is graded in. */
  grade: string;
  /** Optional tabloid cutout halo colour. */
  halo?: string;
  /** Absolute path to a photograph of the subject, when we hold one. */
  personRef?: string | null;
  /**
   * The person the story is about, when we hold no photograph of them.
   *
   * Client decision 2026-09-23: the cover shows whoever the article is about,
   * so a subject without a picture on file still gets a hero portrait, drawn
   * from the description rather than copied from a reference. The likeness is
   * then the model's reading of a public figure, which is close for someone
   * widely photographed and a plausible stranger for someone who is not. That
   * is the trade the client chose; `fromPhoto` on the result records which of
   * the two any given cover was.
   */
  personName?: string | null;
  /** Role and company, used to place an unphotographed subject. */
  personContext?: string | null;
  /**
   * Absolute path to the buying firm's REAL logo, when we found one.
   *
   * It is never shown to the model. It is printed onto the finished image by
   * `printBrandmark`, so the mark on the cover is the file Wikimedia served
   * rather than the model's recollection of it — see brandmark.ts for why that
   * distinction is the whole feature.
   */
  logoRef?: string | null;
}

export interface CoverResult {
  /** Site-relative URL to store on the post. */
  url: string;
  width: number;
  height: number;
  ogBytes: number;
  /** True when a real photograph drove the likeness. */
  fromPhoto: boolean;
  /** True when the real firm logo was printed onto the finished cover. */
  logoPrinted: boolean;
  /** True when the subject is an anonymised figure behind a censor bar. */
  censored: boolean;
}

const W = 1606;
const H = 1000;
const OG_WIDTH = 1200;
const OG_MAX_BYTES = 200_000;

@Injectable()
export class CoverService {
  private readonly logger = new Logger(CoverService.name);

  /** public/editorial-thumbs, resolved from the backend's own location so it
   *  works both in the repo and in /opt/insider/app on the box. */
  private readonly thumbsDir =
    process.env.EDITORIAL_THUMBS_DIR ||
    join(process.cwd(), '..', 'frontend', 'public', 'editorial-thumbs');

  private readonly model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';

  isReady(): boolean {
    return !!process.env.GEMINI_API_KEY && existsSync(this.thumbsDir);
  }

  /** Generate one cover and write both the full-size file and its OG copy.
   *  Returns null on any failure: a missing cover is a fallback to the curated
   *  library, never a reason to drop the article. */
  async generate(req: CoverRequest): Promise<CoverResult | null> {
    if (!this.isReady()) {
      this.logger.warn('cover generation not configured (GEMINI_API_KEY / thumbs dir)');
      return null;
    }
    try {
      const parts: any[] = [];
      const fromPhoto = !!(req.personRef && existsSync(req.personRef));
      if (fromPhoto) parts.push(this.inlineImage(req.personRef as string));
      for (const ex of this.exemplarsFor(req.name)) parts.push(this.inlineImage(ex));

      // Three treatments, one ladder. Only the last one redacts.
      const mode: 'photo' | 'named' | 'censored' = fromPhoto
        ? 'photo'
        : req.personName
          ? 'named'
          : 'censored';
      const drawPerson = mode !== 'censored';
      const withLogo = !!(req.logoRef && existsSync(req.logoRef));
      const instruction =
        (fromPhoto ? KEEP_LIKENESS : '') +
        (!fromPhoto && req.personName
          ? `The cover is about ${req.personName}${req.personContext ? `, ${req.personContext}` : ''}. ` +
            'Depict them as a real adult person in business dress, photorealistic. '
          : '') +
        (mode === 'censored' ? CENSORED_SUBJECT : '') +
        HERO_TREATMENT +
        ' ' +
        (withLogo ? LOGO_SPACE : '') +
        `The background collage shows: ${req.scene}. ` +
        `Grade the whole background in ${req.grade}. ` +
        (req.halo
          ? `Trace a thin ${req.halo} halo outline around the cut-out subject, like a printed tabloid cutout. `
          : '') +
        HOUSE_LOOK +
        (fromPhoto
          ? ' The reference images after the first one are style exemplars: copy their treatment, never their subjects.'
          : ' The reference images are style exemplars: copy their treatment, never their subjects.');

      parts.push({ text: instruction });

      const raw = await this.callModel(parts);
      if (!raw) return null;

      const sharp = await this.sharp();
      const dest = join(this.thumbsDir, `${req.name}.jpg`);
      let framed = await sharp(raw)
        // 16:9 comes back wider than the house 1.606, so about 10% leaves the
        // sides. "attention" keeps the busiest region, which on these covers is
        // the face; a plain centre crop has clipped a shoulder before now.
        .resize(W, H, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 88, progressive: false, mozjpeg: true })
        .toBuffer();

      // The redaction is enforced BEFORE the logo, so the detector sees the
      // cover the generator made rather than one with a brand mark added to
      // confuse it, and so a repainted bar cannot land on top of the logo.
      let censorAction = 'n/a';
      if (!drawPerson) {
        const censored = await enforceCensorBar(
          sharp,
          framed,
          process.env.GEMINI_API_KEY as string,
        );
        framed = censored.image;
        censorAction = censored.action;
      }

      // The real mark goes on AFTER the crop, so it cannot be cropped, scaled
      // or softened by anything downstream.
      let logoPrinted = false;
      if (withLogo) {
        const marked = await printBrandmark(sharp, framed, req.logoRef as string);
        if (marked) {
          framed = marked.image;
          logoPrinted = true;
        } else {
          this.logger.warn(`cover ${req.name}: logo ${req.logoRef} could not be printed`);
        }
      }
      writeFileSync(dest, framed);

      // The OG copy the unfurl needs: 1200 wide, BASELINE (WhatsApp rejects
      // progressive) and under 200 KB (over ~300 KB it drops the card).
      let og: Buffer | undefined;
      for (let q = 82; q >= 40; q -= 6) {
        og = await sharp(dest)
          .resize({ width: OG_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: q, progressive: false, mozjpeg: true })
          .toBuffer();
        if (og.length <= OG_MAX_BYTES) break;
      }
      writeFileSync(join(this.thumbsDir, 'og', `${req.name}.jpg`), og as Buffer);

      // Three outcomes, not two. Reporting "object cover" whenever there was no
      // photograph on file hid the fact that a subject HAD been drawn from
      // their name: the Grab cover carried Anthony Tan and the log denied it.
      const how = {
        photo: 'from photo',
        named: 'person drawn from name',
        censored: 'censored subject',
      }[mode];
      this.logger.log(
        `cover ${req.name}.jpg written (${how}${logoPrinted ? ' + real logo' : ''}` +
          `${drawPerson ? '' : `, bar ${censorAction}`}, ` +
          `og ${Math.round((og as Buffer).length / 1024)} KB)`,
      );
      return {
        url: `/editorial-thumbs/${req.name}.jpg`,
        width: W,
        height: H,
        ogBytes: (og as Buffer).length,
        fromPhoto,
        logoPrinted,
        censored: !drawPerson,
      };
    } catch (e: any) {
      this.logger.error(`cover ${req.name} failed: ${e?.message || e}`);
      return null;
    }
  }

  /** Three exemplars per request, rotated by name so the whole day's batch does
   *  not lean on the same pictures. Three rather than two because the client's
   *  bar is that every cover reads as one of the saved thumbs: more of the real
   *  folder in front of the model is what holds the treatment. */
  private exemplarsFor(seed: string): string[] {
    const h = Array.from(seed).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const a = STYLE_EXEMPLARS[h % STYLE_EXEMPLARS.length];
    const b = STYLE_EXEMPLARS[(h + 2) % STYLE_EXEMPLARS.length];
    const c = STYLE_EXEMPLARS[(h + 4) % STYLE_EXEMPLARS.length];
    return [a, b, c]
      .map((f) => join(this.thumbsDir, f))
      .filter((f) => existsSync(f));
  }

  private inlineImage(path: string) {
    return {
      inlineData: {
        mimeType: path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        data: readFileSync(path).toString('base64'),
      },
    };
  }

  private async callModel(parts: any[]): Promise<Buffer | null> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: '16:9' },
          },
        }),
      },
    );
    if (!res.ok) {
      this.logger.error(`image API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body: any = await res.json();
    const out = body?.candidates?.[0]?.content?.parts || [];
    const inline = out.find((p: any) => p.inlineData)?.inlineData;
    if (!inline) {
      const said = out.find((p: any) => p.text)?.text;
      this.logger.error(
        `no image returned (finish ${body?.candidates?.[0]?.finishReason})` +
          (said ? `: ${String(said).slice(0, 200)}` : ''),
      );
      return null;
    }
    return Buffer.from(inline.data, 'base64');
  }

  /** sharp is loaded lazily so a box without it degrades to "no cover" rather
   *  than refusing to boot the whole backend. */
  private async sharp(): Promise<any> {
    const mod: any = await import('sharp');
    return mod.default || mod;
  }
}
