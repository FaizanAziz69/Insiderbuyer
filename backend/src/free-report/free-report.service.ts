import { Injectable, Logger } from '@nestjs/common';
import { FmpService } from '../fmp/fmp.service';
import { PART_TWO } from './free-report.content';
import { Bar, renderFreeReportPdf } from './free-report-pdf';

/**
 * Renders and caches the free investor report ("Get On The Inside").
 *
 * The copy is fixed (free-report.content.ts); only the three price charts
 * move, so the PDF is rebuilt at most every six hours and served from memory
 * in between. A failed price fetch never fails the report — that chart says
 * the history was unavailable and the rest renders.
 */
const TTL_MS = 6 * 3_600_000;
const DAY = 86_400_000;

@Injectable()
export class FreeReportService {
  private readonly log = new Logger(FreeReportService.name);
  private cache: { buf: Buffer; at: number; asOf: string } | null = null;
  private inflight: Promise<Buffer> | null = null;

  constructor(private readonly fmp: FmpService) {}

  async pdf(force = false): Promise<Buffer> {
    if (!force && this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.buf;
    if (this.inflight) return this.inflight;
    this.inflight = this.build().finally(() => (this.inflight = null));
    return this.inflight;
  }

  status() {
    return {
      cached: !!this.cache,
      renderedAt: this.cache ? new Date(this.cache.at).toISOString() : null,
      asOf: this.cache?.asOf ?? null,
      bytes: this.cache?.buf.length ?? 0,
      stocks: PART_TWO.stocks.map((s) => ({ ticker: s.ticker, markers: s.markers.map((m) => m.date) })),
    };
  }

  private async build(): Promise<Buffer> {
    const from = new Date(Date.now() - 370 * DAY).toISOString().slice(0, 10);
    const bars: Record<string, Bar[]> = {};
    let asOf = new Date().toISOString().slice(0, 10);
    await Promise.all(
      PART_TWO.stocks.map(async (s) => {
        try {
          const raw = await this.fmp.getEodBars(s.chartSymbol, { from, adjusted: true });
          const series = raw
            .filter((b) => b.close > 0)
            .map((b) => ({ date: b.date.slice(0, 10), close: b.close }))
            .sort((a, b) => (a.date < b.date ? -1 : 1));
          bars[s.chartSymbol] = series;
          if (series.length) asOf = series[series.length - 1].date < asOf ? series[series.length - 1].date : asOf;
        } catch (e: any) {
          this.log.warn(`bars failed for ${s.chartSymbol}: ${e?.message || e}`);
          bars[s.chartSymbol] = [];
        }
      }),
    );
    const buf = await renderFreeReportPdf(bars, asOf);
    this.cache = { buf, at: Date.now(), asOf };
    this.log.log(`free report rendered: ${buf.length} bytes, prices as of ${asOf}`);
    return buf;
  }
}
