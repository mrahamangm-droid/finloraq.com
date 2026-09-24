"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./nav-links";
import { BrandMark } from "./brand-mark";

// Phones and portrait tablets (< 1024px): a menu button in the topbar opens
// the full navigation in a slide-out drawer. Radix Dialog provides the focus
// trap, Escape to close, background scroll lock and screen-reader labelling,
// and behaves the same in Safari, Chrome, Firefox and Edge.
export function MobileNav({ companyName = "", hrefs, logo = null }: { companyName?: string; hrefs?: string[]; logo?: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating (including back/forward).
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <Dialog.Content
          className="app-drawer fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl focus:outline-none lg:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="min-w-0 text-base font-semibold text-card-foreground"><BrandMark companyName={companyName} logo={logo} /></Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
            <NavLinks onNavigate={() => setOpen(false)} hrefs={hrefs} />
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
