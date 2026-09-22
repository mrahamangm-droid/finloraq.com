import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { answerQuestion } from "@/lib/ai/copilot";

const schema = z.object({ question: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const result = await answerQuestion({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    question: parsed.data.question,
  });

  return NextResponse.json(result);
}
