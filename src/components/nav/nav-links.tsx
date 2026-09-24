"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav-items";

// The app's section links, with the current section highlighted and marked
// aria-current="page" (so screen readers announce it too). `onNavigate`
// lets the mobile drawer close itself when a link is tapped.
// `hrefs` is the company's menu (Settings → Menu): which items, in which order.
export function NavLinks({ onNavigate, hrefs }: { onNavigate?: () => void; hrefs?: string[] }) {
  const pathname = usePathname() ?? "";
  const items = hrefs ? hrefs.flatMap((h) => NAV.filter((n) => n.href === h)) : NAV;
  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={
              "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm " +
              (active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </>
  );
}
