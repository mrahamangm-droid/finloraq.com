"use client";

import { useEffect } from "react";

/**
 * With the "Automatic" theme, follows the device's light/dark setting live
 * (adds/removes Tailwind's `dark` class on the app shell), so `dark:` styles
 * work too — not just the CSS colour variables.
 */
export function ThemeSync({ theme }: { theme: "system" | "light" | "dark" }) {
  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell || theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => shell.classList.toggle("dark", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}
