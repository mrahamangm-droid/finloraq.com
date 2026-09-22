import type { Metadata } from "next";
import { MarketingHomePage } from "@/components/marketing/MarketingHomePage";

// This route ("/") is the public marketing homepage — the one page in
// this app that's meant to be found and indexed. Everything else here
// stays behind login and stays noindex (see the root layout's metadata).
// The root layout sets `robots: { index: false, follow: false }` for
// the whole app; this page-level export overrides that for "/" only —
// Next.js merges page metadata over layout metadata per field, so this
// object replaces the layout's `robots` value on this route without
// touching any other route.
export const metadata: Metadata = {
  title: "Finloraq — AI Finance Operating System",
  description:
    "Finloraq turns your financial data into clarity, predictions and controlled actions — real double-entry accounting plus AI that explains what happened, why, and what to do next. Try the live demo, no registration required.",
  robots: { index: true, follow: true },
};

export default function RootPage() {
  return <MarketingHomePage />;
}
