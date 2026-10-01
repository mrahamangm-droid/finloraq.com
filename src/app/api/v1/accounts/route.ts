import { apiRoute } from "@/lib/api/v1";
import { listResource, RESOURCE_MODULE } from "@/lib/api/v1Resources";

export const GET = apiRoute({ module: RESOURCE_MODULE.account, action: "VIEW" }, (ctx, req) => listResource("account", ctx, req));
