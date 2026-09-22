"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

type Status = { enabled: boolean; remainingBackupCodes: number };
type SetupState = { secret: string; otpauthUri: string } | null;

export function MfaPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<SetupState>(null);
  const [token, setToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/mfa/setup").then((r) => r.json()).then(setStatus);
  }, []);

  async function beginSetup() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/mfa/setup", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Could not start MFA setup.");
      return;
    }
    setSetup(await res.json());
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/mfa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not confirm MFA.");
      return;
    }
    const data = await res.json();
    setBackupCodes(data.backupCodes);
    setSetup(null);
    setToken("");
    setStatus({ enabled: true, remainingBackupCodes: data.backupCodes.length });
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: disableToken }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not disable MFA.");
      return;
    }
    setStatus({ enabled: false, remainingBackupCodes: 0 });
    setDisableToken("");
  }

  function copySecret() {
    if (!setup) return;
    navigator.clipboard?.writeText(setup.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!status) {
    return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Two-Factor Authentication
      </div>
      <div className="p-4">
        {backupCodes ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-green-600" /> MFA enabled
            </div>
            <p className="text-sm text-muted-foreground">
              Save these backup codes somewhere safe — each works once if you lose access to your
              authenticator app. They won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
              {backupCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <button onClick={() => setBackupCodes(null)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground">
              Done
            </button>
          </div>
        ) : status.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-green-600" /> Enabled — {status.remainingBackupCodes} backup code(s) remaining
            </div>
            <form onSubmit={disable} className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="disable-mfa-token" className="text-xs font-medium text-muted-foreground">Enter a code to disable</label>
                <input
                  id="disable-mfa-token"
                  value={disableToken}
                  onChange={(e) => setDisableToken(e.target.value)}
                  placeholder="123456 or backup code"
                  className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" disabled={loading} className="flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-2 text-xs font-medium text-destructive disabled:opacity-50">
                <ShieldOff className="h-3 w-3" /> Disable MFA
              </button>
            </form>
          </div>
        ) : setup ? (
          <form onSubmit={confirmSetup} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scan this into your authenticator app (Google Authenticator, Authy, 1Password, etc.),
              or enter the secret manually, then confirm with a code to finish enabling MFA.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <code className="flex-1 break-all text-xs">{setup.secret}</code>
              <button type="button" onClick={copySecret} aria-label="Copy secret to clipboard" className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground break-all">{setup.otpauthUri}</p>
            <div>
              <label htmlFor="enable-mfa-token" className="text-xs font-medium text-muted-foreground">6-digit code</label>
              <input
                id="enable-mfa-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="000000"
                className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                Confirm &amp; enable
              </button>
              <button type="button" onClick={() => setSetup(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not enabled. Adding two-factor authentication requires a code from your phone in
              addition to your password when signing in.
            </p>
            <button onClick={beginSetup} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Set up MFA
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
