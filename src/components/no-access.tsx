/**
 * What a signed-in member sees when their role has no VIEW permission on a
 * page's module. Rendered by viewGate() (src/lib/page-access.tsx) instead of
 * the page's data, so the refusal happens server-side before anything is
 * queried — hiding the sidebar link would never be the control.
 */
export function NoAccess({ area }: { area: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">You don&apos;t have access to {area}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Your role in this company doesn&apos;t include viewing {area}. Ask a company admin if you need it.
      </p>
    </div>
  );
}
