import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { disableMfa } from "@/lib/userMfa";

const schema = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  try {
    await disableMfa(session.user.id, parsed.data.token);
    return NextResponse.json({ enabled: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not disable MFA." }, { status: 400 });
  }
}
