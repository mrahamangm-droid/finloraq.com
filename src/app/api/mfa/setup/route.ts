import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { startMfaSetup, getMfaStatus } from "@/lib/userMfa";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  return NextResponse.json(await getMfaStatus(session.user.id));
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const result = await startMfaSetup(session.user.id, session.user.email);
  return NextResponse.json(result);
}
