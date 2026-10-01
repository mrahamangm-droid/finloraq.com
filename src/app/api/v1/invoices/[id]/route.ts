import { apiRoute } from "@/lib/api/v1";
import { getResource, RESOURCE_MODULE } from "@/lib/api/v1Resources";

export const GET = apiRoute({ module: RESOURCE_MODULE.invoice, action: "VIEW" }, (ctx, _req, params) => getResource("invoice", ctx, params.id!));
