export function ComingSoon({ module, phase }: { module: string; phase: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <h2 className="text-lg font-semibold text-foreground">{module}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Not built yet — scheduled for {phase} of the implementation plan. The navigation entry
        is live now so the information architecture is real from day one; this page will host
        working, database-backed functionality once its phase starts.
      </p>
    </div>
  );
}
