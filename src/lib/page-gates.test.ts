import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every signed-in app page must check VIEW on its module before querying —
 * viewGate(), an explicit can(..., "VIEW"), or requirePermission() for a
 * stricter action. A page that only checks
 * CREATE/EDIT to decide whether to show a button still renders its data to
 * a role with no access at all, which is how /reports/sales-by-customer,
 * supplier detail pages and others were readable by STAFF until this test.
 *
 * Pages listed here are deliberately open to every member (see NAV_MODULE's
 * `null` entries in src/lib/nav-access.ts) or are client components whose
 * data comes only from APIs that enforce VIEW themselves.
 */
const OPEN_BY_DESIGN = new Set([
  "billing/page.tsx", // every member sees the plan; changing it checks billing permission in the API
  "import/page.tsx", // each import target checks its own CREATE permission
  "users/page.tsx", // checks users permissions per action
  "settings/preferences/page.tsx", // the signed-in user's own preferences
  "ai-copilot/page.tsx", // client component; /api/ai/* enforce ai_copilot
  "documents/page.tsx", // client component; /api/documents/* enforce documents
]);

const root = path.resolve(__dirname, "../app/(app)");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("app page VIEW gates", () => {
  it("every app page checks VIEW on its module (or is explicitly open by design)", () => {
    const missing = pages(root)
      .map((p) => path.relative(root, p).split(path.sep).join("/"))
      .filter((rel) => !OPEN_BY_DESIGN.has(rel))
      .filter((rel) => {
        const src = readFileSync(path.join(root, rel), "utf8");
        // redirect-only pages (no data) are fine too
        const isRedirectOnly = /redirect\(/.test(src) && !/prisma\.|await list|await get/.test(src);
        // requirePermission(CREATE/EDIT) on a "new"/"edit" page is stricter than VIEW, so it counts.
        return !/viewGate\(|"VIEW"\)|requirePermission\(/.test(src) && !isRedirectOnly;
      });
    expect(missing).toEqual([]);
  });
});
