import Link from "next/link";
import { pageHref, totalPages, PAGE_SIZE } from "@/lib/pagination";

/**
 * Previous/next pager for a server-rendered list. Renders nothing when the
 * whole list fits on one page. `params` are the page's other search params,
 * carried into every link so filters survive paging.
 */
export function Pagination({
  path,
  params,
  page,
  total,
  noun = "rows",
}: {
  path: string;
  /** The page's searchParams (any shape; only string values are carried). */
  params: object;
  page: number;
  total: number;
  noun?: string;
}) {
  const pages = totalPages(total);
  const keep = Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"));
  if (total <= PAGE_SIZE && page === 1) return null;
  const first = Math.min(total, (page - 1) * PAGE_SIZE + 1);
  const last = Math.min(total, page * PAGE_SIZE);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {total === 0 || first > total ? `Page ${page} of ${pages}` : `${first}–${last} of ${total.toLocaleString()} ${noun}`}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={pageHref(path, keep, Math.min(page - 1, pages))} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={pageHref(path, keep, page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
