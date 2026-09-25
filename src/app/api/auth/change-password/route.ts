import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { changePassword, WrongPasswordError, WeakPasswordError } from "@/lib/userPassword";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const ip = clientIpFromHeaders(req.headers);
  // Two tiers, same shape as reset-password's IP + identity limits: a
  // per-IP ceiling plus a tighter per-account ceiling on guessing this
  // specific user's current password.
  const ipLimit = checkRateLimit(`change-password:ip:${ip}`, 20, 15 * 60 * 1000);
  const userLimit = checkRateLimit(`change-password:user:${session.user.id}`, 8, 15 * 60 * 1000);
  if (!ipLimit.allowed || !userLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    await changePassword({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      ipAddress: ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WrongPasswordError || err instanceof WeakPasswordError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
