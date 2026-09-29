import { beforeEach, describe, expect, it } from "vitest";
import { __useMemoryRateLimitsForTests } from "@/lib/rateLimit";
import { aiErrorResponse, aiRateLimitResponse } from "@/lib/ai/limits";
import { AiNotConfiguredError, AiProviderError } from "@/lib/ai/provider";
import { ForbiddenError } from "@/lib/rbac";
import { UsageLimitExceededError } from "@/lib/billing/usage";

const headers = (ip: string) => new Headers({ "x-forwarded-for": ip });

describe("aiRateLimitResponse", () => {
  beforeEach(() => __useMemoryRateLimitsForTests());

  it("allows a user's first 20 chat calls a minute, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 20; i++) expect(await aiRateLimitResponse("chat", "u1", headers("198.51.100.1"))).toBeNull();
    const res = (await aiRateLimitResponse("chat", "u1", headers("198.51.100.1")))!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another user is unaffected.
    expect(await aiRateLimitResponse("chat", "u2", headers("198.51.100.2"))).toBeNull();
  });

  it("caps one IP across many accounts", async () => {
    let blocked = 0;
    for (let i = 0; i < 40; i++) {
      if (await aiRateLimitResponse("extract", `user-${i}`, headers("198.51.100.9"))) blocked++;
    }
    expect(blocked).toBe(10); // perIp 30
  });

  it("keeps extraction's budget separate from chat's", async () => {
    for (let i = 0; i < 10; i++) await aiRateLimitResponse("extract", "u3", headers("198.51.100.3"));
    expect((await aiRateLimitResponse("extract", "u3", headers("198.51.100.3")))?.status).toBe(429);
    expect(await aiRateLimitResponse("chat", "u3", headers("198.51.100.3"))).toBeNull();
  });
});

describe("aiErrorResponse", () => {
  it("maps each failure to its status without echoing provider internals", async () => {
    expect(aiErrorResponse(new ForbiddenError("Missing VIEW on ai_copilot."), "t")?.status).toBe(403);
    expect(aiErrorResponse(new UsageLimitExceededError(100, 100), "t")?.status).toBe(402);
    expect(aiErrorResponse(new AiNotConfiguredError(), "t")?.status).toBe(503);

    const provider = aiErrorResponse(new AiProviderError('Anthropic API error 400: {"secret":"body"}', 400), "t")!;
    expect(provider.status).toBe(502);
    expect(JSON.stringify(await provider.json())).not.toContain("secret");

    const user = aiErrorResponse(new Error("This exact file was already uploaded."), "t")!;
    expect(user.status).toBe(400);
    expect((await user.json()).error).toContain("already uploaded");
  });

  it("leaves unexpected error types (e.g. database errors) to be rethrown", () => {
    class PrismaLikeError extends Error {}
    expect(aiErrorResponse(new PrismaLikeError("relation \"Document\" ..."), "t")).toBeNull();
    expect(aiErrorResponse("not an error", "t")).toBeNull();
  });
});
