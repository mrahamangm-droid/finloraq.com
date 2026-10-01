import { apiRoute } from "@/lib/api/v1";
import { getResource, RESOURCE_MODULE } from "@/lib/api/v1Resources";

export const GET = apiRoute({ module: RESOURCE_MODULE.supplier, action: "VIEW" }, (ctx, _req, params) => getResource("supplier", ctx, params.id!));
