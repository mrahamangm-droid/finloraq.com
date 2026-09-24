"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker (public/sw.js) once the page is
 * idle, on any browser that supports it. Safe to render on every page —
 * `"serviceWorker" in navigator` is false on browsers without support
 * (older Safari/Firefox versions, some in-app webviews), so this is a
 * no-op there rather than an error.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a progressive enhancement, not a requirement —
        // if registration fails (e.g. running over plain HTTP in a preview
        // environment) the app works exactly as it would without a SW.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
