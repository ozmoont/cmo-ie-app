"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check } from "lucide-react";

interface SettingsFormProps {
  userId: string;
  currentFullName: string;
  currentOrgName: string;
}

export function SettingsForm({
  userId,
  currentFullName,
  currentOrgName,
}: SettingsFormProps) {
  const [fullName, setFullName] = useState(currentFullName);
  const [orgName, setOrgName] = useState(currentOrgName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          org_name: orgName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update settings");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={userId}
          disabled
          className="opacity-60 cursor-not-allowed"
        />
        <p className="text-xs text-text-muted">
          Your email address cannot be changed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="orgName">Organisation name</Label>
        <Input
          id="orgName"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Enter your organisation name"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 border-l-2 border-danger pl-3 py-1">
          <AlertCircle className="h-4 w-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {success && (
        <div
          aria-live="polite"
          className="flex items-start gap-2 border-l-2 border-emerald-dark pl-3 py-1"
        >
          <Check className="h-4 w-4 text-emerald-dark flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-dark">Settings saved.</p>
        </div>
      )}

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
