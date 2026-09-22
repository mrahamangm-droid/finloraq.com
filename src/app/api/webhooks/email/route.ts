import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyInboundEmailSecret, processInboundEmailAttachment } from "@/lib/integrations/email";

const schema = z.object({
  companyId: z.string().min(1),
  fromAddress: z.string().email(),
  fileName: z.string().min(1),
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

/**
 * Inbound webhook — NOT gated by requireTenantContext (there's no signed-in
 * user; the caller is an email provider), so authentication here is the
 * shared secret header instead. See src/lib/integrations/email.ts for the
 * documented simplifications around company routing and acting identity.
 */
export async function POST(req: Request) {
  if (!verifyInboundEmailSecret(req.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const result = await processInboundEmailAttachment(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ingestion failed." }, { status: 400 });
  }
}
