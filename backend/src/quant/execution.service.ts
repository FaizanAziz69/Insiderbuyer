import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Company } from '../entities/company.entity';
import { QuantConfig } from './config';

/**
 * L4 — the execution engine (Brief v6 §9), paper first.
 *
 * §10 is the frame this is built under, and it is not decoration: "the
 * execution engine trades paper and InsiderBuying's own capital ONLY" until
 * counsel clears a structure. So the broker is an interface with a paper
 * implementation; the Interactive Brokers adapter is declared but refuses to
 * act until it is both configured and explicitly switched on.
 *
 * Everything §9 asks for is enforced here rather than left to the caller:
 * liquidity-aware slicing, limit discipline with a slippage tolerance, an
 * approval queue, a hard kill switch, a daily deployment cap, duplicate-order
 * protection, and an append-only audit log carrying the ranking snapshot that
 * justified each order.
 */

export type OrderStatus = 'pending_approval' | 'approved' | 'working' | 'filled' | 'cancelled' | 'rejected';

export interface OrderSlice {
  seq: number;
  shares: number;
  limitPrice: number | null;
  status: OrderStatus;
  filledShares: number;
  avgFillPrice: number | null;
}

export interface QuantOrder {
  id: string;
  bookId: string;
  symbol: string;
  side: 'buy' | 'sell';
  targetShares: number;
  reason: string;
  rankingSnapshotId: string | null;
  status: OrderStatus;
  slices: OrderSlice[];
  createdAt: string;
}

@Injectable()
export class ExecutionService {
  private readonly log = new Logger(ExecutionService.name);

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS quant_orders (
      id text PRIMARY KEY,
      book_id text NOT NULL,
      symbol text NOT NULL,
      side text NOT NULL,
      target_shares numeric(20,4) NOT NULL,
      target_dollars numeric(20,2),
      reason text NOT NULL DEFAULT '',
      ranking_snapshot_id text,
      status text NOT NULL DEFAULT 'pending_approval',
      slices jsonb NOT NULL DEFAULT '[]'::jsonb,
      filled_shares numeric(20,4) NOT NULL DEFAULT 0,
      avg_fill_price numeric(18,4),
      idempotency_key text UNIQUE,
      broker text NOT NULL DEFAULT 'paper',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS quant_orders_book_idx ON quant_orders (book_id, created_at DESC)`);
    // Append-only by construction: nothing in this service updates or deletes
    // a row here, which is what makes it an audit log rather than a table.
    await this.q(`CREATE TABLE IF NOT EXISTS quant_audit (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor text NOT NULL DEFAULT 'engine',
      event text NOT NULL,
      book_id text,
      symbol text,
      order_id text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS quant_audit_at_idx ON quant_audit (at DESC)`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_positions (
      book_id text NOT NULL,
      symbol text NOT NULL,
      shares numeric(20,4) NOT NULL DEFAULT 0,
      avg_cost numeric(18,4),
      opened_at date,
      tranches_filled int NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (book_id, symbol)
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_book_state (
      book_id text PRIMARY KEY,
      cash numeric(20,2) NOT NULL DEFAULT 0,
      equity numeric(20,2) NOT NULL DEFAULT 0,
      high_water_mark numeric(20,2) NOT NULL DEFAULT 0,
      drawdown_state text NOT NULL DEFAULT 'normal',
      trailing_turnover double precision NOT NULL DEFAULT 0,
      deployed_today numeric(20,2) NOT NULL DEFAULT 0,
      deployed_date date,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async audit(event: string, data: { actor?: string; bookId?: string; symbol?: string; orderId?: string; payload?: any } = {}): Promise<void> {
    await this.q(
      `INSERT INTO quant_audit (actor, event, book_id, symbol, order_id, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [data.actor || 'engine', event, data.bookId || null, data.symbol || null, data.orderId || null, JSON.stringify(data.payload || {})],
    );
  }

  /**
   * Liquidity-aware slicing: an order never takes more than a configured
   * share of a day's volume, so a small cap is worked over several days
   * rather than moved in one print.
   */
  sliceOrder(shares: number, advShares: number, price: number, side: 'buy' | 'sell', cfg: QuantConfig): OrderSlice[] {
    const perDay = Math.max(1, Math.floor(advShares * cfg.execution.participationCap));
    const slices: OrderSlice[] = [];
    let remaining = Math.abs(Math.floor(shares));
    let seq = 1;
    // Limit discipline: buy no higher and sell no lower than the tolerance.
    const limit =
      side === 'buy'
        ? Math.round(price * (1 + cfg.execution.slippageTolerance) * 100) / 100
        : Math.round(price * (1 - cfg.execution.slippageTolerance) * 100) / 100;
    while (remaining > 0 && seq <= 40) {
      const take = Math.min(remaining, perDay);
      slices.push({ seq, shares: take, limitPrice: limit, status: 'pending_approval', filledShares: 0, avgFillPrice: null });
      remaining -= take;
      seq++;
    }
    if (remaining > 0 && slices.length) slices[slices.length - 1].shares += remaining;
    return slices;
  }

  /** A stable key so the same intent submitted twice cannot become two orders. */
  private idempotencyKey(bookId: string, symbol: string, side: string, shares: number, day: string): string {
    return createHash('sha1').update(`${bookId}|${symbol}|${side}|${Math.round(shares)}|${day}`).digest('hex').slice(0, 32);
  }

  async submit(
    input: { bookId: string; symbol: string; side: 'buy' | 'sell'; shares: number; price: number; advShares: number; reason: string; rankingSnapshotId?: string | null },
    cfg: QuantConfig,
  ): Promise<{ ok: boolean; order?: QuantOrder; reason?: string }> {
    await this.ensureTables();

    // The kill switch is checked before anything else and refuses everything.
    if (cfg.execution.killSwitch) {
      await this.audit('order.rejected.kill_switch', { bookId: input.bookId, symbol: input.symbol, payload: input });
      return { ok: false, reason: 'Kill switch is engaged: no orders are accepted.' };
    }
    if (!(input.shares > 0) || !(input.price > 0)) {
      return { ok: false, reason: 'Order needs a positive share count and price.' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const dollars = input.shares * input.price;

    // Daily deployment cap, buys only: a sell raises cash and cannot breach it.
    if (input.side === 'buy') {
      const [state] = await this.q<any[]>(`SELECT deployed_today, deployed_date FROM quant_book_state WHERE book_id = $1`, [input.bookId]);
      const deployed = state && String(state.deployed_date).slice(0, 10) === today ? Number(state.deployed_today) : 0;
      if (deployed + dollars > cfg.execution.maxDailyDeployment) {
        await this.audit('order.rejected.daily_cap', { bookId: input.bookId, symbol: input.symbol, payload: { deployed, dollars, cap: cfg.execution.maxDailyDeployment } });
        return { ok: false, reason: `Daily deployment cap reached (${deployed.toFixed(0)} of ${cfg.execution.maxDailyDeployment} used).` };
      }
    }

    const key = this.idempotencyKey(input.bookId, input.symbol, input.side, input.shares, today);
    const [dup] = await this.q<any[]>(`SELECT id FROM quant_orders WHERE idempotency_key = $1`, [key]);
    if (dup) {
      await this.audit('order.duplicate_suppressed', { bookId: input.bookId, symbol: input.symbol, orderId: dup.id, payload: input });
      return { ok: false, reason: `Duplicate of order ${dup.id} already submitted today.` };
    }

    const slices = this.sliceOrder(input.shares, input.advShares, input.price, input.side, cfg);
    const id = `ord_${createHash('sha1').update(`${key}|${Date.now()}`).digest('hex').slice(0, 16)}`;
    const status: OrderStatus = cfg.execution.requireApproval ? 'pending_approval' : 'approved';

    await this.q(
      `INSERT INTO quant_orders (id,book_id,symbol,side,target_shares,target_dollars,reason,ranking_snapshot_id,status,slices,idempotency_key,broker)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [id, input.bookId, input.symbol.toUpperCase(), input.side, input.shares, dollars, input.reason,
       input.rankingSnapshotId || null, status, JSON.stringify(slices), key, cfg.execution.broker],
    );
    // The audit row carries the ranking snapshot that justified the order,
    // which is what §9 means by an immutable log.
    await this.audit('order.created', {
      bookId: input.bookId, symbol: input.symbol, orderId: id,
      payload: { side: input.side, shares: input.shares, price: input.price, dollars, reason: input.reason, rankingSnapshotId: input.rankingSnapshotId || null, slices: slices.length, status },
    });
    return {
      ok: true,
      order: { id, bookId: input.bookId, symbol: input.symbol.toUpperCase(), side: input.side, targetShares: input.shares, reason: input.reason, rankingSnapshotId: input.rankingSnapshotId || null, status, slices, createdAt: new Date().toISOString() },
    };
  }

  /** George's one-click approval (§9: orders queue for approval initially). */
  async approve(orderId: string, actor = 'george'): Promise<{ ok: boolean; reason?: string }> {
    const [o] = await this.q<any[]>(`SELECT id, status FROM quant_orders WHERE id = $1`, [orderId]);
    if (!o) return { ok: false, reason: 'Unknown order.' };
    if (o.status !== 'pending_approval') return { ok: false, reason: `Order is ${o.status}, not awaiting approval.` };
    await this.q(`UPDATE quant_orders SET status = 'approved', updated_at = now() WHERE id = $1`, [orderId]);
    await this.audit('order.approved', { actor, orderId });
    return { ok: true };
  }

  async cancel(orderId: string, actor = 'george', reason = 'cancelled'): Promise<{ ok: boolean }> {
    await this.q(`UPDATE quant_orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status IN ('pending_approval','approved','working')`, [orderId]);
    await this.audit('order.cancelled', { actor, orderId, payload: { reason } });
    return { ok: true };
  }

  /**
   * Paper fill. Deliberately pessimistic: a limit order fills only when the
   * day's price is at or through the limit, so a paper record cannot flatter
   * the strategy with fills it would not have got.
   */
  async fillPaper(orderId: string, marketPrice: number): Promise<{ ok: boolean; filled: number; reason?: string }> {
    const [o] = await this.q<any[]>(`SELECT * FROM quant_orders WHERE id = $1`, [orderId]);
    if (!o) return { ok: false, filled: 0, reason: 'Unknown order.' };
    if (o.status !== 'approved' && o.status !== 'working') return { ok: false, filled: 0, reason: `Order is ${o.status}.` };

    const slices: OrderSlice[] = o.slices || [];
    let filled = Number(o.filled_shares) || 0;
    let notional = filled * (Number(o.avg_fill_price) || 0);
    let any = false;
    for (const s of slices) {
      if (s.status === 'filled') continue;
      const ok = o.side === 'buy' ? marketPrice <= (s.limitPrice ?? Infinity) : marketPrice >= (s.limitPrice ?? 0);
      if (!ok) break;
      s.status = 'filled';
      s.filledShares = s.shares;
      s.avgFillPrice = marketPrice;
      filled += s.shares;
      notional += s.shares * marketPrice;
      any = true;
      break; // one slice per session, which is what participation-capping means
    }
    const allDone = slices.every((s) => s.status === 'filled');
    const avg = filled > 0 ? notional / filled : null;
    await this.q(
      `UPDATE quant_orders SET slices = $2::jsonb, filled_shares = $3, avg_fill_price = $4, status = $5, updated_at = now() WHERE id = $1`,
      [orderId, JSON.stringify(slices), filled, avg, allDone ? 'filled' : 'working'],
    );
    if (any) {
      const sign = o.side === 'buy' ? 1 : -1;
      const lastSlice = slices.filter((s) => s.status === 'filled').slice(-1)[0];
      const shares = lastSlice?.shares || 0;
      await this.q(
        `INSERT INTO quant_positions (book_id, symbol, shares, avg_cost, opened_at)
         VALUES ($1,$2,$3,$4,current_date)
         ON CONFLICT (book_id, symbol) DO UPDATE SET
           shares = quant_positions.shares + EXCLUDED.shares,
           avg_cost = CASE WHEN quant_positions.shares + EXCLUDED.shares > 0
             THEN ((quant_positions.shares * COALESCE(quant_positions.avg_cost,0)) + (EXCLUDED.shares * COALESCE(EXCLUDED.avg_cost,0)))
                  / NULLIF(quant_positions.shares + EXCLUDED.shares,0)
             ELSE quant_positions.avg_cost END,
           updated_at = now()`,
        [o.book_id, o.symbol, sign * shares, marketPrice],
      );
      const cashDelta = -sign * shares * marketPrice;
      await this.q(
        `INSERT INTO quant_book_state (book_id, cash, deployed_today, deployed_date)
         VALUES ($1,$2,$3,current_date)
         ON CONFLICT (book_id) DO UPDATE SET
           cash = quant_book_state.cash + $2,
           deployed_today = CASE WHEN quant_book_state.deployed_date = current_date
             THEN quant_book_state.deployed_today + $3 ELSE $3 END,
           deployed_date = current_date, updated_at = now()`,
        [o.book_id, cashDelta, o.side === 'buy' ? shares * marketPrice : 0],
      );
      await this.audit('order.filled', { bookId: o.book_id, symbol: o.symbol, orderId, payload: { shares, price: marketPrice, cumulative: filled, complete: allDone } });
    }
    return { ok: true, filled };
  }

  async queue(bookId?: string, status = 'pending_approval', limit = 200): Promise<any[]> {
    await this.ensureTables();
    const rows = await this.q<any[]>(
      `SELECT id, book_id, symbol, side, target_shares, target_dollars, reason, status, slices, ranking_snapshot_id, created_at
       FROM quant_orders WHERE status = $1 ${bookId ? 'AND book_id = $3' : ''} ORDER BY created_at DESC LIMIT $2`,
      bookId ? [status, limit, bookId] : [status, limit],
    );
    return rows;
  }

  async auditTrail(limit = 200, bookId?: string): Promise<any[]> {
    await this.ensureTables();
    return this.q<any[]>(
      `SELECT id, at, actor, event, book_id, symbol, order_id, payload FROM quant_audit
       ${bookId ? 'WHERE book_id = $2' : ''} ORDER BY at DESC, id DESC LIMIT $1`,
      bookId ? [limit, bookId] : [limit],
    );
  }
}
