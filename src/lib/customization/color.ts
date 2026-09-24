// Brand colour → the app's CSS variables. Pure and tested.

export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}

/** "#4f46e5" → "243 75% 59%" (the space-separated HSL the Tailwind theme uses). */
export function hexToHslVar(hex: string): string {
  const n = normalizeHex(hex);
  if (!n) throw new Error("Invalid colour");
  const r = parseInt(n.slice(1, 3), 16) / 255, g = parseInt(n.slice(3, 5), 16) / 255, b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Relative luminance (WCAG); decides whether text on the brand colour is white or near-black. */
export function readableOn(hex: string): "light" | "dark" {
  const n = normalizeHex(hex) ?? "#4f46e5";
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  // contrast of white vs black against this colour
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "light" : "dark";
}

/** Inline CSS variables for the app shell, or undefined for the default theme. */
export function brandStyle(hex: string | null | undefined): Record<string, string> | undefined {
  const n = normalizeHex(hex);
  if (!n) return undefined;
  const fg = readableOn(n) === "light" ? "0 0% 100%" : "222 47% 7%";
  return { "--primary": hexToHslVar(n), "--primary-foreground": fg };
}
