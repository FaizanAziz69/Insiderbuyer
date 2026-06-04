import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';

const STOPWORDS = new Set([
  'A','AN','AND','AT','AS','BE','BY','FOR','FROM','IN','IS','IT','OF','ON','OR','SO','TO',
  'THE','THIS','THAT','THESE','THOSE','WHO','WHAT','WHEN','WHERE','WHY','HOW','HE','SHE',
  'WE','YOU','THEY','ARE','WAS','WERE','HAS','HAD','HAVE','WILL','WOULD','SHOULD','COULD',
  'NOT','NO','BUT','ALL','ANY','SOME','MORE','MOST','SUCH','THAN','THEN','THUS','WITH',
  'CEO','CFO','COO','SEC','FDA','SEC','EPS','GDP','CPI','PMI','ETF','ETFS','IPO','IPOS',
  'INC','LLC','LTD','CORP','CO','LP','PLC','SAS','BV','AG','SA',
  'NEW','OLD','TOP','OUR','MY','HIS','HER','ITS','PER','EACH','DAY','WEEK','MONTH','YEAR',
  'BIG','SMALL','HIGH','LOW','UP','DOWN','OVER','UNDER','RIGHT','LEFT','BEST','WORST',
  'BUY','SELL','HOLD','LONG','SHORT','BULL','BEAR','GAIN','LOSS','SAID','SAYS','WIDE',
  'GAAP','NON','PRO','ESG','AI','DOJ','FTC','OPEC','EU','UK','US','USA',
]);

@Injectable()
export class CtaService {
  private tickersCache: { ts: number; set: Set<string>; map: Map<string, string> } | null = null;
  private readonly CACHE_MS = 5 * 60_000;

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  private async loadTickers(): Promise<{ set: Set<string>; map: Map<string, string> }> {
    if (this.tickersCache && Date.now() - this.tickersCache.ts < this.CACHE_MS) {
      return { set: this.tickersCache.set, map: this.tickersCache.map };
    }
    const rows = await this.companies.find({ select: ['ticker', 'name'] });
    const set = new Set<string>();
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.ticker) continue;
      const t = r.ticker.toUpperCase();
      set.add(t);
      map.set(t, r.name);
    }
    this.tickersCache = { ts: Date.now(), set, map };
    return { set, map };
  }

  /**
   * Pick a single ticker mentioned in the article HTML/text. Strategy:
   *   1. Parenthetical: (NVDA) / (AAPL) — strongest signal.
   *   2. Bare uppercase tokens 2–5 letters, filtered by our company table and stopwords.
   * Returns the first match; null if nothing matches.
   */
  async pickFromText(html: string): Promise<{ ticker: string; name: string } | null> {
    if (!html) return null;
    const { set, map } = await this.loadTickers();

    const text = String(html).replace(/<[^>]+>/g, ' ');
    const parens: string[] = [];
    const re1 = /\(([A-Z]{1,5})\)/g;
    let m1: RegExpExecArray | null;
    while ((m1 = re1.exec(text)) !== null) parens.push(m1[1]);

    for (const t of parens) {
      if (set.has(t)) return { ticker: t, name: map.get(t) || t };
    }

    const tokens: string[] = [];
    const re2 = /\b([A-Z]{2,5})\b/g;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(text)) !== null) tokens.push(m2[1]);

    const counts = new Map<string, number>();
    for (const t of tokens) {
      if (STOPWORDS.has(t)) continue;
      if (!set.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    if (counts.size === 0) return null;
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [pick] = sorted[0];
    return { ticker: pick, name: map.get(pick) || pick };
  }
}
