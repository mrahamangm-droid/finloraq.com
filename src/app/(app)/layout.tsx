import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";

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

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarUrl: true } });

  return (
    <div className="app-shell flex overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar userName={session.user.name} companyName={ctx.active.company.name} avatarUrl={me?.avatarUrl ?? null} />
        <main className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">{children}</main>
      </div>
    </div>
  );
}
