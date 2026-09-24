import { z } from "zod";

/**
 * Shared rule for the two inline images the app accepts today — a user's
 * profile photo (User.avatarUrl) and a company's logo (Company.logoUrl).
 * No object storage is configured yet (see the TODO in src/lib/ai/
 * extraction.ts), so both are stored as `data:` URLs directly in Postgres.
 * That's fine for a small square photo/logo but not for arbitrary
 * uploads, so this caps the base64 payload at ~2MB (comfortably more than
 * any reasonable logo/headshot needs once a browser has re-encoded it)
 * and only accepts the image types every browser can both produce from a
 * <input type=file accept="image/*"> and render back in an <img>.
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 2_800_000; // ~2MB of base64 plus the "data:...;base64," prefix

const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/;

export const imageDataUrlSchema = z
  .string()
  .min(1)
  .max(MAX_IMAGE_DATA_URL_LENGTH, "Image is too large — please use a smaller file (under ~2MB).")
  .regex(DATA_URL_PATTERN, "That doesn't look like a PNG, JPEG or WebP image.");

/** Accepts a valid image data URL, or null/empty to clear the field. */
export const nullableImageDataUrlSchema = z
  .union([imageDataUrlSchema, z.literal(""), z.null()])
  .transform((v) => (v ? v : null));
