import { apiRoute, dateParam } from "@/lib/api/v1";
import { apAging } from "@/lib/reports";

export const GET = apiRoute({ module: "reports", action: "VIEW" }, async (ctx, req) => {
  const asOf = dateParam(req, "asOf", new Date());
  return { asOf, data: await apAging(ctx.companyId, asOf) };
});
