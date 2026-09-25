"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectRowActions({ projectId, name, isActive }: { projectId: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setActive(next: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${name}? This can't be undone.`)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const btn = "text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-3">
        {isActive ? (
          <>
            <button type="button" disabled={loading} onClick={() => setActive(false)} className={`${btn} text-muted-foreground`}>Archive</button>
            <button type="button" disabled={loading} onClick={remove} className={`${btn} text-destructive`}>Delete</button>
          </>
        ) : (
          <button type="button" disabled={loading} onClick={() => setActive(true)} className={`${btn} text-muted-foreground`}>Restore</button>
        )}
      </div>
      {error && <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
