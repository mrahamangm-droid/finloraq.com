// Canonical origin for this deployment. Lives in its own module (rather
// than being exported from src/app/layout.tsx, which also imports
// ./globals.css) so it can safely be imported from anywhere — metadata
// routes like sitemap.ts/robots.ts included — without dragging a
// stylesheet import into files that aren't part of the rendered component
// tree.
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://app.finloraq.com";
