import { apiRoute } from "@/lib/api/v1";
import { listResource } from "@/lib/api/v1Resources";
import { createDraftBill } from "@/lib/api/v1Drafts";

export const GET = apiRoute({ module: "bills", action: "VIEW" }, (ctx, req) => listResource("bill", ctx, req));
export const POST = apiRoute({ module: "bills", action: "CREATE" }, (ctx, req) => createDraftBill(ctx, req));
