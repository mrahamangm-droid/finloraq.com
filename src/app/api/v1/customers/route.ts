import { apiRoute } from "@/lib/api/v1";
import { listResource, RESOURCE_MODULE } from "@/lib/api/v1Resources";

export const GET = apiRoute({ module: RESOURCE_MODULE.customer, action: "VIEW" }, (ctx, req) => listResource("customer", ctx, req));
