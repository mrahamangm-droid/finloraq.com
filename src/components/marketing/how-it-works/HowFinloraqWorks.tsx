"use client";

// "How Finloraq works" — the homepage's signature 3D section.
//
// The markup is server-rendered (readable by search engines, screen readers
// and no-JS visitors). After hydration the controller — and with it the
// WebGL scene — is loaded as a separate chunk, so none of the 3D code is on
// the critical path, and the scene itself only boots when the section nears
// the viewport. See ./README.md for the architecture and how to edit copy.

import { useEffect, useRef } from "react";
import { HIW_STYLE, renderHowItWorksHtml } from "./markup";

const HTML = renderHowItWorksHtml();

export function HowFinloraqWorks() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = ref.current?.querySelector<HTMLElement>(".hiw");
    if (!section) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("./controller")
      .then(({ mountHowItWorks }) => {
        if (!cancelled) dispose = mountHowItWorks(section);
      })
      .catch(() => {
        /* progressive enhancement only — the static section still reads fine */
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIW_STYLE }} />
      <div ref={ref} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: HTML }} />
    </>
  );
}
