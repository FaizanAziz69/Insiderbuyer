/**
 * Render ONE editorial cover from the command line.
 *
 *   cd backend
 *   npx ts-node --transpile-only scripts/make-cover.ts \
 *     --name goldentree-qvc-2026 \
 *     --subject "GoldenTree Asset Management LP" \
 *     --scene "a television shopping studio with jewellery on rotating plinths" \
 *     [--grade "deep teal with gold highlights"] [--halo "hot pink"] [--dry]
 *
 * WHY A SCRIPT THAT IMPORTS THE SERVICES, and not a standalone .mjs like
 * frontend/scripts/gen-cover.mjs. The rules that decide whose face appears —
 * the registry, the Wikidata resolution, the deceased-founder guard, the
 * censor bar, the brandmark — are in CoverService and SubjectLookupService, and
 * a second copy of them in JavaScript would be a second set of rules to keep in
 * step. So this instantiates the real services with `new` (neither takes a
 * constructor dependency) and drives them exactly as the desk does.
 *
 * `--dry` resolves the subject and prints what would appear, without spending a
 * generation. Run it first on any name you have not seen before: it is the read
 * that catches a lookup landing on the wrong person.
 *
 * GEMINI_API_KEY is read from the environment, then from frontend/.env.local,
 * which is where the key lives on a developer's machine. On the box it is in
 * backend/.env and already in the process.
 *
 * REPLACING A COVER THAT IS ALREADY LIVE? Use a NEW --name. nginx serves
 * /editorial-thumbs with `expires 30d`, so a file overwritten in place keeps
 * serving the old bytes to everyone who has already seen it. The desk's own
 * re-do route (POST /daily-desk/redo-covers) handles this by versioning the
 * filename; from here it is yours to remember.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CoverService } from '../src/content/daily-desk/cover.service';
import { SubjectLookupService } from '../src/content/daily-desk/subject-lookup.service';
import { looksInstitutional, photoFor } from '../src/content/daily-desk/person-photos';

const arg = (flag: string, fallback: string | null = null): string | null => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

function loadKey(): void {
  if (process.env.GEMINI_API_KEY) return;
  for (const f of [
    join(__dirname, '..', '.env'),
    join(__dirname, '..', '..', 'frontend', '.env.local'),
  ]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) {
      process.env.GEMINI_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
      return;
    }
  }
}

async function main() {
  loadKey();
  if (!process.env.EDITORIAL_THUMBS_DIR) {
    process.env.EDITORIAL_THUMBS_DIR = join(
      __dirname, '..', '..', 'frontend', 'public', 'editorial-thumbs',
    );
  }

  const name = arg('--name');
  const subject = arg('--subject');
  const scene = arg('--scene');
  const dry = process.argv.includes('--dry');

  if (!name || !subject || (!scene && !dry)) {
    console.error(
      'usage: make-cover.ts --name <file-stem> --subject "<buyer as filed>" ' +
        '--scene "<what the collage shows>" [--grade <colour>] [--halo <colour>] [--dry]',
    );
    process.exit(1);
  }

  const subjects = new SubjectLookupService();
  const cover = new CoverService();

  const held = photoFor(subject);
  const found = held
    ? null
    : await subjects.lookup(subject, { institutional: looksInstitutional(subject) });

  console.log(`buyer      : ${subject}`);
  console.log(`held photo : ${held ? held.display : '—'}`);
  console.log(
    `found      : ${
      found?.person
        ? `${found.person.display}${found.person.role ? ` (${found.person.role})` : ''}` +
          ` — ${found.person.credit || 'no credit'} [${found.person.license}]`
        : '—'
    }`,
  );
  console.log(
    `logo       : ${found?.logo ? `${found.logo.firm} [${found.logo.license}]` : '—'}`,
  );
  console.log(
    `treatment  : ${
      held || found?.person ? 'real photograph' : 'censored subject (black bar)'
    }`,
  );

  if (dry) return;
  if (!cover.isReady()) {
    console.error('GEMINI_API_KEY is not set and no .env carried one — nothing to render.');
    process.exit(1);
  }

  const out = await cover.generate({
    name,
    scene: scene as string,
    grade: arg('--grade', 'deep teal with gold highlights') as string,
    halo: arg('--halo', 'hot pink') as string,
    personRef: held
      ? join(process.env.EDITORIAL_THUMBS_DIR as string, held.file)
      : found?.person?.path ?? null,
    personName: null,
    personContext: null,
    logoRef: found?.logo?.path ?? null,
  });

  if (!out) {
    console.error('cover generation failed — see the log above');
    process.exit(1);
  }
  console.log(`\nwrote ${out.url} (${out.width}x${out.height}, og ${Math.round(out.ogBytes / 1024)} KB)`);
  if (found?.person?.source === 'wikidata' || out.logoPrinted) {
    console.log('credit due — put it on the post\'s imageCredit column.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
