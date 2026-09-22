"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-card-foreground">Create your account</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You&apos;ll set up your company on the next step.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">Full name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">Password</label>
            <input
              type="password"
              required
              minLength={12}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At least 12 characters, with upper, lower and a digit.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
