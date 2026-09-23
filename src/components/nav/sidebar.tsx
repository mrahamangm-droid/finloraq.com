import { NavLinks } from "./nav-links";

// Desktop and landscape-tablet navigation (≥ 1024px). Below that the same
// links live in the slide-out drawer opened from the topbar (MobileNav), so
// phones and portrait tablets are never left without navigation.
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-base font-semibold text-card-foreground">Finloraq</span>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <NavLinks />
      </nav>
    </aside>
  );
}
