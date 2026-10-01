/**
 * Offset pagination for the app's list pages — the same scheme the Audit Log
 * page has always used (?page=N, newest first, fixed page size), pulled out
 * so every list paginates the same way instead of capping at N rows.
 * Pure: no database access, so it's unit-tested directly.
 */
export const PAGE_SIZE = 50;

/** "?page=" value → a 1-based page number; anything missing or invalid is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 1_000_000) : 1;
}

/** Prisma skip/take for a page. */
export function pageWindow(page: number, size = PAGE_SIZE): { skip: number; take: number } {
  return { skip: (page - 1) * size, take: size };
}

export function totalPages(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * The URL for another page of the same list, keeping every other filter
 * (period, customerId, …). Empty values are dropped; page 1 omits ?page.
 */
export function pageHref(path: string, params: Record<string, string | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== "page" && v) q.set(k, v);
  }
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
