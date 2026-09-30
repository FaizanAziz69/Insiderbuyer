/**
 * Printing a REAL firm logo onto a finished cover.
 *
 * WHY THIS IS A COMPOSITE AND NOT A PROMPT. The obvious way to get GoldenTree's
 * mark onto a GoldenTree cover is to hand the logo to the image model as a
 * reference and ask it to place it. That reliably produces a logo-SHAPED blur:
 * the triangle survives, the wordmark comes back as "GoldonTrec ASSET
 * MANAGEMEHT", and the whole point of using the real mark is lost. It also
 * fights the rule the same prompt carries three sentences earlier, which is
 * that nothing in the frame may be readable, because everything readable the
 * model draws is invented.
 *
 * Compositing settles both at once. The bitmap that lands on the cover is the
 * file Wikimedia served, pixel for pixel, so the mark is exactly right and the
 * "no invented text" rule stays absolute: the ONLY legible thing on any cover is
 * a real logo we fetched, and the model never sees it.
 *
 * WHY THE MARK IS FLATTENED TO ONE INK. The house look grades the entire
 * background in a single colour. A full-colour logo dropped on top is then the
 * one object in the frame that was not graded, and it reads as a sticker. Flat
 * ink — white on a dark plate, near-black on a light one — sits in the grade the
 * way printed ink sits on newsprint, and a wordmark loses nothing by it.
 */

export interface BrandmarkResult {
  /** The cover with the mark printed on it. */
  image: Buffer;
  /** Fraction of the cover width the mark occupies, for the log. */
  scale: number;
}

/** Where the mark goes, and how much room it gets. Top-left because that is the
 *  corner CoverService asks the model to leave calm, and because the subject is
 *  centre-or-right in every cover in the folder. */
const INSET = 64;
const WIDTH_FRACTION = 0.24;
/** A mark shorter than this is a device, not a wordmark, and looks lost at 24%
 *  of the width — squarer marks get a little more room. */
const SQUARE_RATIO = 1.8;
const SQUARE_WIDTH_FRACTION = 0.13;

/** Anything this close to white in the source is the logo sheet's paper, not
 *  the mark. Commons logos are overwhelmingly dark-on-white JPEGs or PNGs. */
const PAPER = 235;

/**
 * Print `logoFile` onto `cover`.
 *
 * Returns null rather than throwing on anything unexpected: a cover without its
 * logo is the cover we shipped yesterday, and a failed article is not.
 */
export async function printBrandmark(
  sharp: any,
  cover: Buffer,
  logoFile: string,
): Promise<BrandmarkResult | null> {
  try {
    const mark = await knockout(sharp, logoFile);
    if (!mark) return null;

    const coverMeta = await sharp(cover).metadata();
    const W = coverMeta.width || 1606;
    const H = coverMeta.height || 1000;

    const markMeta = await sharp(mark).metadata();
    const ratio = (markMeta.width || 1) / (markMeta.height || 1);
    const fraction = ratio < SQUARE_RATIO ? SQUARE_WIDTH_FRACTION : WIDTH_FRACTION;
    const target = Math.round(W * fraction);

    const scaled = await sharp(mark).resize({ width: target }).png().toBuffer();
    const scaledMeta = await sharp(scaled).metadata();
    const mw = scaledMeta.width || target;
    const mh = scaledMeta.height || target;

    // Which ink reads on the plate the mark is about to cover. Sampled from the
    // cover itself rather than assumed from the grade name, because "gold" and
    // "amber" are bright and "teal" and "aubergine" are not, and the model does
    // not always honour the grade it was given.
    const plate = await sharp(cover)
      .extract({
        left: INSET,
        top: INSET,
        width: Math.min(mw, W - INSET - 1),
        height: Math.min(mh, H - INSET - 1),
      })
      .greyscale()
      .stats();
    const ink = (plate.channels?.[0]?.mean ?? 0) > 140 ? '#0d1117' : '#ffffff';

    const inked = await sharp(scaled)
      .ensureAlpha()
      .composite([
        {
          input: { create: { width: mw, height: mh, channels: 4, background: ink } },
          // `in` keeps the destination's alpha and takes the source's colour,
          // which is exactly "fill the shape of the mark with one ink".
          blend: 'in',
        },
      ])
      .png()
      .toBuffer();

    const image = await sharp(cover)
      // 0.94 rather than 1.0 so the mark sits IN the grain instead of on top of
      // it. At full opacity it reads as a UI element pasted over a photograph.
      .composite([{ input: inked, left: INSET, top: INSET, opacity: 0.94 }])
      .jpeg({ quality: 90, progressive: false, mozjpeg: true })
      .toBuffer();

    return { image, scale: fraction };
  } catch {
    return null;
  }
}

/**
 * Turn a logo sheet into a mark on transparency.
 *
 * Two shapes arrive. A PNG with real alpha is already a mark, and only needs
 * trimming. A JPEG — which is most of Commons — is ink on white paper, and the
 * paper has to go or the cover gets a white rectangle in the corner.
 *
 * The white test runs on every pixel rather than a flood fill from the edges on
 * purpose: these sheets routinely have white INSIDE the mark (the knocked-out
 * triangle in GoldenTree's roundel), and a flood fill would leave those filled
 * while clearing the border, which inverts the logo's own counters.
 */
async function knockout(sharp: any, file: string): Promise<Buffer | null> {
  const meta = await sharp(file).metadata();
  const hadAlpha = !!meta.hasAlpha;

  let prepared: Buffer;
  if (hadAlpha) {
    prepared = await sharp(file).png().toBuffer();
  } else {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = Buffer.from(data);
    for (let i = 0; i < px.length; i += info.channels) {
      if (px[i] > PAPER && px[i + 1] > PAPER && px[i + 2] > PAPER) px[i + 3] = 0;
    }
    prepared = await sharp(px, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .png()
      .toBuffer();
  }

  // Trim the transparent margin the sheet was laid out with, so INSET means the
  // distance to the MARK and not to the edge of somebody's artboard.
  const trimmed = await sharp(prepared).trim({ threshold: 1 }).png().toBuffer();
  const t = await sharp(trimmed).metadata();
  // A mark that trimmed to nothing (an all-white sheet, a failed knockout) is
  // not a mark.
  if (!t.width || !t.height || t.width < 24 || t.height < 12) return null;
  return trimmed;
}
