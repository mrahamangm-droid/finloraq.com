import { can, type Module } from "@/lib/rbac";

/**
 * Which RBAC module each sidebar entry belongs to — the same module the
 * page's own server-side check uses. `null` = shown to every member
 * (pages that are open to all roles by design, or that check each action's
 * own permission themselves).
 *
 * Cosmetic only: hiding a link is never the control. Every page and API
 * still enforces its permission on the server.
 */
export const NAV_MODULE: Record<string, Module | null> = {
  "/dashboard": "dashboard",
  "/accounting": "accounting",
  "/sales": "invoices",
  "/purchases": "bills",
  "/expenses": "expenses",
  "/banking": "banking",
  "/customers": "customers",
  "/suppliers": "suppliers",
  "/projects": "projects",
  "/taxes": "taxes",
  "/ai-copilot": "ai_copilot",
  "/reports": "reports",
  "/documents": "documents",
  "/import": null,
  "/users": null,
  "/billing": null,
  "/settings": "settings",
  "/audit": "audit",
};

/** Keeps only the hrefs this member's role can view (unknown hrefs are kept). */
export async function visibleNavHrefs(membershipId: string, hrefs: string[]): Promise<string[]> {
  const modules = [...new Set(hrefs.map((h) => NAV_MODULE[h]).filter((m): m is Module => !!m))];
  const allowed = new Map(await Promise.all(modules.map(async (m) => [m, await can(membershipId, m, "VIEW")] as const)));
  return hrefs.filter((h) => {
    const m = NAV_MODULE[h];
    return !m || allowed.get(m) === true;
  });
}
