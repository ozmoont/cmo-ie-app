"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";

interface PolishRequestFormProps {
  projectId: string;
  brief: string;
  draft: string | null;
  actionTitle: string;
  userEmail: string;
  onSuccess: () => void;
}

export function PolishRequestForm({
  projectId,
  brief,
  draft,
  actionTitle,
  userEmail,
  onSuccess,
}: PolishRequestFormProps) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/actions/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          draft,
          actionTitle,
          contactEmail: userEmail,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-start gap-4 py-6">
        <Check className="h-6 w-6 text-emerald-dark" />
        <div className="space-y-1">
          <p className="text-lg font-semibold text-text-primary tracking-tight">
            Polish request sent.
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            The Howl.ie team will be in touch within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="polish-email">Your email</Label>
        <Input
          id="polish-email"
          type="email"
          value={userEmail}
          disabled
          className="opacity-60 cursor-not-allowed"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="polish-notes">Additional notes</Label>
        <textarea
          id="polish-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any specific requirements or preferences?"
          rows={4}
          className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus:outline-none focus:ring-2 focus:ring-emerald focus:border-emerald disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
      </div>

      {error && (
        <p className="text-sm text-danger border-l-2 border-danger pl-3 py-0.5">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Sending…
          </>
        ) : (
          "Send to Howl.ie team"
        )}
      </Button>
    </form>
  );
}
