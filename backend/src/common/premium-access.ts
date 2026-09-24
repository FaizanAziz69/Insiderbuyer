import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';

/**
 * Is THIS request entitled to premium data?
 *
 * George 2026-09-24: "plesae paygate the new wealth tracker and CQS data".
 * Both datasets were shipped with the gate in the browser only — `PremiumValue`
 * and the DataTable row wall hide the values on screen while the API hands the
 * whole payload to anyone who asks, `curl` and scrapers included. A visual gate
 * over an open endpoint is not a paygate; it is a blurred image of one. (The
 * site already knows it is scraped — the Tencent AS132203 sweep is what the
 * bot gate was built for.)
 *
 * So the shaping happens HERE, on the way out, and the browser gate stays as
 * the thing the reader sees. Guests and free accounts get a payload with the
 * paid fields removed — not zeroed, REMOVED, so nothing downstream can mistake
 * a masked value for a real one.
 *
 * Read-only and fail-closed: no token, a bad token, a deleted account or any
 * error at all means "not premium".
 */
@Injectable()
export class PremiumAccessService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
  ) {}

  /** `Authorization: Bearer <jwt>` → does that account hold Insider Access? */
  async isPremium(authHeader?: string): Promise<boolean> {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return false;
    try {
      const payload = this.auth.verifyToken(token);
      if (!payload) return false;
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user) return false;
      return this.billing.isPremium(user);
    } catch {
      return false;
    }
  }
}

/**
 * Drop `keys` from every row unless the caller is entitled.
 *
 * Deleting beats nulling: a null reads as "we looked and there was nothing",
 * which is a different and wrong claim — the CQS board would show a real "—"
 * for a committee seat that exists. An absent key is unambiguous, and the
 * browser gate never reads the value when it is locked anyway.
 */
export function stripPremiumFields<T extends Record<string, unknown>>(
  rows: T[],
  keys: readonly string[],
  entitled: boolean,
): T[] {
  if (entitled) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of keys) delete out[k];
    return out as T;
  });
}

/**
 * How many rows of a paid board a visitor may see.
 *
 * The number has to match `FREE_ROWS` in the frontend's PremiumRowWall, or the
 * wall appears over rows the API already withheld and the table renders short.
 * Kept here as the SERVER's copy of that contract, with the total still
 * reported so the wall can say what is behind it.
 */
export const FREE_BOARD_ROWS = 6;
