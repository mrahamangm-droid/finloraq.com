/**
 * Pure seat arithmetic for plan changes — no I/O, so it's unit-tested
 * directly (seats.test.ts) like the rest of this repo's billing math.
 *
 * Pending invitations count as used seats here for the same reason they do
 * in enforceSeatLimit() (src/lib/billing/subscription.ts): each one can be
 * accepted at any time, so a plan that can't hold them all is already
 * over its limit.
 */
export function seatDowngradeBlocker(params: {
  planLabel: string;
  seatLimit: number;
  activeMembers: number;
  pendingInvites: number;
}): string | null {
  const { planLabel, seatLimit, activeMembers, pendingInvites } = params;
  const used = activeMembers + pendingInvites;
  if (used <= seatLimit) return null;

  const parts = [`${activeMembers} active member${activeMembers === 1 ? "" : "s"}`];
  if (pendingInvites > 0) parts.push(`${pendingInvites} pending invitation${pendingInvites === 1 ? "" : "s"}`);
  const over = used - seatLimit;
  return (
    `The ${planLabel} plan includes ${seatLimit} seat${seatLimit === 1 ? "" : "s"}, but this company has ${parts.join(" and ")}. ` +
    `Deactivate members or revoke invitations on Users & Roles to free ${over} seat${over === 1 ? "" : "s"}, then change plan.`
  );
}
