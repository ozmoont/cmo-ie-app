"use client";

/**
 * "Download PDF" button.
 *
 * Calls window.print(). The browser's native "Save as PDF" dialog
 * handles the actual file creation — on every major browser that's a
 * built-in destination, so we don't need Puppeteer / Chromium in the
 * deployment to ship a usable PDF export.
 *
 * The print stylesheet in globals.css turns the report page into a
 * single-column print-friendly layout; we hide this button itself on
 * paper via the `no-print` class.
 *
 * Upgrade path: when we need emailable / auto-generated PDFs (for the
 * monthly playbook in W22), swap this for a server-side generator.
 * This component stays; it just stops being the only path.
 */

import { Download } from "lucide-react";

interface PrintButtonProps {
  label?: string;
  className?: string;
}

export function PrintButton({
  label = "Download PDF",
  className,
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-4 py-2.5 hover:opacity-90 transition-opacity ${className ?? ""}`}
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}
