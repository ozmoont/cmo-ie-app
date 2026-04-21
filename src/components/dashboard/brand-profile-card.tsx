"use client";

/**
 * Brand profile card — the "we think you are this" surface the user
 * sees before generating prompt suggestions.
 *
 * Why this exists: the suggestion engine uses the stored brand profile
 * as authoritative context. If Claude's initial extraction got the
 * industry wrong ("howl.ie = music festivals" because the site was
 * JS-heavy), the user MUST be able to see and correct it — otherwise
 * every downstream suggestion is off-industry.
 *
 * Behaviour:
 *   - Auto-loads the profile on mount via GET /profile.
 *   - Shows an editable inline form with each field.
 *   - Saves via PUT /profile and emits an onSaved callback so the
 *     parent can re-trigger suggestion generation.
 *   - If auto_extracted=true comes back from GET, shows a banner
 *     nudging the user to review before trusting the suggestions.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Check,
  AlertTriangle,
  Edit2,
  Plus,
  X,
} from "lucide-react";

interface ProductService {
  name: string;
  description: string;
}

interface BrandProfile {
  short_description: string;
  market_segment: string;
  brand_identity: string;
  target_audience: string;
  products_services: ProductService[];
}

interface BrandProfileCardProps {
  projectId: string;
  /** Fires after a successful save so callers can re-generate dependent suggestions. */
  onSaved?: () => void;
}

const EMPTY_PROFILE: BrandProfile = {
  short_description: "",
  market_segment: "",
  brand_identity: "",
  target_audience: "",
  products_services: [],
};

export function BrandProfileCard({ projectId, onSaved }: BrandProfileCardProps) {
  const [profile, setProfile] = useState<BrandProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoExtracted, setAutoExtracted] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/profile`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setProfile(data.profile ?? EMPTY_PROFILE);
        setAutoExtracted(Boolean(data.auto_extracted));
        setUpdatedAt(data.profile_updated_at ?? null);
        // When the profile was just auto-extracted, open the editor so
        // the user is prompted to review before they generate anything.
        if (data.auto_extracted) setEditing(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfile(data.profile ?? profile);
      setUpdatedAt(data.profile_updated_at ?? null);
      setAutoExtracted(false);
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof BrandProfile>(
    k: K,
    v: BrandProfile[K]
  ) => setProfile((p) => ({ ...p, [k]: v }));

  const updateProduct = (i: number, patch: Partial<ProductService>) =>
    setProfile((p) => ({
      ...p,
      products_services: p.products_services.map((ps, idx) =>
        idx === i ? { ...ps, ...patch } : ps
      ),
    }));

  const addProduct = () =>
    setProfile((p) => ({
      ...p,
      products_services: [...p.products_services, { name: "", description: "" }],
    }));

  const removeProduct = (i: number) =>
    setProfile((p) => ({
      ...p,
      products_services: p.products_services.filter((_, idx) => idx !== i),
    }));

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-6 flex items-center gap-3 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading brand profile…
      </div>
    );
  }

  const hasData = profile.short_description.trim().length > 0;

  return (
    <section className="border border-border rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Brand profile
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Used as authoritative context for prompt suggestions, actions, and
            competitor detection. If this looks wrong, fix it here — every
            generated prompt gets better.
          </p>
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="shrink-0"
          >
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Auto-extraction warning */}
      {autoExtracted && (
        <div className="px-6 py-3 bg-warning/5 border-b border-warning/30 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-text-primary leading-relaxed">
            <p className="font-semibold text-warning">
              We just auto-extracted this from your site. Please review before
              generating prompts.
            </p>
            <p className="text-text-secondary mt-1">
              If the market segment or target audience is wrong, all generated
              prompt suggestions will be off-industry. Edit now — this is a
              one-time review.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-6 py-3 border-b border-danger/30 bg-danger/5 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="p-6 space-y-5">
        {editing ? (
          <>
            <Field
              label="What the brand does (1–2 sentences)"
              value={profile.short_description}
              onChange={(v) => updateField("short_description", v)}
              placeholder="Dublin-based digital and AI transformation agency helping mid-sized Irish companies…"
            />
            <Field
              label="Market segment"
              value={profile.market_segment}
              onChange={(v) => updateField("market_segment", v)}
              placeholder="Digital / AI transformation consulting for Irish mid-market"
            />
            <Field
              label="Brand identity / positioning"
              value={profile.brand_identity}
              onChange={(v) => updateField("brand_identity", v)}
              placeholder="Challenger agency with C-level operational experience"
            />
            <Field
              label="Target audience"
              value={profile.target_audience}
              onChange={(v) => updateField("target_audience", v)}
              placeholder="Scale-ups and mid-sized Irish companies (50–500 staff)"
            />

            <div>
              <Label className="text-xs uppercase tracking-[0.12em] font-semibold text-text-muted">
                Products / services
              </Label>
              <div className="mt-3 space-y-3">
                {profile.products_services.length === 0 && (
                  <p className="text-xs text-text-muted">
                    Add your main offerings — each one becomes a bias signal
                    for better prompt suggestions.
                  </p>
                )}
                {profile.products_services.map((ps, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 border border-border rounded p-3"
                  >
                    <div className="flex-1 space-y-2">
                      <Input
                        value={ps.name}
                        onChange={(e) =>
                          updateProduct(i, { name: e.target.value })
                        }
                        placeholder="Product / service name"
                        className="text-sm"
                      />
                      <Input
                        value={ps.description}
                        onChange={(e) =>
                          updateProduct(i, { description: e.target.value })
                        }
                        placeholder="One-line description"
                        className="text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProduct(i)}
                      className="text-text-muted hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addProduct}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add product / service
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save profile
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            {hasData ? (
              <dl className="space-y-3 text-sm">
                <Row label="What they do" value={profile.short_description} />
                <Row label="Market segment" value={profile.market_segment} />
                <Row label="Brand identity" value={profile.brand_identity} />
                <Row label="Target audience" value={profile.target_audience} />
                {profile.products_services.length > 0 && (
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] font-semibold text-text-muted">
                      Products / services
                    </dt>
                    <dd className="mt-1 space-y-1">
                      {profile.products_services.map((ps, i) => (
                        <p key={i} className="text-text-primary">
                          <span className="font-semibold">{ps.name}</span>
                          {ps.description && (
                            <span className="text-text-secondary">
                              {" "}
                              — {ps.description}
                            </span>
                          )}
                        </p>
                      ))}
                    </dd>
                  </div>
                )}
                {updatedAt && (
                  <p className="pt-2 text-xs text-text-muted border-t border-border">
                    Last updated{" "}
                    {new Date(updatedAt).toLocaleDateString("en-IE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </dl>
            ) : (
              <div className="text-sm text-text-secondary">
                No profile saved yet. Click{" "}
                <button
                  onClick={() => setEditing(true)}
                  className="underline text-text-primary"
                >
                  Edit
                </button>{" "}
                to describe the brand — this is required before prompt
                suggestions will be accurate.
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-[0.12em] font-semibold text-text-muted">
        {label}
      </Label>
      <Input
        className="mt-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] font-semibold text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-text-primary leading-relaxed">{value}</dd>
    </div>
  );
}
