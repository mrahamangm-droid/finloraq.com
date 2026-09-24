// Company-wide sidebar layout (Settings → Navigation). Pure and tested.

export interface NavConfig { order: string[]; hidden: string[] }

/** Always visible, so nobody can lock themselves out of the app. */
export const LOCKED_NAV = new Set(["/dashboard", "/settings"]);

export function normalizeNavConfig(raw: unknown, known: readonly string[]): NavConfig {
  const knownSet = new Set(known);
  const obj = raw && typeof raw === "object" ? (raw as Partial<Record<keyof NavConfig, unknown>>) : {};
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && knownSet.has(x)) : []);
  const order = [...new Set(list(obj.order))];
  for (const k of known) if (!order.includes(k)) order.push(k);
  const hidden = [...new Set(list(obj.hidden))].filter((h) => !LOCKED_NAV.has(h));
  return { order, hidden };
}

/** Applies a config to the nav items: ordered, hidden ones removed. */
export function applyNavConfig<T extends { href: string }>(items: readonly T[], config: NavConfig): T[] {
  const byHref = new Map(items.map((i) => [i.href, i]));
  const hidden = new Set(config.hidden);
  return config.order.map((h) => byHref.get(h)).filter((i): i is T => !!i && !hidden.has(i.href));
}
