import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { extractDocument } from "@/lib/ai/extraction";
import { aiErrorResponse, aiRateLimitResponse, MAX_AI_UPLOAD_BASE64_CHARS } from "@/lib/ai/limits";

const schema = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_AI_UPLOAD_BASE64_CHARS, "File is too large — the limit is 4.5MB."),
  mimeType: z.string().min(1).max(255),
});

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((i) => i.path[0] === "fileBase64" && i.code === "too_big");
    return NextResponse.json(
      { error: tooLarge ? "File is too large — the limit is 4.5MB." : "Invalid input." },
      { status: tooLarge ? 413 : 400 }
    );
  }

  const limited = await aiRateLimitResponse("extract", userId, req.headers);
  if (limited) return limited;

  try {
    const result = await extractDocument({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      fileName: parsed.data.fileName,
      fileBase64: parsed.data.fileBase64,
      mimeType: parsed.data.mimeType,
    });
    return NextResponse.json(result);
  } catch (err) {
    const res = aiErrorResponse(err, "documents/extract");
    if (res) return res;
    throw err;
  }
}
