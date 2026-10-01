import { apiRoute } from "@/lib/api/v1";
import { listResource } from "@/lib/api/v1Resources";
import { createDraftInvoice } from "@/lib/api/v1Drafts";

export const GET = apiRoute({ module: "invoices", action: "VIEW" }, (ctx, req) => listResource("invoice", ctx, req));
export const POST = apiRoute({ module: "invoices", action: "CREATE" }, (ctx, req) => createDraftInvoice(ctx, req));
