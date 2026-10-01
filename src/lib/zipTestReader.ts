import { inflateRawSync } from "node:zlib";
import { crc32 } from "@/lib/zip";

/**
 * Test helper: reads a ZIP through its central directory (the way real
 * unzip tools do), inflates each entry and verifies its CRC-32. Lives
 * beside zip.ts so both the unit and the DB-backed export tests use it.
 */
export function readZip(buf: Buffer): Map<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + csize);
    const raw = method === 8 ? inflateRawSync(data) : data;
    if (crc32(raw) !== crc) throw new Error(`CRC mismatch on ${name}`);
    out.set(name, raw.toString("utf8"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
