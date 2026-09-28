import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getMfaRequirement, MFA_SNOOZE_COOKIE } from "@/lib/mfaRequirement";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { ThemeSync } from "@/components/nav/theme-sync";
import { PrintLetterhead } from "@/components/print/print-letterhead";
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

  // Company Admins / CFOs without MFA are prompted to set it up once per
  // browser session (src/lib/mfaPolicy.ts). Never a block: /mfa-setup always
  // offers "Remind me later", and afterwards a reminder banner stays up.
  const mfa = await getMfaRequirement(ctx.userId);
  const mfaPending = mfa.kind === "grace" || mfa.kind === "overdue";
  if (mfaPending && !(await cookies()).get(MFA_SNOOZE_COOKIE)) {
    redirect("/mfa-setup");
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
      <PrintLetterhead />
      <Sidebar hrefs={navHrefs} companyName={company.name} logo={company.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userName={session.user.name}
          companyName={company.name}
          avatarUrl={me?.avatarUrl ?? null}
          navHrefs={navHrefs}
          logo={company.logoUrl}
        />
        {mfaPending && (
          <div role="status" className={`border-b px-4 py-2 text-sm ${mfa.kind === "overdue" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted text-foreground"}`}>
            {mfa.kind === "overdue"
              ? "Your role requires two-step verification and the grace period has ended. "
              : `Your role requires two-step verification — ${mfa.daysLeft} ${mfa.daysLeft === 1 ? "day" : "days"} left to set it up. `}
            <Link href="/mfa-setup" className="font-medium underline">Set it up now</Link>
          </div>
        )}
        <main className="app-main flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">{children}</main>
      </div>
    </div>
  );
}
