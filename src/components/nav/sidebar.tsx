import Link from "next/link";
import { NavLinks } from "./nav-links";
import { BrandMark } from "./brand-mark";

// Desktop and landscape-tablet navigation (≥ 1024px). Below that the same
// links live in the slide-out drawer opened from the topbar (MobileNav), so
// phones and portrait tablets are never left without navigation.
export function Sidebar({ hrefs, companyName, logo }: { hrefs?: string[]; companyName: string; logo: string | null }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/dashboard" className="min-w-0"><BrandMark companyName={companyName} logo={logo} /></Link>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <NavLinks hrefs={hrefs} />
      </nav>
    </aside>
  );
}
