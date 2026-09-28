"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_SNOOZE_COOKIE } from "@/lib/mfaRequirement";

/** "Remind me later": hides the prompt for the rest of this browser session. */
export async function snoozeMfaPromptAction() {
  (await cookies()).set(MFA_SNOOZE_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/dashboard");
}
