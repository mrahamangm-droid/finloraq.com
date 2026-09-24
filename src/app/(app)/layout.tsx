import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { ThemeSync } from "@/components/nav/theme-sync";
import { NAV } from "@/components/nav/nav-items";
import { getPreferences, readNavConfig } from "@/lib/customization/server";
import { applyNavConfig } from "@/lib/customization/nav";
import { brandStyle } from "@/lib/customization/color";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const ctx = await getTenantContext();

  if (!ctx?.active) {
    // Signed in, but not a member of any company yet — Phase 1 "company
    // setup" flow, not a dead end.
    redirect("/onboarding/company");
  }

  const company = ctx.active.company;
  const [me, prefs] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarUrl: true } }),
    getPreferences(ctx.userId),
  ]);
  // Menu order/visibility is a company-wide admin choice (Settings → Menu).
  const navHrefs = applyNavConfig(NAV, readNavConfig(company.navConfig)).map((n) => n.href as string);
  const themeClass = prefs.theme === "dark" ? "theme-dark dark" : prefs.theme === "light" ? "theme-light" : "";

  return (
    // Theme, density and the company's brand colour apply to this shell only,
    // so the marketing site and sign-in pages keep their own look.
    <div
      id="app-shell"
      data-theme={prefs.theme}
      className={`app-shell flex overflow-hidden bg-background text-foreground ${themeClass} ${prefs.density === "compact" ? "density-compact" : ""}`}
      style={brandStyle(company.brandColor) as React.CSSProperties | undefined}
    >
      <ThemeSync theme={prefs.theme} />
      <Sidebar hrefs={navHrefs} companyName={company.name} logo={company.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userName={session.user.name}
          companyName={company.name}
          avatarUrl={me?.avatarUrl ?? null}
          navHrefs={navHrefs}
          logo={company.logoUrl}
        />
        <main className="app-main flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">{children}</main>
      </div>
    </div>
  );
}
