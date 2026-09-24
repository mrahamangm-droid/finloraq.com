"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

type BrandingFields = {
  logoUrl: string | null;
  tagline: string | null;
  brandEmail: string | null;
  brandPhone: string | null;
  brandAddress: string | null;
};

/**
 * Resizes an image client-side before it's turned into the data: URL we
 * store (see src/lib/branding.ts) — a phone photo can be 5-10MB straight
 * off the camera, well past what a profile photo or logo needs, so this
 * downscales to `maxDimension` on the longest side before upload. PNGs
 * keep their format (a logo often needs real transparency); everything
 * else is re-encoded as JPEG, which shrinks a phone photo dramatically.
 * If canvas isn't available for some reason, the original data URL is
 * still returned and validated (and size-capped) server-side.
 */
async function fileToResizedDataUrl(file: File, maxDimension: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = dataUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(img, 0, 0, width, height);
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(outputType, 0.85);
  } catch {
    return dataUrl;
  }
}

function ImageUploader({
  label,
  hint,
  value,
  onChange,
  disabled,
  shape = "square",
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  shape?: "square" | "round";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;
    setBusy(true);
    try {
      const resized = await fileToResizedDataUrl(file, 512);
      onChange(resized);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted text-muted-foreground ${
          shape === "round" ? "rounded-full" : "rounded-lg"
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || busy}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {busy ? "Processing…" : value ? "Change" : "Upload"}
          </button>
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFileChange}
        disabled={disabled}
      />
    </div>
  );
}

export function BrandingPanel({
  initialAvatarUrl,
  initial,
  canEditBranding,
}: {
  initialAvatarUrl: string | null;
  initial: BrandingFields;
  canEditBranding: boolean;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarSaved, setAvatarSaved] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [fields, setFields] = useState<BrandingFields>(initial);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [brandSaved, setBrandSaved] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  async function saveAvatar(next: string | null) {
    setAvatarUrl(next);
    setAvatarError(null);
    setAvatarSaved(null);
    setSavingAvatar(true);
    try {
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAvatarError(data.error ?? "Could not save your photo.");
        return;
      }
      setAvatarSaved(next ? "Photo updated." : "Photo removed.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setBrandError(null);
    setBrandSaved(false);
    setSavingBrand(true);
    try {
      const res = await fetch("/api/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBrandError(data.error ?? "Could not save branding.");
        return;
      }
      const data = await res.json();
      setFields(data);
      setBrandSaved(true);
    } finally {
      setSavingBrand(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Profile &amp; Branding
      </div>
      <div className="space-y-6 p-4">
        <p className="text-xs text-muted-foreground">
          Available on every plan. Your logo and business details appear on invoices and other
          customer-facing documents.
        </p>

        <ImageUploader
          label="Your profile photo"
          hint="Shown next to your name in the app. Just for you — anyone can set their own."
          value={avatarUrl}
          onChange={saveAvatar}
          shape="round"
        />
        {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
        {!avatarError && avatarSaved && !savingAvatar && <p className="text-xs text-success">{avatarSaved}</p>}

        <div className="border-t border-border pt-6">
          {!canEditBranding ? (
            <p className="text-xs text-muted-foreground">
              Your role doesn&apos;t have permission to edit business branding.
            </p>
          ) : (
            <form onSubmit={saveBranding} className="space-y-4">
              <ImageUploader
                label="Business logo"
                hint="Used on invoices, quotations, receipts and statements."
                value={fields.logoUrl}
                onChange={(v) => setFields({ ...fields, logoUrl: v })}
              />

              <div>
                <label className="text-xs font-medium text-muted-foreground">Tagline</label>
                <input
                  value={fields.tagline ?? ""}
                  onChange={(e) => setFields({ ...fields, tagline: e.target.value })}
                  maxLength={140}
                  placeholder="e.g. Smarter finance, simplified."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact email</label>
                  <input
                    type="email"
                    value={fields.brandEmail ?? ""}
                    onChange={(e) => setFields({ ...fields, brandEmail: e.target.value })}
                    placeholder="billing@yourcompany.com"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact phone</label>
                  <input
                    value={fields.brandPhone ?? ""}
                    onChange={(e) => setFields({ ...fields, brandPhone: e.target.value })}
                    maxLength={40}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Business address</label>
                <textarea
                  value={fields.brandAddress ?? ""}
                  onChange={(e) => setFields({ ...fields, brandAddress: e.target.value })}
                  maxLength={300}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {brandError && <p className="text-xs text-destructive">{brandError}</p>}
              {brandSaved && !savingBrand && <p className="text-xs text-success">Branding saved.</p>}

              <button
                type="submit"
                disabled={savingBrand}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingBrand ? "Saving…" : "Save branding"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
