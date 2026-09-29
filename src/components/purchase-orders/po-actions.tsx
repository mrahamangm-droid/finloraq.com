"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type POStatus = "DRAFT" | "SENT" | "ACKNOWLEDGED" | "RECEIVED" | "BILLED" | "CANCELLED";

interface POActionsProps {
  po: { id: string; status: POStatus; billId: string | null };
  canEdit: boolean;
  canDelete: boolean;
}

export function POActions({ po, canEdit, canDelete }: POActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = (
    [
      { label: "Mark as Sent", value: "SENT" as POStatus },
      { label: "Mark as Acknowledged", value: "ACKNOWLEDGED" as POStatus },
      { label: "Mark as Received", value: "RECEIVED" as POStatus },
      { label: "Cancel PO", value: "CANCELLED" as POStatus },
    ] satisfies { label: string; value: POStatus }[]
  ).filter((o) => o.value !== po.status && po.status !== "BILLED" && po.status !== "CANCELLED");

  async function setStatus(status: POStatus) {
    setOpen(false);
    setLoading(true);
    const res = await fetch(`/api/purchase-orders/${po.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to update status.");
      return;
    }
    router.refresh();
  }

  async function convertToBill() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/purchase-orders/${po.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Conversion failed.");
      return;
    }
    const { bill } = await res.json();
    router.push(`/purchases/${bill.id}`);
  }

  async function deletePO() {
    if (!confirm("Delete this draft purchase order?")) return;
    setLoading(true);
    const res = await fetch(`/api/purchase-orders/${po.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Delete failed.");
      return;
    }
    router.push("/purchase-orders");
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Convert to bill — shown when received */}
      {canEdit && po.status === "RECEIVED" && !po.billId && (
        <>
          {convertOpen ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Bill Due:</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              <button onClick={convertToBill} disabled={loading}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {loading ? "Converting…" : "Create Bill"}
              </button>
              <button onClick={() => setConvertOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConvertOpen(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              Convert to Bill
            </button>
          )}
        </>
      )}

      {/* Status dropdown */}
      {canEdit && statusOptions.length > 0 && (
        <div className="relative">
          <button onClick={() => setOpen((o) => !o)} disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50">
            Update Status <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-md border border-border bg-popover shadow-md py-1">
              {statusOptions.map((o) => (
                <button key={o.value} onClick={() => setStatus(o.value)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted">
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete — draft only */}
      {canDelete && po.status === "DRAFT" && (
        <button onClick={deletePO} disabled={loading}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">
          Delete
        </button>
      )}
    </div>
  );
}
