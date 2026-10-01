import { apiRoute } from "@/lib/api/v1";

/** Which company and role this key acts as — handy for checking a key works. */
export const GET = apiRoute(null, async (ctx) => ({
  data: {
    company: { id: ctx.active.company.id, name: ctx.active.company.name, baseCurrency: ctx.active.company.baseCurrency },
    key: { id: ctx.keyId, role: ctx.keyRole },
  },
}));
