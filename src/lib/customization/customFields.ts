// Validation for admin-defined custom fields. Pure and tested; the server
// uses it for every write, so the database only ever holds clean values.

export type FieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
}

export type FieldValue = string | number | boolean;

/** "PO number" → "po_number"; keeps keys stable, readable and safe. */
export function fieldKey(label: string): string {
  const k = label.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").slice(0, 40);
  return k && /^[a-z]/.test(k) ? k : `field_${k || "x"}`;
}

export class CustomFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomFieldError";
  }
}

/**
 * Turns raw input (form strings or JSON) into typed values.
 * Unknown keys are dropped; required fields must be present.
 */
export function parseCustomFieldValues(defs: readonly FieldDef[], raw: Record<string, unknown>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const d of defs) {
    const v = raw[d.key];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (d.type === "CHECKBOX") {
      out[d.key] = v === true || v === "on" || v === "true" || v === "1";
      continue;
    }
    if (empty) {
      if (d.required) throw new CustomFieldError(`${d.label} is required.`);
      continue;
    }
    const s = String(v).trim();
    switch (d.type) {
      case "NUMBER": {
        const n = Number(s.replace(/,/g, ""));
        if (!Number.isFinite(n)) throw new CustomFieldError(`${d.label} must be a number.`);
        out[d.key] = n;
        break;
      }
      case "DATE": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
          throw new CustomFieldError(`${d.label} must be a date (YYYY-MM-DD).`);
        }
        out[d.key] = s;
        break;
      }
      case "SELECT":
        if (!d.options.includes(s)) throw new CustomFieldError(`${d.label} must be one of: ${d.options.join(", ")}.`);
        out[d.key] = s;
        break;
      default:
        out[d.key] = s.slice(0, 500);
    }
  }
  return out;
}

/** Reads `cf_<key>` inputs from a submitted form. */
export function customFieldsFromForm(defs: readonly FieldDef[], form: { get(name: string): unknown }): Record<string, FieldValue> {
  const raw: Record<string, unknown> = {};
  for (const d of defs) raw[d.key] = form.get(`cf_${d.key}`);
  return parseCustomFieldValues(defs, raw);
}

export function displayFieldValue(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}
