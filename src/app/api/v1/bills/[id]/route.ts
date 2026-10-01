import { apiRoute } from "@/lib/api/v1";
import { getResource, RESOURCE_MODULE } from "@/lib/api/v1Resources";

export const GET = apiRoute({ module: RESOURCE_MODULE.bill, action: "VIEW" }, (ctx, _req, params) => getResource("bill", ctx, params.id!));
