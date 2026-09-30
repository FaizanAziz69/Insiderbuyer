import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../common/admin-token.guard';
import { join } from 'node:path';
import { CoverService } from './cover.service';
import { looksInstitutional, photoFor } from './person-photos';
import { SubjectLookupService, SubjectMaterial } from './subject-lookup.service';
import { DailyDeskService } from './daily-desk.service';

/**
 * Admin surface for the daily desk.
 *
 * `POST /daily-desk/run` with `{ publish: false }` is how a batch is inspected
 * before the cron is ever armed: it researches, writes and renders the covers
 * for real, and simply does not touch blog_posts.
 */
@Controller('daily-desk')
export class DailyDeskController {
  constructor(
    private readonly desk: DailyDeskService,
    private readonly cover: CoverService,
    private readonly subjects: SubjectLookupService,
  ) {}

  @Post('run')
  @UseGuards(AdminTokenGuard)
  async run(@Body() body?: { publish?: boolean; limit?: number; draft?: boolean }) {
    return this.desk.run({
      publish: body?.publish === true,
      limit: body?.limit,
      draft: body?.draft === true,
    });
  }

  /**
   * Render ONE cover, without researching or writing anything.
   *
   * Cover art is the part of the desk the client iterates on — the no-person
   * treatment changed on George's note of 2026-09-25 — and the only way to
   * judge a prompt change was to run a whole batch. This renders a single
   * image into the same editorial-thumbs folder, in the same format, so a
   * change can be looked at before it ships on an article.
   *
   * Omit every person field to exercise the censored-subject branch.
   *
   * `subject` is the shortcut worth knowing: pass the buyer's name exactly as
   * the filing spells it ("GoldenTree Asset Management LP") and the route runs
   * the same lookup the desk runs, so the cover comes back with the real
   * photograph and the real logo without anyone hunting for files. Explicit
   * `personRef`/`logoRef` still win, which is how a cover gets re-done with a
   * frame somebody picked by hand.
   */
  @Post('cover')
  @UseGuards(AdminTokenGuard)
  async makeCover(
    @Body()
    body: {
      name: string;
      scene: string;
      grade: string;
      halo?: string;
      personName?: string;
      personContext?: string;
      personRef?: string;
      logoRef?: string;
      subject?: string;
      institutional?: boolean;
    },
  ) {
    if (!body?.name || !body?.scene || !body?.grade) {
      return { error: 'name, scene and grade are required' };
    }

    let found: SubjectMaterial | null = null;
    if (body.subject && !(body.personRef && body.logoRef)) {
      const held = photoFor(body.subject);
      found = held
        ? { person: { path: join(this.thumbsDir(), held.file), credit: null, license: null, sourceUrl: null, display: held.display, role: null, source: 'registry' }, logo: null }
        : await this.subjects.lookup(body.subject, {
            institutional: body.institutional ?? looksInstitutional(body.subject),
          });
    }

    const out = await this.cover.generate({
      name: body.name,
      scene: body.scene,
      grade: body.grade,
      halo: body.halo,
      personName: body.personName ?? null,
      personContext: body.personContext ?? null,
      personRef: body.personRef ?? found?.person?.path ?? null,
      logoRef: body.logoRef ?? found?.logo?.path ?? null,
    });
    if (!out) return { error: 'cover generation failed — see logs' };
    return {
      ...out,
      // What the lookup actually found, so a hand-run cover can be judged
      // without reading the log: who is in the frame, and whose mark.
      subject: found?.person
        ? { name: found.person.display, role: found.person.role, source: found.person.source }
        : null,
      logo: found?.logo ? { firm: found.logo.firm, license: found.logo.license } : null,
    };
  }

  private thumbsDir(): string {
    return (
      process.env.EDITORIAL_THUMBS_DIR ||
      join(process.cwd(), '..', 'frontend', 'public', 'editorial-thumbs')
    );
  }

  /**
   * Re-render covers on articles that are already published.
   *
   * `{ dryRun: true }` first, always: it reports whose face each slug would get
   * and whose logo, for nothing, and that is the read that catches a lookup
   * landing on the wrong person before the wrong person is on the site.
   *
   * Body: `{ slugs?: string[], censoredOnly?: boolean, limit?: number,
   * dryRun?: boolean }`. With no slugs it walks the newest desk articles.
   */
  @Post('redo-covers')
  @UseGuards(AdminTokenGuard)
  async redoCovers(
    @Body()
    body: { slugs?: string[]; censoredOnly?: boolean; limit?: number; dryRun?: boolean },
  ) {
    return this.desk.redoCovers({
      slugs: body?.slugs,
      censoredOnly: body?.censoredOnly,
      limit: body?.limit,
      dryRun: body?.dryRun,
    });
  }

  @Get('status')
  @UseGuards(AdminTokenGuard)
  async status() {
    return this.desk.status();
  }
}
