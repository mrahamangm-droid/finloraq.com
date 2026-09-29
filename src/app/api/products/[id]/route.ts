import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { getProduct, updateProduct, archiveProduct, restoreProduct } from "@/lib/products";

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  type: z.enum(["PRODUCT", "SERVICE"]).optional(),
  unitPrice: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  unit: z.string().max(50).optional().nullable(),
  incomeAccountCode: z.string().optional().nullable(),
  expenseAccountCode: z.string().optional().nullable(),
  taxCodeId: z.string().optional().nullable(),
  trackInventory: z.boolean().optional(),
  quantityOnHand: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional().nullable(),
  isActive: z.boolean().optional(),
});

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_req: Request, props: RouteProps) {
  const params = await props.params;
  const { id } = params;
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "products", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on products." }, { status: 403 });
  }
  const product = await getProduct(active.companyId, id);
  if (!product) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(req: Request, props: RouteProps) {
  const params = await props.params;
  const { id } = params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "EDIT");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { isActive, ...rest } = parsed.data;

  try {
    let product;
    if (Object.keys(rest).length > 0) {
      product = await updateProduct(active.companyId, id, rest);
    }
    if (isActive === false) {
      product = await archiveProduct(active.companyId, id);
    } else if (isActive === true) {
      product = await restoreProduct(active.companyId, id);
    }
    if (!product) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update product.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function DELETE(_req: Request, props: RouteProps) {
  const params = await props.params;
  const { id } = params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "DELETE");

  // Soft-delete (archive) rather than hard-delete to preserve historical
  // line-item records that reference this product catalog entry.
  const product = await archiveProduct(active.companyId, id);
  if (!product) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
