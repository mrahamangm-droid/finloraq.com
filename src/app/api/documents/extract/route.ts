import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { extractDocument } from "@/lib/ai/extraction";
import { AiNotConfiguredError } from "@/lib/ai/provider";

const schema = z.object({
  fileName: z.string().min(1),
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const result = await extractDocument({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      fileName: parsed.data.fileName,
      imageBase64: parsed.data.imageBase64,
      mimeType: parsed.data.mimeType,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withApiErrors(handlePOST);
