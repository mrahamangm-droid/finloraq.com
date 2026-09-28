"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MFA_SNOOZE_COOKIE } from "@/lib/mfaRequirement";

/** "Remind me later": hides the prompt for the rest of this browser session,
 *  for THIS user only — the cookie holds their user id, and the layout only
 *  honours it for the same user, so another person signing in on the same
 *  browser is still prompted. */
export async function snoozeMfaPromptAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  (await cookies()).set(MFA_SNOOZE_COOKIE, session.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/dashboard");
}
