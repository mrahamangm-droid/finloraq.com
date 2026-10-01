/**
 * Displays a stored tax rate fraction (TaxCode.rate, Decimal(6,4), e.g.
 * "0.05" or "0.1275") as a percent string ("5", "12.75") by shifting the
 * decimal point — string math, so no float rounding ever shows a 4.999%.
 * Pure and dependency-free so client components can use it.
 */
export function rateToPercentString(rate: string): string {
  const [whole = "0", frac = ""] = rate.trim().split(".");
  const f = frac.padEnd(2, "0");
  const intPart = String(Number(whole) * 100 + Number(f.slice(0, 2)));
  const rest = f.slice(2).replace(/0+$/, "");
  return rest ? `${intPart}.${rest}` : intPart;
}
