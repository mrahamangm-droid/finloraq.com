"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/preferences", label: "My preferences" },
  { href: "/settings/branding", label: "Branding" },
  { href: "/settings/custom-fields", label: "Custom fields" },
  { href: "/settings/navigation", label: "Menu" },
];

export function SettingsTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Small "Saved" / error line shared by the settings forms. */
export function SaveStatus({ state }: { state: { kind: "idle" | "saving" | "saved" | "error"; message?: string } }) {
  if (state.kind === "idle") return null;
  return (
    <span role="status" className={`text-sm ${state.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {state.kind === "saving" ? "Saving…" : state.kind === "saved" ? "Saved" : state.message}
    </span>
  );
}
