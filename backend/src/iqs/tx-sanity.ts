/**
 * Shared transaction-plausibility guard.
 *
 * SEC filings genuinely contain filer errors — confirmed against raw EDGAR:
 *  - NMM 0001193125-26-318541 filed transactionPricePerShare = 748119
 *    (should be ~74.81) → a single "$846M" buy on a small-cap.
 *  - APCX 0001683168-26-005941 filed $2,900/share on a ~$0.40 stock.
 *
 * Every surface that aggregates or publishes a dollar value derived from
 * shares × price MUST run this guard. Feeds that LIST filings should keep
 * the row but flag it (priceSuspect) — a filing that exists is still a
 * filing; only its computed dollar value is untrustworthy.
 */

/** Σ shares × price above this is treated as a parse/filer artifact.
 *  (Duplicated from iqs.service's guard so both share one constant.) */
export const MAX_PLAUSIBLE_TX_VALUE = 1_000_000_000;

/** A filed per-share price more than this multiple of the live market price
 *  is an artifact (pre-split / cents-vs-dollars / fat-finger), not a trade. */
export const MAX_PRICE_VS_LIVE = 25;

/**
 * True when a transaction's economics are plausible enough to publish or
 * aggregate. `lastPrice` (the company's live share price) is optional —
 * when unknown, only the absolute-value bound applies.
 */
export function isPlausibleTx(
  sharesBought: number,
  pricePerShare: number,
  lastPrice?: number | null,
): boolean {
  const shares = Number(sharesBought);
  const px = Number(pricePerShare);
  const value = shares * px;
  if (!Number.isFinite(value) || value <= 0) return false;
  if (value > MAX_PLAUSIBLE_TX_VALUE) return false;
  const live = Number(lastPrice);
  if (Number.isFinite(live) && live > 0 && px > live * MAX_PRICE_VS_LIVE) return false;
  return true;
}

/**
 * The same predicate as reusable SQL, for aggregate queries that never
 * materialize the rows. `alias` is the insider_transactions alias; pass
 * `companyAlias` when the query joins companies so the 25×-live-price leg
 * applies too (skipped when the company has no stored price).
 */
export function plausibleTxSql(alias: string, companyAlias?: string): string {
  const base =
    `(${alias}."sharesBought" * ${alias}."pricePerShare" > 0 AND ` +
    `${alias}."sharesBought" * ${alias}."pricePerShare" <= ${MAX_PLAUSIBLE_TX_VALUE})`;
  if (!companyAlias) return base;
  return (
    `${base} AND (${companyAlias}."lastPrice" IS NULL OR ${companyAlias}."lastPrice" <= 0 ` +
    `OR ${alias}."pricePerShare" <= ${companyAlias}."lastPrice" * ${MAX_PRICE_VS_LIVE})`
  );
}
