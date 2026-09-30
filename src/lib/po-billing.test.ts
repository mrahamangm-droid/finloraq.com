import { describe, it, expect } from "vitest";
import { derivePOStatus } from "./po-billing";

const stock = { trackInventory: true };
const line = (quantity: number, receivedQuantity: number, billedQuantity: number, product: { trackInventory: boolean } | null = stock) =>
  ({ quantity, receivedQuantity, billedQuantity, product });

describe("derivePOStatus", () => {
  it("keeps a manual status while nothing has been received or billed", () => {
    expect(derivePOStatus("SENT", [line(5, 0, 0)])).toBe("SENT");
    expect(derivePOStatus("ACKNOWLEDGED", [line(5, 0, 0)])).toBe("ACKNOWLEDGED");
  });

  it("moves through partially received, received and billed", () => {
    expect(derivePOStatus("SENT", [line(5, 2, 0)])).toBe("PARTIALLY_RECEIVED");
    expect(derivePOStatus("PARTIALLY_RECEIVED", [line(5, 5, 0)])).toBe("RECEIVED");
    expect(derivePOStatus("RECEIVED", [line(5, 5, 5)])).toBe("BILLED");
  });

  it("judges receipt on stock lines only, so freight doesn't block RECEIVED", () => {
    expect(derivePOStatus("SENT", [line(5, 5, 0), line(1, 0, 0, null)])).toBe("RECEIVED");
    expect(derivePOStatus("SENT", [line(5, 5, 5), line(1, 0, 0, null)])).toBe("RECEIVED");
    expect(derivePOStatus("SENT", [line(5, 5, 5), line(1, 0, 1, null)])).toBe("BILLED");
  });

  it("falls back when a bill is released and nothing was received", () => {
    expect(derivePOStatus("BILLED", [line(1, 0, 0, null)])).toBe("ACKNOWLEDGED");
  });

  it("never overrides CANCELLED", () => {
    expect(derivePOStatus("CANCELLED", [line(5, 5, 5)])).toBe("CANCELLED");
  });
});
