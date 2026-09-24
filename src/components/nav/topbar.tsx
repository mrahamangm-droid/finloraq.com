"use client";

import Link from "next/link";
import { Search, Bell, Plus, Command, Settings, LogOut, ChevronDown, SlidersHorizontal } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "next-auth/react";
import { MobileNav } from "./mobile-nav";

// Global search / command palette / notifications / quick create, per
// section 19. The palette and search are UI shells here — Phase 1 wires
// the layout; Phase 2+ features (journals, invoices, etc.) register their
// own quick-create actions and searchable entities as they're built.
//
// Responsive: the search box shrinks to fit, labels collapse to icons on
// phones, and the user's name/company is hidden below the md breakpoint
// (the avatar stays), so the bar never overflows a 320px screen.
export function Topbar({
  userName,
  companyName,
  avatarUrl,
  navHrefs,
  logo = null,
}: {
  userName: string;
  companyName: string;
  avatarUrl?: string | null;
  navHrefs?: string[];
  logo?: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-4">
      <MobileNav companyName={companyName} hrefs={navHrefs} logo={logo} />

      <button
        type="button"
        aria-label="Search or ask Finloraq AI"
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted sm:max-w-72"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">
          <span className="sm:hidden">Search…</span>
          <span className="hidden sm:inline">Search or ask Finloraq AI…</span>
        </span>
        <span className="hidden items-center gap-0.5 rounded border border-border px-1 text-xs md:flex">
          <Command className="h-3 w-3" aria-hidden="true" /> K
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <button
          type="button"
          className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          title="Quick create"
          aria-label="Quick create"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">New</span>
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`Account menu for ${userName}`}
              className="flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 hover:bg-muted sm:border-l sm:border-border sm:pl-3"
            >
              <div className="hidden max-w-[12rem] text-right md:block">
                <div className="truncate text-sm font-medium text-foreground">{userName}</div>
                <div className="truncate text-xs text-muted-foreground">{companyName}</div>
              </div>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={userName}
                  title={`${userName} · ${companyName}`}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
                  title={`${userName} · ${companyName}`}
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-56 rounded-md border border-border bg-card p-1 text-card-foreground shadow-md"
            >
              <div className="truncate px-2 py-1.5 text-sm">
                <div className="truncate font-medium">{userName}</div>
                <div className="truncate text-xs text-muted-foreground">{companyName}</div>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings"
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings/preferences"
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  My preferences
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => signOut({ callbackUrl: "/login" })}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
