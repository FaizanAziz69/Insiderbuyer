import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ArticleService } from '../news/article.service';
import { CtaService } from './cta.service';

@Controller('cta')
export class CtaController {
  constructor(
    private readonly cta: CtaService,
    private readonly article: ArticleService,
  ) {}

  /**
   * Body-text based pick — pass the raw article HTML or body text directly
   * (useful when the frontend already has the article content).
   */
  @Get('from-text')
  async fromText(@Query('q') q?: string) {
    if (!q) throw new BadRequestException('Missing q');
    const pick = await this.cta.pickFromText(q);
    return { pick };
  }

  /**
   * URL-based pick — backend fetches the article via the existing extractor
   * and runs the CTA helper against the resulting HTML.
   */
  @Get('from-article')
  async fromArticle(@Query('u') url?: string) {
    if (!url) throw new BadRequestException('Missing url');
    if (!this.article.isAllowed(url)) return { pick: null };
    try {
      const a = await this.article.fetch(url);
      const pick = await this.cta.pickFromText(a.html || '');
      return { pick };
    } catch {
      return { pick: null };
    }
  }
}
