"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, FileDown, FileSpreadsheet, Share2, Mail, MessageCircle, Link2, Check } from "lucide-react";

// Print / download / share toolbar shown on every report page.
// - Print and "Save as PDF" both use the browser print dialog (print CSS in
//   globals.css hides the app chrome so only the report is printed).
// - CSV is built from the report tables currently on screen.
// - Email / WhatsApp share a link to this report. The link opens the live
//   report, so the recipient needs a Finloraq login with access to the company;
//   to send the actual numbers, use Save as PDF or CSV and attach the file.

function csvCell(v: string) {
  const s = v.replace(/\s+/g, " ").trim();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function tablesToCsv(root: HTMLElement): string {
  const lines: string[] = [];
  root.querySelectorAll("table").forEach((table, i) => {
    if (i > 0) lines.push("");
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children).map((c) => csvCell((c as HTMLElement).innerText ?? c.textContent ?? ""));
      if (cells.some((c) => c !== "")) lines.push(cells.join(","));
    });
  });
  return lines.join("\r\n");
}

export function ReportActions({ title, company }: { title: string; company?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const fullTitle = company ? `${company} — ${title}` : title;
  const message = () => `${fullTitle}\n${window.location.href}`;

  function print() {
    const prev = document.title;
    document.title = fullTitle.replace(/[\\/:*?"<>|]/g, "-");
    window.print();
    document.title = prev;
  }

  function downloadCsv() {
    const root = document.getElementById("report-content");
    const csv = root ? tablesToCsv(root) : "";
    if (!csv) {
      setNotice("This report has no table data to export.");
      return;
    }
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fullTitle.replace(/[^\w]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Couldn't copy — copy the address bar link instead.");
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: fullTitle, text: fullTitle, url: window.location.href });
      } catch {
        /* user cancelled */
      }
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted";
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted";

  return (
    <div className="no-print flex flex-wrap items-center gap-2" role="toolbar" aria-label="Report actions">
      <button type="button" className={btn} onClick={print}>
        <Printer className="h-4 w-4" /> Print
      </button>
      <button type="button" className={btn} onClick={print} title="Choose “Save as PDF” as the destination">
        <FileDown className="h-4 w-4" /> Save as PDF
      </button>
      <button type="button" className={btn} onClick={downloadCsv}>
        <FileSpreadsheet className="h-4 w-4" /> CSV
      </button>

      <div className="relative" ref={ref}>
        <button type="button" className={btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Share2 className="h-4 w-4" /> Share
        </button>
        {open && (
          <div role="menu" className="absolute left-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-border bg-card shadow-lg">
            <a
              role="menuitem"
              className={item}
              href={`mailto:?subject=${encodeURIComponent(fullTitle)}&body=${encodeURIComponent(typeof window !== "undefined" ? message() : "")}`}
              onClick={(e) => {
                e.currentTarget.href = `mailto:?subject=${encodeURIComponent(fullTitle)}&body=${encodeURIComponent(message())}`;
              }}
            >
              <Mail className="h-4 w-4" /> Email
            </a>
            <a
              role="menuitem"
              className={item}
              target="_blank"
              rel="noopener noreferrer"
              href="https://wa.me/"
              onClick={(e) => {
                e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(message())}`;
              }}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <button type="button" role="menuitem" className={item} onClick={copyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? "Link copied" : "Copy link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" role="menuitem" className={item} onClick={nativeShare}>
                <Share2 className="h-4 w-4" /> More…
              </button>
            )}
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Links need a Finloraq login. To send the numbers themselves, use Save as PDF or CSV and attach the file.
            </p>
          </div>
        )}
      </div>
      {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
    </div>
  );
}
