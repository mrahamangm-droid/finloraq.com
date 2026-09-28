import { describe, it, expect } from "vitest";
import { seatDowngradeBlocker } from "./seats";

describe("seatDowngradeBlocker", () => {
  const base = { planLabel: "Starter", seatLimit: 2 };

  it("allows a change that fits exactly", () => {
    expect(seatDowngradeBlocker({ ...base, activeMembers: 2, pendingInvites: 0 })).toBeNull();
    expect(seatDowngradeBlocker({ ...base, activeMembers: 1, pendingInvites: 1 })).toBeNull();
  });

  it("allows a change with room to spare", () => {
    expect(seatDowngradeBlocker({ ...base, activeMembers: 1, pendingInvites: 0 })).toBeNull();
  });

  it("blocks when active members alone exceed the limit", () => {
    const msg = seatDowngradeBlocker({ ...base, activeMembers: 3, pendingInvites: 0 });
    expect(msg).toContain("includes 2 seats");
    expect(msg).toContain("3 active members");
    expect(msg).toContain("free 1 seat,");
    expect(msg).not.toContain("pending invitation");
  });

  it("counts pending invitations toward the limit", () => {
    const msg = seatDowngradeBlocker({ ...base, activeMembers: 2, pendingInvites: 2 });
    expect(msg).toContain("2 active members and 2 pending invitations");
    expect(msg).toContain("free 2 seats");
  });

  it("uses singular wording for one", () => {
    const msg = seatDowngradeBlocker({ planLabel: "Solo", seatLimit: 1, activeMembers: 1, pendingInvites: 1 });
    expect(msg).toContain("includes 1 seat,");
    expect(msg).toContain("1 active member and 1 pending invitation");
  });
});
