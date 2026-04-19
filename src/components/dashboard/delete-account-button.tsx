"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Mode = "idle" | "confirming";

export function DeleteAccountButton() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (mode === "idle") {
      setMode("confirming");
      setError(null);
      return;
    }

    // Confirming → actually delete.
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account.");
      }

      router.push("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      setError(message);
      setMode("idle");
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setMode("idle");
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        {mode === "confirming" && (
          <Button variant="ghost" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button
          variant="danger"
          onClick={handleClick}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {mode === "idle" ? "Delete account" : "Confirm deletion"}
        </Button>
      </div>

      {mode === "confirming" && !error && (
        <p className="text-xs text-text-secondary max-w-xs text-right">
          Tap <span className="text-text-primary font-medium">Confirm deletion</span>{" "}
          to permanently remove your account and all data.
        </p>
      )}

      {error && <p className="text-xs text-danger max-w-xs text-right">{error}</p>}
    </div>
  );
}
