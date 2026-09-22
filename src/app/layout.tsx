import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finloraq — AI Finance Operating System",
  description:
    "Accounting, cash flow, tax, automation and financial intelligence in one intelligent platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
