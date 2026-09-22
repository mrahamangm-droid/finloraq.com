import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userName={session.user.name} companyName={ctx.active.company.name} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}
