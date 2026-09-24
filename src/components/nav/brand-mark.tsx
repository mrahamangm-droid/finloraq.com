/** Company logo + name when a logo is set, otherwise the Finloraq wordmark. */
export function BrandMark({ companyName, logo }: { companyName: string; logo: string | null }) {
  if (!logo) return <span className="text-base font-semibold text-card-foreground">Finloraq</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
      <span className="truncate text-sm font-semibold text-card-foreground">{companyName}</span>
    </span>
  );
}
