import Decimal from "decimal.js";

/**
 * All money math goes through Decimal.js and is rounded to the currency's
 * minor unit only at the boundary (storage/display) — never accumulate
 * rounding error across a calculation chain. Never use JS floats for money
 * anywhere in this codebase (0.1 + 0.2 !== 0.3 is exactly the class of bug
 * an accounting product cannot ship with).
 */

export function money(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function roundMoney(value: Decimal.Value, decimals = 2): Decimal {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

export function sum(values: Decimal.Value[]): Decimal {
  return values.reduce((acc: Decimal, v) => acc.plus(v), new Decimal(0));
}

export function isZero(value: Decimal.Value): boolean {
  return new Decimal(value).isZero();
}

export function toApiNumber(value: Decimal.Value): number {
  // Only ever used at the JSON-serialization boundary for display — internal
  // logic must keep passing Decimal instances around, not numbers.
  return new Decimal(value).toNumber();
}
