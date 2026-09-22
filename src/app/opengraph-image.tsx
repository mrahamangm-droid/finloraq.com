import { ImageResponse } from "next/og";

// Next's file-based convention: this route renders /opengraph-image and is
// automatically wired into every page's og:image (and, per Twitter's own
// fallback behavior, twitter:image too) unless a page defines its own
// opengraph-image.tsx in a nested segment. Rendered at request time with
// next/og (Satori under the hood) rather than a static asset — no image
// file to source, keep in sync with rebrands, or host externally (the
// app's CSP only allows same-origin images, so this had to be generated,
// not fetched from a design tool).
export const runtime = "edge";
export const alt = "Finloraq — AI Finance Operating System";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "88px",
          background:
            "radial-gradient(1100px 520px at 18% -10%, #171F3A 0%, #0A1120 55%), #0A1120",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#6E64F0",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
            FINLORAQ
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 60,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: 920,
            display: "flex",
          }}
        >
          Your business. Understood.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            color: "#9AA7C0",
            maxWidth: 820,
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          Real double-entry accounting plus AI that explains what happened, why,
          and what to do next.
        </div>
      </div>
    ),
    { ...size }
  );
}
