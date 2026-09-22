import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/users";
import { acceptInvitationAction } from "./actions";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const [session, result] = await Promise.all([
    getServerSession(authOptions),
    getInvitationByToken(params.token),
  ]);

  const callbackUrl = encodeURIComponent(`/invite/${params.token}`);

  if (!result) {
    return <Shell title="Invitation not found">This invite link doesn't exist or has already been used.</Shell>;
  }
  if (result.resolved) {
    return <Shell title="Already resolved">This invitation has already been {result.invitation.status.toLowerCase()}.</Shell>;
  }
  if (result.expired) {
    return <Shell title="Invitation expired">This invitation expired on {result.invitation.expiresAt.toISOString().slice(0, 10)}. Ask a Company Admin at {result.invitation.company.name} to send a new one.</Shell>;
  }

  const { invitation } = result;

  if (!session?.user) {
    return (
      <Shell title={`Join ${invitation.company.name}`}>
        <p className="mb-4">
          You've been invited to join <strong>{invitation.company.name}</strong> as{" "}
          <strong>{invitation.role.replace("_", " ")}</strong>. Sign in or create an account with{" "}
          <strong>{invitation.email}</strong> to accept.
        </p>
        <div className="flex gap-3">
          <Link href={`/login?callbackUrl=${callbackUrl}`} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
          <Link href={`/register?callbackUrl=${callbackUrl}`} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">
            Create account
          </Link>
        </div>
      </Shell>
    );
  }

  if (session.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Shell title="Wrong account">
        <p>
          This invitation was sent to <strong>{invitation.email}</strong>, but you're signed in as{" "}
          <strong>{session.user.email}</strong>. Sign out and sign back in with the invited address.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${invitation.company.name}`}>
      <p className="mb-4">
        Join <strong>{invitation.company.name}</strong> as <strong>{invitation.role.replace("_", " ")}</strong>?
      </p>
      <form action={acceptInvitationAction}>
        <input type="hidden" name="token" value={params.token} />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Accept invitation
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-3 text-xl font-semibold text-card-foreground">{title}</h1>
        <div className="text-sm text-card-foreground">{children}</div>
      </div>
    </div>
  );
}
