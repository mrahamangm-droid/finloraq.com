/**
 * The active company's letterhead — a compact 0.5in-tall band (logo +
 * company name) — rendered once per authenticated page and shown only
 * when that page is printed or "Saved as PDF" (see the
 * .print-letterhead-header rules in globals.css — hidden on screen,
 * `position: fixed` + `display: block` under @media print so it repeats
 * on every printed page, not just the first). Top of page only — no footer.
 *
 * Built from the company's own Company.name / Company.logoUrl (the same
 * fields the sidebar and DocumentBrandHeader use), never a shared static
 * asset: Finloraq is multi-tenant, so a printed page must only ever carry
 * the letterhead of the company it belongs to. Plain <img>, not
 * next/image: logoUrl is a data: URL (see src/lib/branding.ts) and this is
 * a print-only element where responsive srcset/lazy-loading would only
 * complicate the fixed positioning.
 */
export function PrintLetterhead({ companyName, logoUrl }: { companyName: string; logoUrl: string | null }) {
  return (
    <div className="print-letterhead-header" aria-hidden="true">
      <div className="print-letterhead-band">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="print-letterhead-logo" />
        ) : null}
        <span className="print-letterhead-name">{companyName}</span>
      </div>
    </div>
  );
}
