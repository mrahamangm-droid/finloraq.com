import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { viewGate } from "@/lib/page-access";
import { companyHasApiAccess, listApiKeys } from "@/lib/apiKeys";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

export const metadata = { title: "API Keys — Finloraq" };

export default async function ApiKeysPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "settings");
  if (denied) return denied;

  const [canEdit, planAllows, keys] = await Promise.all([
    can(active.id, "settings", "EDIT"),
    companyHasApiAccess(active.companyId),
    listApiKeys(active.companyId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          API keys let your own tools read {active.company.name}&apos;s books through the Finloraq REST API
          (<code className="font-mono text-xs">/api/v1</code>). A key acts as the person who created it, limited to the access
          you choose, so it can never do more than that person could. Send it as{" "}
          <code className="font-mono text-xs">Authorization: Bearer fq_…</code>. See the API reference in{" "}
          <code className="font-mono text-xs">docs/API.md</code>.
        </p>
      </div>

      <SettingsTabs />

      {!planAllows && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          API access is included on the Professional plan and above.{" "}
          <Link href="/billing" className="font-medium text-primary hover:underline">Compare plans</Link>
          {keys.length > 0 ? " Existing keys stop working while the company is on a plan without API access." : ""}
        </div>
      )}

      <ApiKeysManager
        canEdit={canEdit}
        planAllows={planAllows}
        rows={keys.map((k) => ({
          id: k.id,
          label: k.label,
          role: k.role,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          createdByName: k.membership.user.name ?? k.membership.user.email ?? "—",
        }))}
      />
    </div>
  );
}
