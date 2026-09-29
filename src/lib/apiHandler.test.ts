import { describe, expect, it } from "vitest";
import { enumParam, knownErrorResponse, MAX_PAGE_SIZE, pageParams, withApiErrors } from "@/lib/apiHandler";
import { ForbiddenError } from "@/lib/rbac";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { UsageLimitExceededError } from "@/lib/billing/usage";

const url = (qs: string) => new URL(`http://localhost/api/x${qs}`);

describe("pageParams", () => {
  it("defaults, clamps and ignores junk", () => {
    expect(pageParams(url(""))).toEqual({ page: 1, limit: 50 });
    expect(pageParams(url("?page=3&limit=20"))).toEqual({ page: 3, limit: 20 });
    expect(pageParams(url("?page=0&limit=0"))).toEqual({ page: 1, limit: 1 });
    expect(pageParams(url("?page=-5&limit=999999"))).toEqual({ page: 1, limit: MAX_PAGE_SIZE });
    expect(pageParams(url("?page=abc&limit=xyz"))).toEqual({ page: 1, limit: 50 });
  });
});

describe("enumParam", () => {
  it("only passes allowed values through", () => {
    expect(enumParam(url("?s=NEW"), "s", ["NEW", "DONE"] as const)).toBe("NEW");
    expect(enumParam(url("?s=new"), "s", ["NEW", "DONE"] as const)).toBeUndefined();
    expect(enumParam(url(""), "s", ["NEW"] as const)).toBeUndefined();
  });
});

describe("knownErrorResponse / withApiErrors", () => {
  it.each([
    [new ForbiddenError("Missing VIEW on crm."), 403],
    [new NotFoundError("Lead not found"), 404],
    [new ValidationError("Customer not found."), 400],
    [new UsageLimitExceededError(10, 10), 402],
    [new SyntaxError("Unexpected token"), 400],
  ])("maps %o to %i", async (err, status) => {
    const res = knownErrorResponse(err)!;
    expect(res.status).toBe(status);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("never exposes a SyntaxError's own text", async () => {
    const res = knownErrorResponse(new SyntaxError("secret internals"))!;
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });

  it("rethrows unknown errors so Next logs them and answers a bare 500", async () => {
    const handler = withApiErrors(async () => {
      throw new Error("db exploded");
    });
    await expect(handler()).rejects.toThrow("db exploded");
  });

  it("passes successful responses through", async () => {
    const handler = withApiErrors(async (n: number) => new Response(String(n * 2)));
    expect(await (await handler(21)).text()).toBe("42");
  });
});
