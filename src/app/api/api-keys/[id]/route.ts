import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { domainErrorResponse } from "@/lib/api-errors";
import { revokeApiKey } from "@/lib/apiKeys";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await revokeApiKey({ companyId: active.companyId, membershipId: active.id, userId, apiKeyId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
