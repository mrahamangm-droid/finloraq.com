/**
 * Letterhead for a customer-facing document — set once here so every
 * document type shares it. Today that's just the Invoice detail page
 * (src/app/(app)/sales/[id]/page.tsx); quotations, receipts and
 * statements don't exist as their own features yet, but when they're
 * built they should render this same component rather than duplicating
 * the branding markup.
 */
export function DocumentBrandHeader({
  companyName,
  logoUrl,
  tagline,
  brandEmail,
  brandPhone,
  brandAddress,
}: {
  companyName: string;
  logoUrl: string | null;
  tagline: string | null;
  brandEmail: string | null;
  brandPhone: string | null;
  brandAddress: string | null;
}) {
  const hasContact = brandEmail || brandPhone || brandAddress;

  return (
    <div className="flex items-start gap-3 border-b border-border pb-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${companyName} logo`} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : null}
      <div className="min-w-0">
        <div className="text-base font-semibold text-foreground">{companyName}</div>
        {tagline && <div className="text-xs text-muted-foreground">{tagline}</div>}
        {hasContact && (
          <div className="mt-1 text-xs text-muted-foreground">
            {[brandEmail, brandPhone, brandAddress].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
