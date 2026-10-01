import { apiRoute, dateParam } from "@/lib/api/v1";
import { profitAndLoss } from "@/lib/reports";

export const GET = apiRoute({ module: "reports", action: "VIEW" }, async (ctx, req) => {
  const from = dateParam(req, "from", undefined, "start");
  const to = dateParam(req, "to");
  return { from, to, data: await profitAndLoss(ctx.companyId, from, to) };
});
