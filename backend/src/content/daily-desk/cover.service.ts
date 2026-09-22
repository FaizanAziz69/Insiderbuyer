import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  'pages or screens of prose. Small incidental lettering that belongs to a real ' +
  'object is fine: a sign on a building, digits on a ticker board, a brand mark ' +
  'on a storefront. Nothing with a readable paragraph in it.';


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
}

export interface CoverResult {
  /** Site-relative URL to store on the post. */
  url: string;
  width: number;
  height: number;
  ogBytes: number;
  /** True when a real photograph drove the likeness. */
  fromPhoto: boolean;
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

      const drawPerson = fromPhoto || !!req.personName;
      const instruction =
        (fromPhoto ? KEEP_LIKENESS : '') +
        (!fromPhoto && req.personName
          ? `The cover is about ${req.personName}${req.personContext ? `, ${req.personContext}` : ''}. ` +
            'Depict them as a real adult person in business dress, photorealistic. '
          : '') +
        (drawPerson ? HERO_TREATMENT + ' ' : '') +
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
      await sharp(raw)
        // 16:9 comes back wider than the house 1.606, so about 10% leaves the
        // sides. "attention" keeps the busiest region, which on these covers is
        // the face; a plain centre crop has clipped a shoulder before now.
        .resize(W, H, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 88, progressive: false, mozjpeg: true })
        .toFile(dest);

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

      this.logger.log(
        `cover ${req.name}.jpg written (${fromPhoto ? 'from photo' : 'object cover'}, og ${Math.round((og as Buffer).length / 1024)} KB)`,
      );
      return {
        url: `/editorial-thumbs/${req.name}.jpg`,
        width: W,
        height: H,
        ogBytes: (og as Buffer).length,
        fromPhoto,
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
