import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createCompanyForUser } from "@/lib/onboarding";

const schema = z.object({
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  baseCurrency: z.string().length(3),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const company = await createCompanyForUser({
    userId: session.user.id,
    name: parsed.data.name,
    countryCode: parsed.data.countryCode.toUpperCase(),
    baseCurrency: parsed.data.baseCurrency.toUpperCase(),
  });

  return NextResponse.json({ id: company.id });
}
