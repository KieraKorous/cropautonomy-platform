"use client";

import { useState } from "react";

import { getCaptureDownload } from "./download-action";

interface DownloadButtonProps {
  captureId: string;
  // "icon" = compact square (grid cards); "button" = labelled (detail views).
  variant?: "icon" | "button";
  label?: string;
  className?: string;
}

// Saves a capture's original media to disk. Resolves a fresh signed URL via the
// server action, then forces a download: it fetches the object and saves the
// blob (so the browser doesn't just navigate to/play it), falling back to a
// Supabase `?download=` link if a cross-origin fetch is blocked.
export function DownloadButton({
  captureId,
  variant = "icon",
  label = "Download",
  className = ""
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getCaptureDownload(captureId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      await saveUrl(res.url, res.filename);
    } catch {
      setError("Download failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = error ?? label;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={label}
        title={title}
        className={`flex-shrink-0 rounded-md p-1.5 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral disabled:opacity-50 ${
          error ? "text-error" : ""
        } ${className}`}
      >
        {busy ? <Spinner /> : <DownloadIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={error ?? undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-base-content/15 px-4 py-2.5 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.04] disabled:opacity-60 ${className}`}
    >
      {busy ? <Spinner /> : <DownloadIcon />}
      {error ? <span className="text-error">{error}</span> : busy ? "Saving…" : label}
    </button>
  );
}

// Force-save a remote file. Blob download keeps the chosen filename and stops
// the browser from opening media inline; if the fetch is cross-origin blocked,
// fall back to a tab navigation with Supabase's download disposition param.
async function saveUrl(url: string, filename: string) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    triggerAnchor(`${url}${sep}download=${encodeURIComponent(filename)}`, filename, true);
  }
}

function triggerAnchor(href: string, filename: string, newTab = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  if (newTab) a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function DownloadIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
