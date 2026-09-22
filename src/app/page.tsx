import { redirect } from "next/navigation";

// finloraq.com's marketing site stays on WordPress/Hostinger (per your
// setup) — this app is the product itself, deployed separately (e.g.
// app.finloraq.com). So the root route just enters the product; there's
// no marketing landing page to build here. Section 21 of the spec (a
// conversion landing page) can be built later as its own route if you
// decide to point a domain straight at this app instead.
export default function RootPage() {
  redirect("/dashboard");
}
