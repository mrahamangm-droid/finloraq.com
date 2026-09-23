import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { parseVoiceCommand } from "@/lib/ai/voice";

const schema = z.object({ transcript: z.string().min(1).max(2000) });

/**
 * Takes an already-transcribed voice command (no STT provider is wired up
 * in this environment — see src/lib/ai/voice.ts) and either answers it
 * directly (query) or returns a proposed action that the client must
 * separately POST to /api/voice/confirm to actually execute. This route
 * never has side effects itself.
 */
async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  await requirePermission(active.id, "ai_copilot", "CREATE");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const result = await parseVoiceCommand({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    transcript: parsed.data.transcript,
  });

  return NextResponse.json(result);
}

export const POST = withApiErrors(handlePOST);
