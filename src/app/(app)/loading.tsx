// Shown inside the app shell (sidebar and topbar stay put) while a signed-in
// page's server data loads. Every page under (app) renders per request, so
// without this, navigating between them showed nothing until the whole page
// was ready. Marketing pages are static and don't need it.
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="h-7 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        ))}
      </div>
      <div aria-hidden="true" className="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    </div>
  );
}
