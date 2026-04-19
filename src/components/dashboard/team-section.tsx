"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";

interface TeamMember {
  id: string;
  fullName: string | null;
  email: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export function TeamSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Error fetching team members:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInviting(true);

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite member.");
      }

      setSuccess(`Invitation sent to ${email}.`);
      setEmail("");
      setRole("member");
      await fetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      setError(message);
    } finally {
      setInviting(false);
    }
  };

  // Tone per role - uses the token colours we've defined, not off-palette hex.
  const roleTone = (r: string) => {
    switch (r) {
      case "owner":
        return "border-emerald-dark/40 text-emerald-dark";
      case "admin":
        return "border-info/40 text-info";
      default:
        return "border-border text-text-secondary";
    }
  };

  return (
    <div className="space-y-10">
      {/* ── Invite ── */}
      <form onSubmit={handleInvite} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={inviting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "member")
              }
              disabled={inviting}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger border-l-2 border-danger pl-3 py-0.5">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-dark border-l-2 border-emerald-dark pl-3 py-0.5">
            {success}
          </p>
        )}

        <Button type="submit" disabled={inviting || !email}>
          {inviting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" />
          )}
          Send invitation
        </Button>
      </form>

      {/* ── Members list ── */}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Members · {members.length}
        </p>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-text-secondary py-4">
            No team members yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border stagger-children">
            {members.map((member) => {
              const displayName = member.fullName || member.email;
              const initial = displayName.charAt(0).toUpperCase();
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover text-text-secondary font-mono text-sm font-semibold shrink-0"
                    >
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {displayName}
                      </p>
                      {member.fullName && (
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {member.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em] ${roleTone(
                      member.role
                    )}`}
                  >
                    {member.role}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
