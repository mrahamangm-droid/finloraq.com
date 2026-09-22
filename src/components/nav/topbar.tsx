"use client";

import { Search, Bell, Plus, Command } from "lucide-react";

// Global search / command palette / notifications / quick create, per
// section 19. The palette and search are UI shells here — Phase 1 wires
// the layout; Phase 2+ features (journals, invoices, etc.) register their
// own quick-create actions and searchable entities as they're built.
export function Topbar({ userName, companyName }: { userName: string; companyName: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <button className="flex w-72 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or ask Finloraq AI…</span>
        <span className="flex items-center gap-0.5 rounded border border-border px-1 text-xs">
          <Command className="h-3 w-3" /> K
        </span>
      </button>

      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          title="Quick create"
        >
          <Plus className="h-4 w-4" /> New
        </button>
        <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" title="Notifications">
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 border-l border-border pl-3">
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">{userName}</div>
            <div className="text-xs text-muted-foreground">{companyName}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
