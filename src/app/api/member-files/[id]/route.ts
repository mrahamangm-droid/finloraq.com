import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getMemberFileContent } from "@/lib/memberFiles";

/**
 * Streams one member file's bytes back out, on demand — the only place
 * MemberFile.dataUrl is actually read (see METADATA_SELECT's comment in
 * src/lib/memberFiles.ts for why the list views never load it). Linked
 * to from Users & Roles as a plain <a href> so it downloads like any
 * other file link, no client-side JS needed.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();

  let file;
  try {
    file = await getMemberFileContent({ companyId: active.companyId, fileId: params.id });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const commaIndex = file.dataUrl.indexOf(",");
  const base64 = commaIndex === -1 ? "" : file.dataUrl.slice(commaIndex + 1);
  const bytes = Buffer.from(base64, "base64");

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
