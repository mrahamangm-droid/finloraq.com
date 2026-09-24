import type { FieldDef } from "@/lib/customization/customFields";

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

/**
 * Form inputs for a company's custom fields. Each is named `cf_<key>` so
 * `customFieldsFromForm` can read it back; the server re-validates every value.
 */
export function CustomFieldInputs({ defs, values = {} }: { defs: FieldDef[]; values?: Record<string, unknown> }) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((d) => {
        const name = `cf_${d.key}`;
        const v = values[d.key];
        const label = `${d.label}${d.required ? "" : " (optional)"}`;
        if (d.type === "CHECKBOX") {
          return (
            <label key={d.key} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
              <input type="checkbox" name={name} defaultChecked={v === true} className="h-4 w-4" />
              {d.label}
            </label>
          );
        }
        if (d.type === "SELECT") {
          return (
            <select key={d.key} name={name} required={d.required} defaultValue={typeof v === "string" ? v : ""} aria-label={d.label} className={input}>
              <option value="">{label}</option>
              {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        }
        return (
          <input
            key={d.key}
            name={name}
            type={d.type === "DATE" ? "date" : "text"}
            inputMode={d.type === "NUMBER" ? "decimal" : undefined}
            required={d.required}
            placeholder={label}
            aria-label={d.label}
            title={d.type === "DATE" ? d.label : undefined}
            defaultValue={v === undefined || v === null ? "" : String(v)}
            maxLength={d.type === "TEXT" ? 500 : 40}
            className={input}
          />
        );
      })}
    </>
  );
}

/** Reads the stored JSON column into a plain record. */
export function fieldValues(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}
