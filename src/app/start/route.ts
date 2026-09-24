import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getPreferences, readNavConfig } from "@/lib/customization/server";

export const dynamic = "force-dynamic";

/**
 * Where "sign in" lands: each user's chosen start page (Settings → My
 * preferences), falling back to the dashboard if that page has since been
 * hidden from the company's menu.
 */
export async function GET(req: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const ctx = await getTenantContext();
  if (!ctx) return to("/login");
  if (!ctx.active) return to("/onboarding/company");

  const { landingPage } = await getPreferences(ctx.userId);
  const hidden = new Set(readNavConfig(ctx.active.company.navConfig).hidden);
  return to(hidden.has(landingPage) ? "/dashboard" : landingPage);
}
