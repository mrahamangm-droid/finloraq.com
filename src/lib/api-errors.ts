import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

/** Maps the domain errors a lib function throws to an HTTP response, or
 *  rethrows anything unexpected so it surfaces as a 500 (and is logged)
 *  instead of leaking an internal message as a 400. */
export function domainErrorResponse(err: unknown): NextResponse {
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}
