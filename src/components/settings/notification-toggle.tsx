"use client";

/**
 * Inline toggle for a single notification preference. Posts to
 * /api/settings/notifications on change; optimistic-updates the UI
 * and rolls back on error.
 *
 * Stateless wrapper around a styled checkbox — no animation library.
 * Sized to sit in a single row of the Settings → Notifications
 * section.
 */

import { useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface Props {
  /** The preference key the API understands. v1: 'notify_on_scan'. */
  field: "notify_on_scan";
  /** Current persisted value. */
  initial: boolean;
  /** Short label users see next to the toggle. */
  label: string;
  /** One-line description below the label. Optional. */
  description?: string;
}

export function NotificationToggle({
  field,
  initial,
  label,
  description,
}: Props) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const onToggle = async () => {
    if (saving) return;
    const next = !value;
    setValue(next); // optimistic
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      // Roll back the optimistic update.
      setValue(!next);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            {description}
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-danger flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {saving && (
          <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
        )}
        {justSaved && !saving && (
          <Check className="h-3 w-3 text-emerald-dark" />
        )}
        <button
          type="button"
          role="switch"
          aria-checked={value}
          onClick={onToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 ${
            value ? "bg-emerald-dark" : "bg-text-muted/30"
          } disabled:opacity-50`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
