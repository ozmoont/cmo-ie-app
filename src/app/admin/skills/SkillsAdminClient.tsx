"use client";

/**
 * Client component for /admin/skills.
 *
 * Three jobs:
 *   1. List installed skills with current version + pending-learnings count
 *   2. Upload a new skill (or new version of an existing skill) via .zip
 *   3. Promote a skill from draft → active (or archive)
 */

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Upload, AlertCircle, CheckCircle2, FileText } from "lucide-react";

interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_eur_cents: number | null;
  status: string;
  current_version_id: string | null;
  current_version: {
    id: string;
    version_number: number;
    created_at: string;
  } | null;
  pending_learnings: number;
  total_versions: number;
  created_at: string;
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SkillsAdminClient() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const res = await fetch("/api/admin/skills", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setSkills(data.skills ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setUploadState({ kind: "error", message: "Pick a .zip file first." });
      return;
    }

    setUploadState({ kind: "uploading" });
    try {
      const res = await fetch("/api/admin/skills/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        skill?: { name: string; slug: string; version_number: number };
        extracted?: {
          skill_md_chars: number;
          reference_file_count: number;
          reference_file_names: string[];
        };
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setUploadState({
          kind: "error",
          message: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const refList = data.extracted?.reference_file_names?.length
        ? ` (+ ${data.extracted.reference_file_names.join(", ")})`
        : "";
      setUploadState({
        kind: "success",
        message: `${data.skill?.name} v${data.skill?.version_number} installed. ${data.extracted?.skill_md_chars ?? 0} chars of SKILL.md${refList}`,
      });
      // Reset the file input so a re-upload doesn't show the previous filename.
      if (fileInputRef.current) fileInputRef.current.value = "";
      refresh();
    } catch (err) {
      setUploadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  };

  const setStatus = async (skillId: string, status: string) => {
    const res = await fetch("/api/admin/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId, status }),
    });
    if (res.ok) refresh();
  };

  return (
    <>
      {/* ── Upload form ── */}
      <section className="mt-10 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Upload a skill .zip
        </h2>
        <p className="mt-1 text-sm text-text-secondary leading-relaxed">
          Expected format: a Claude Code plugin folder zipped at the root,
          containing <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">SKILL.md</code>{" "}
          (in the skills/ subdirectory) and an optional{" "}
          <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">plugin.json</code>{" "}
          metadata file.
        </p>

        <form onSubmit={handleUpload} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-[0.15em] font-semibold text-text-muted mb-2">
              Skill ZIP
            </label>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".zip,application/zip"
              required
              className="block w-full text-sm text-text-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-text-primary file:text-text-inverse hover:file:opacity-90"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.15em] font-semibold text-text-muted mb-2">
                Price (EUR cents) — first upload only
              </label>
              <input
                type="number"
                name="price_cents"
                placeholder="4900 (= €49)"
                min={0}
                max={1000000}
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-emerald-dark/30"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.15em] font-semibold text-text-muted mb-2">
                Changelog (optional)
              </label>
              <input
                type="text"
                name="changelog"
                placeholder="What's new in this version?"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-emerald-dark/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={uploadState.kind === "uploading"}
            className="inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-4 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploadState.kind === "uploading"
              ? "Uploading…"
              : "Upload skill"}
          </button>

          {uploadState.kind === "success" && (
            <p className="text-sm text-emerald-dark flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              {uploadState.message}
            </p>
          )}
          {uploadState.kind === "error" && (
            <p className="text-sm text-danger flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {uploadState.message}
            </p>
          )}
        </form>
      </section>

      {/* ── Skills list ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          Installed skills
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-text-muted">Loading…</p>
        ) : skills.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No skills installed yet. Upload your first .zip above.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {skills.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-border bg-surface p-5 flex items-start justify-between gap-4 flex-wrap"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <FileText className="h-5 w-5 text-text-muted mt-1 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-text-primary">
                        {s.name}
                      </h3>
                      <code className="text-xs px-2 py-0.5 rounded bg-surface-muted text-text-muted">
                        {s.slug}
                      </code>
                      <StatusBadge status={s.status} />
                    </div>
                    {s.description && (
                      <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                        {s.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-text-muted">
                      v{s.current_version?.version_number ?? "—"} · {s.total_versions}{" "}
                      version{s.total_versions === 1 ? "" : "s"} ·{" "}
                      {s.price_eur_cents
                        ? `€${(s.price_eur_cents / 100).toFixed(2)}`
                        : "no price set"}
                      {s.pending_learnings > 0 && (
                        <>
                          {" · "}
                          <Link
                            href={`/admin/skills/${s.slug}/learnings`}
                            className="text-emerald-dark font-medium hover:underline"
                          >
                            {s.pending_learnings} pending learning
                            {s.pending_learnings === 1 ? "" : "s"}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.status === "draft" && (
                    <button
                      onClick={() => setStatus(s.id, "active")}
                      className="text-xs font-medium px-3 py-1.5 rounded border border-emerald-dark text-emerald-dark hover:bg-emerald-dark hover:text-text-inverse transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  {s.status === "active" && (
                    <button
                      onClick={() => setStatus(s.id, "archived")}
                      className="text-xs font-medium px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-muted transition-colors"
                    >
                      Archive
                    </button>
                  )}
                  {s.status === "archived" && (
                    <button
                      onClick={() => setStatus(s.id, "active")}
                      className="text-xs font-medium px-3 py-1.5 rounded border border-emerald-dark text-emerald-dark hover:bg-emerald-dark hover:text-text-inverse transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-warning/10 text-warning",
    active: "bg-emerald-dark/10 text-emerald-dark",
    archived: "bg-text-muted/10 text-text-muted",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider ${
        styles[status] ?? "bg-surface-muted text-text-muted"
      }`}
    >
      {status}
    </span>
  );
}
