/**
 * The company's letterhead — a compact 0.5in-tall band (logo + company
 * name) — rendered once per authenticated page and shown only when that
 * page is printed or "Saved as PDF" (see the .print-letterhead-header
 * rules in globals.css — hidden on screen, `position: fixed` +
 * `display: block` under @media print so it repeats on every printed
 * page, not just the first). Top of page only — no footer. Plain <img>,
 * not next/image: this is a static, print-only asset where Next's
 * responsive-srcset/lazy-load behavior would only complicate the fixed
 * positioning for no benefit.
 *
 * Single hardcoded image for now — this deployment is single-tenant
 * (one company). If Finloraq ever has multiple companies each wanting
 * their own letterhead, this should become a per-company asset (like
 * Company.logoUrl) instead of a static public/ file.
 */
export function PrintLetterhead() {
  return (
    <div className="print-letterhead-header" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/letterhead/header.png" alt="" />
    </div>
  );
}
