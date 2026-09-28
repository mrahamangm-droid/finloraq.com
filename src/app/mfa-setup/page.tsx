import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMfaRequirement } from "@/lib/mfaRequirement";
import { MFA_GRACE_DAYS } from "@/lib/mfaPolicy";
import { MfaPanel } from "@/components/settings/mfa-panel";
import { snoozeMfaPromptAction } from "./actions";

export const metadata = { title: "Set up two-step verification" };
export const dynamic = "force-dynamic";

/**
 * The sign-in prompt for Company Admins and CFOs who haven't set up MFA
 * (src/lib/mfaPolicy.ts). It lives outside the (app) group so the app
 * layout can send people here without a redirect loop, and it never blocks:
 * "Remind me later" is always available, before and after the grace period.
 */
export default async function MfaSetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fmfa-setup");
  const req = await getMfaRequirement(session.user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Set up two-step verification</h1>
        {req.kind === "grace" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Your role (Company Admin or CFO) needs two-step verification on this account. You have {req.daysLeft}{" "}
            {req.daysLeft === 1 ? "day" : "days"} left of the {MFA_GRACE_DAYS}-day grace period.
          </p>
        )}
        {req.kind === "overdue" && (
          <p className="mt-1 text-sm text-destructive">
            Your role (Company Admin or CFO) needs two-step verification, and the {MFA_GRACE_DAYS}-day grace period has ended.
            You can still continue, but please set it up now — it protects your company&apos;s books if your password is ever exposed.
          </p>
        )}
        {(req.kind === "satisfied" || req.kind === "not_required") && (
          <p className="mt-1 text-sm text-muted-foreground">Two-step verification isn&apos;t required for your account right now.</p>
        )}
      </div>

      <MfaPanel />

      <div className="flex flex-wrap items-center gap-3">
        {req.kind === "grace" || req.kind === "overdue" ? (
          // Continuing without MFA is the same as "later": it snoozes the prompt
          // for this browser session, so the user is never bounced back here.
          <form action={snoozeMfaPromptAction}>
            <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
              Remind me later
            </button>
          </form>
        ) : (
          <Link href="/dashboard" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Continue to Finloraq
          </Link>
        )}
      </div>
      {(req.kind === "grace" || req.kind === "overdue") && (
        <p className="text-xs text-muted-foreground">
          Just turned it on above? <Link href="/dashboard" className="underline">Continue to Finloraq</Link>.
        </p>
      )}
    </main>
  );
}
