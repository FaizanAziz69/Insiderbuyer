/**
 * Making the censor bar mean it.
 *
 * The censored-subject branch asks the image model for "a solid, opaque,
 * hard-edged black rectangle across the eye line", and it mostly obliges — but
 * "mostly" is the wrong standard for the one element that carries the whole
 * anonymity guarantee. The first Vanguard cover came back with a bar that was
 * dark grey rather than black and slightly translucent: at thumbnail size it
 * reads as a redaction, and at full size you can make out the eyes through it.
 *
 * So the bar is not trusted as drawn. It is located, and then painted — a real
 * rectangle of real black, composited by sharp, with no model in the loop at
 * the moment the pixels are set. What the generator produces is a PLACEMENT
 * suggestion; the redaction itself is arithmetic.
 *
 * The detector is asked for two things at once because the failure modes need
 * different answers:
 *
 *   bar present  -> repaint it opaque black, and nothing else changes.
 *   no bar, eyes visible -> the model ignored the instruction; paint the bar
 *                           over the eyes ourselves. This is the case that
 *                           would otherwise ship an unredacted invented face.
 *   neither      -> there is nothing to redact. The subject is turned away, in
 *                   shadow or cropped, which is the old anonymous treatment and
 *                   was always acceptable.
 *
 * Detection runs on a cheap text model, not the image model: two of them were
 * compared on the same cover and returned boxes agreeing to within three parts
 * in a thousand, so there is nothing to buy by paying more.
 */

export interface CensorResult {
  image: Buffer;
  /** 'repainted' | 'added' | 'nothing-to-redact' | 'undetected' */
  action: string;
}

/** Normalised box as Gemini returns it: [ymin, xmin, ymax, xmax] over 0-1000. */
type Box = [number, number, number, number];

const DETECT_MODEL = process.env.GEMINI_DETECT_MODEL || 'gemini-flash-latest';

/** Grown around a bar we are repainting, so a soft edge cannot survive as a
 *  grey fringe just outside the rectangle we paint. */
const REPAINT_PAD = 0.004;
/** Grown around bare eyes, which are a much smaller target than the bar a
 *  newspaper would print: a band over the eyes alone leaves brows and the
 *  corners of the sockets, and a face is recognisable from those. */
const EYES_PAD_X = 0.06;
const EYES_PAD_Y = 0.035;

const PROMPT =
  'Look at this magazine cover. Answer about the LARGE cut-out person in the ' +
  'foreground only.\n' +
  '1. Is there a black censor bar printed across their eyes?\n' +
  '2. Are their eyes visible?\n' +
  'Reply with JSON only, no prose, no code fence:\n' +
  '{"bar": [ymin,xmin,ymax,xmax] or null, "eyes": [ymin,xmin,ymax,xmax] or null}\n' +
  'Boxes are normalised 0-1000. "bar" is the rectangle of the censor bar if one ' +
  'is present. "eyes" is the region containing both eyes if they are visible, ' +
  'and null if they are hidden, turned away, in shadow, cropped out or already ' +
  'covered.';

/**
 * Enforce the redaction on a censored cover.
 *
 * Returns the image unchanged, with an `action` saying so, whenever anything
 * goes wrong: the cover we already have is never made worse by a detector that
 * did not answer.
 */
export async function enforceCensorBar(
  sharp: any,
  image: Buffer,
  apiKey: string,
): Promise<CensorResult> {
  try {
    const found = await detect(image, apiKey);
    if (!found) return { image, action: 'undetected' };

    const { bar, eyes } = found;
    if (!bar && !eyes) return { image, action: 'nothing-to-redact' };

    const meta = await sharp(image).metadata();
    const W = meta.width || 1606;
    const H = meta.height || 1000;

    const box = bar
      ? grow(bar, REPAINT_PAD, REPAINT_PAD)
      : grow(eyes as Box, EYES_PAD_X, EYES_PAD_Y);

    const left = Math.max(0, Math.round((box[1] / 1000) * W));
    const top = Math.max(0, Math.round((box[0] / 1000) * H));
    const width = Math.min(W - left, Math.round(((box[3] - box[1]) / 1000) * W));
    const height = Math.min(H - top, Math.round(((box[2] - box[0]) / 1000) * H));

    // A degenerate box is a detector that misread the picture, not a redaction.
    if (width < 20 || height < 8) return { image, action: 'undetected' };

    const out = await sharp(image)
      .composite([
        {
          input: {
            create: { width, height, channels: 4, background: '#000000' },
          },
          left,
          top,
        },
      ])
      .jpeg({ quality: 90, progressive: false, mozjpeg: true })
      .toBuffer();

    return { image: out, action: bar ? 'repainted' : 'added' };
  } catch {
    return { image, action: 'undetected' };
  }
}

function grow([y0, x0, y1, x1]: Box, padX: number, padY: number): Box {
  const dx = (x1 - x0) * padX + 1000 * padX * 0.25;
  const dy = (y1 - y0) * padY + 1000 * padY * 0.25;
  return [
    Math.max(0, y0 - dy),
    Math.max(0, x0 - dx),
    Math.min(1000, y1 + dy),
    Math.min(1000, x1 + dx),
  ];
}

async function detect(
  image: Buffer,
  apiKey: string,
): Promise<{ bar: Box | null; eyes: Box | null } | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DETECT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: { responseModalities: ['TEXT'], temperature: 0 },
      }),
    },
  );
  if (!res.ok) return null;

  const body: any = await res.json();
  const text: string = (body?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || '')
    .join('');
  // The model fences its JSON about half the time, whatever the prompt says.
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;

  const parsed = JSON.parse(json);
  return { bar: asBox(parsed.bar), eyes: asBox(parsed.eyes) };
}

function asBox(v: any): Box | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const n = v.map(Number);
  if (n.some((x) => !Number.isFinite(x) || x < 0 || x > 1000)) return null;
  if (n[2] <= n[0] || n[3] <= n[1]) return null;
  return n as Box;
}
