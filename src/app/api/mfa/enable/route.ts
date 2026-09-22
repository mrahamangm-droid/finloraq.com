import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { confirmMfaSetup } from "@/lib/userMfa";

const schema = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  try {
    const backupCodes = await confirmMfaSetup(session.user.id, parsed.data.token);
    return NextResponse.json({ enabled: true, backupCodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not enable MFA." }, { status: 400 });
  }
}
