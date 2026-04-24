"use client";

/**
 * Reusable "Export CSV" button.
 *
 * Accepts an already-built CSV string + a filename, and turns it into
 * a one-click download using a data URL. Using data URLs keeps the
 * implementation zero-server — the CSV is pre-rendered on the server
 * (from the same query helpers the page already ran), serialised
 * into the HTML, and handed to the button as a prop.
 *
 * Everything else is presentational — match the ghost-button pattern
 * used elsewhere in the dashboard.
 */

import { Download } from "lucide-react";
import { csvDataUrl } from "@/lib/csv";

interface CsvExportButtonProps {
  /** Pre-built CSV string. Empty string → button renders disabled. */
  csv: string;
  /** Filename WITHOUT extension — we append `.csv`. */
  filename: string;
  /** Optional label override. Default: "Export CSV". */
  label?: string;
}

export function CsvExportButton({
  csv,
  filename,
  label = "Export CSV",
}: CsvExportButtonProps) {
  if (!csv || csv.trim().length === 0) {
    return (
      <button
        disabled
        type="button"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted px-3 py-1.5 rounded-md border border-border cursor-not-allowed"
      >
        <Download className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <a
      href={csvDataUrl(csv)}
      download={`${filename}.csv`}
      className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-md border border-border hover:border-text-primary transition-colors"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
