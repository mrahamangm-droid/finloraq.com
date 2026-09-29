import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listProducts, createProduct } from "@/lib/products";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  type: z.enum(["PRODUCT", "SERVICE"]).optional(),
  unitPrice: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  unit: z.string().max(50).optional().nullable(),
  incomeAccountCode: z.string().optional().nullable(),
  expenseAccountCode: z.string().optional().nullable(),
  taxCodeId: z.string().optional().nullable(),
  trackInventory: z.boolean().optional(),
  quantityOnHand: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional().nullable(),
});

export async function GET(req: Request) {
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "products", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on products." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as "PRODUCT" | "SERVICE" | null;
  const search = searchParams.get("search") ?? undefined;
  const includeInactive = searchParams.get("includeInactive") === "true";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "100", 10);

  const result = await listProducts(active.companyId, {
    search,
    type: type ?? undefined,
    includeInactive,
    page,
    limit,
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "CREATE");

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const product = await createProduct(active.companyId, {
      ...parsed.data,
      currency: parsed.data.currency ?? active.company.baseCurrency,
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create product.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
