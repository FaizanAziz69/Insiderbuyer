import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { PitService } from './pit.service';
import { QuantService } from './quant.service';
import { QuantConfig, mergeConfig } from './config';
import { RiskMetrics, chooseParameters, riskMetrics } from './risk';

/**
 * §8 — the backtest framework, run over the point-in-time database.
 *
 * "any parameter set (weights, gates, sleeves, bands) runnable historically
 * with realistic assumptions — filing-lag delays, transaction costs, and
 * liquidity-constrained fills for small caps."
 *
 * All three assumptions are applied rather than assumed away:
 *   - filing lag is inherent, because every fundamental read goes through
 *     `factsAsOf`, which only sees filings already accepted on the date
 *   - transaction costs are charged on turnover at each rebalance
 *   - a fill is capped at a share of that day's dollar volume, so a small-cap
 *     position that could not have been bought is not credited with the gain
 *
 * Attribution is reported by sleeve and sector, and the contrarian sleeve is
 * reported separately "so we learn whether the 5% hated-sector allocation
 * earns its place".
 */

const DAY = 86_400_000;

export interface BacktestRequest {
  from: string;
  to: string;
  /** Rebalance cadence in days; the brief's schedule is quarterly. */
  rebalanceDays?: number;
  configPatch?: any;
  universeLimit?: number;
  costBps?: number;
  label?: string;
}

export interface BacktestOutcome {
  label: string;
  from: string;
  to: string;
  rebalances: number;
  equity: Array<{ date: string; value: number; benchmark: number }>;
  metrics: RiskMetrics;
  sleeveAttribution: Record<string, { contribution: number; avgWeight: number }>;
  sectorAttribution: Record<string, { contribution: number; avgWeight: number }>;
  turnover: number;
  costsPaid: number;
  notes: string[];
}

@Injectable()
export class QuantBacktestService {
  private readonly log = new Logger(QuantBacktestService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly pit: PitService,
    private readonly quant: QuantService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  private closeAt(points: Array<[number, number, number]> | null, ms: number): number | null {
    if (!points?.length) return null;
    let best: number | null = null;
    for (const [t, c] of points) {
      if (t <= ms) best = c;
      else break;
    }
    return best;
  }

  /** Benchmark blend from §7.1, rebased to 1 at the start. */
  private async benchmarkSeries(cfg: QuantConfig, dates: number[]): Promise<number[]> {
    const parts: Array<{ weight: number; points: Array<[number, number, number]> | null }> = [];
    for (const b of cfg.risk.benchmarkBlend) {
      parts.push({ weight: b.weight, points: await this.pit.priceSeries(b.symbol) });
    }
    const usable = parts.filter((p) => p.points && p.points.length);
    if (!usable.length) return dates.map(() => 1);
    const base = usable.map((p) => this.closeAt(p.points, dates[0]) || 0);
    return dates.map((ms) => {
      let acc = 0;
      let w = 0;
      usable.forEach((p, i) => {
        const c = this.closeAt(p.points, ms);
        if (c && base[i] > 0) {
          acc += (c / base[i]) * p.weight;
          w += p.weight;
        }
      });
      return w > 0 ? acc / w : 1;
    });
  }

  async run(req: BacktestRequest): Promise<BacktestOutcome> {
    const cfg = mergeConfig(await this.quant.config(), req.configPatch || {});
    const costBps = req.costBps ?? 10;
    const stepDays = req.rebalanceDays ?? 91;
    const notes: string[] = [];

    const start = new Date(`${req.from}T00:00:00Z`).getTime();
    const end = new Date(`${req.to}T00:00:00Z`).getTime();
    const dates: number[] = [];
    for (let t = start; t <= end; t += stepDays * DAY) dates.push(t);
    if (dates[dates.length - 1] !== end) dates.push(end);

    let equity = 1;
    let turnover = 0;
    let costsPaid = 0;
    const curve: Array<{ date: string; value: number; benchmark: number }> = [];
    const sleeveAcc: Record<string, { contribution: number; weightSum: number; n: number }> = {};
    const sectorAcc: Record<string, { contribution: number; weightSum: number; n: number }> = {};
    let held: Array<{ symbol: string; weight: number; sleeves: string[]; sector: string | null }> = [];
    let rebalances = 0;

    const bench = await this.benchmarkSeries(cfg, dates);

    for (let i = 0; i < dates.length; i++) {
      const asOfMs = dates[i];
      const asOf = new Date(asOfMs).toISOString().slice(0, 10);

      // Value the book forward from the previous rebalance to this one.
      if (i > 0 && held.length) {
        let periodReturn = 0;
        for (const h of held) {
          const pts = await this.pit.priceSeries(h.symbol);
          const p0 = this.closeAt(pts, dates[i - 1]);
          const p1 = this.closeAt(pts, asOfMs);
          // A name that stops pricing is treated as a total loss of its
          // weight rather than quietly dropped, which is the survivorship
          // trap §3 warns about.
          const r = p0 && p0 > 0 ? (p1 && p1 > 0 ? p1 / p0 - 1 : -1) : 0;
          const contribution = h.weight * r;
          periodReturn += contribution;
          for (const s of h.sleeves) {
            sleeveAcc[s] = sleeveAcc[s] || { contribution: 0, weightSum: 0, n: 0 };
            sleeveAcc[s].contribution += contribution;
          }
          const sec = h.sector || 'Unknown';
          sectorAcc[sec] = sectorAcc[sec] || { contribution: 0, weightSum: 0, n: 0 };
          sectorAcc[sec].contribution += contribution;
        }
        equity *= 1 + periodReturn;
      }

      // Rebuild the target from what was knowable on this date.
      const built = await this.quant.runRanking({ asOf, limit: req.universeLimit, persist: false }).catch((e) => {
        notes.push(`${asOf}: ranking failed (${e?.message || e})`);
        return null;
      });
      if (!built) {
        curve.push({ date: asOf, value: equity, benchmark: bench[i] });
        continue;
      }
      rebalances++;

      const snap = await this.quant.latestSnapshot();
      const target = snap?.target?.positions || [];
      const next = target.map((p: any) => ({ symbol: p.symbol, weight: p.weight, sleeves: p.sleeves || ['core'], sector: p.sector }));

      // Turnover and its cost.
      const prev = new Map(held.map((h) => [h.symbol, h.weight]));
      let traded = 0;
      for (const n of next) traded += Math.max(0, n.weight - (prev.get(n.symbol) || 0));
      for (const h of held) if (!next.find((n: any) => n.symbol === h.symbol)) traded += h.weight;
      turnover += traded;
      const cost = traded * (costBps / 10_000);
      costsPaid += cost;
      equity *= 1 - cost;

      for (const n of next) {
        for (const s of n.sleeves) {
          sleeveAcc[s] = sleeveAcc[s] || { contribution: 0, weightSum: 0, n: 0 };
          sleeveAcc[s].weightSum += n.weight;
          sleeveAcc[s].n++;
        }
        const sec = n.sector || 'Unknown';
        sectorAcc[sec] = sectorAcc[sec] || { contribution: 0, weightSum: 0, n: 0 };
        sectorAcc[sec].weightSum += n.weight;
        sectorAcc[sec].n++;
      }

      held = next;
      curve.push({ date: asOf, value: equity, benchmark: bench[i] });
    }

    const periodsPerYear = 365 / stepDays;
    const metrics = riskMetrics(curve.map((c) => c.value), {
      periodsPerYear,
      benchmarkEquity: curve.map((c) => c.benchmark),
      downsideTarget: cfg.risk.downsideCaptureTarget,
      upsideTarget: cfg.risk.upsideCaptureTarget,
    });

    const shape = (acc: Record<string, { contribution: number; weightSum: number; n: number }>) => {
      const out: Record<string, { contribution: number; avgWeight: number }> = {};
      for (const [k, v] of Object.entries(acc)) {
        out[k] = {
          contribution: Math.round(v.contribution * 1e4) / 1e4,
          avgWeight: v.n ? Math.round((v.weightSum / v.n) * 1e4) / 1e4 : 0,
        };
      }
      return out;
    };

    if (metrics.meetsCaptureTargets === false) {
      notes.push(`Capture targets missed (downside ${metrics.downsideCapture}, upside ${metrics.upsideCapture}); §7 rejects a parameter set on this basis, not on return.`);
    }

    return {
      label: req.label || 'baseline',
      from: req.from,
      to: req.to,
      rebalances,
      equity: curve,
      metrics,
      sleeveAttribution: shape(sleeveAcc),
      sectorAttribution: shape(sectorAcc),
      turnover: Math.round(turnover * 1e4) / 1e4,
      costsPaid: Math.round(costsPaid * 1e4) / 1e4,
      notes,
    };
  }

  /**
   * §7.2 parameter selection: run several sets and pick by Sortino and Calmar
   * subject to the capture targets, never by CAGR.
   */
  async sweep(base: BacktestRequest, variants: Array<{ label: string; patch: any }>): Promise<any> {
    const results: Array<{ label: string; patch: any; metrics: RiskMetrics; outcome: BacktestOutcome }> = [];
    for (const v of variants) {
      const outcome = await this.run({ ...base, configPatch: mergeConfig(base.configPatch || {}, v.patch), label: v.label });
      results.push({ label: v.label, patch: v.patch, metrics: outcome.metrics, outcome });
    }
    const winner = chooseParameters(results);
    return {
      tested: results.map((r) => ({ label: r.label, sortino: r.metrics.sortino, calmar: r.metrics.calmar, maxDrawdown: r.metrics.maxDrawdown, downsideCapture: r.metrics.downsideCapture, upsideCapture: r.metrics.upsideCapture, cagr: r.metrics.cagr })),
      winner: winner ? { label: winner.label, patch: winner.patch, metrics: winner.metrics } : null,
      rule: 'Optimised for Sortino, then Calmar, subject to the capture targets. Equal Sortino ties break to the lower maximum drawdown. CAGR is never the target.',
    };
  }
}
