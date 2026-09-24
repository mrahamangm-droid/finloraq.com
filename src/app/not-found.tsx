import Link from "next/link";

// Next.js renders this for any unmatched route across the whole app —
// marketing pages and the authenticated (app) routes alike — since neither
// section defines its own not-found.tsx. It intentionally uses the global
// Tailwind design tokens (globals.css) rather than the #fm-root-scoped
// marketing CSS, because this page can render without ever having loaded a
// marketing page's own <style> tag.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist, or may have moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </Link>
        <a
          href="mailto:support@finloraq.com"
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
