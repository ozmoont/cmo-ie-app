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

import { useEffect, useRef, useState } from "react";
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
  RefreshCw,
  ArrowDown,
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
  const [regenerating, setRegenerating] = useState(false);
  const [autoExtracted, setAutoExtracted] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref on the first input so we can auto-focus + scroll into view
  // when extraction fails. The user lands on the page and we want the
  // cursor blinking in the first field they need to fill.
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const scrollToForm = () => {
    if (firstFieldRef.current) {
      firstFieldRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // Slight delay before focus — let scroll start, then focus the
      // input so the keyboard / caret appears in view.
      setTimeout(() => firstFieldRef.current?.focus(), 250);
    }
  };

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
        setExtractionFailed(Boolean(data.extraction_failed));
        setWebsiteUrl(data.website_url ?? null);
        setUpdatedAt(data.profile_updated_at ?? null);
        // When the profile was just auto-extracted OR extraction
        // failed outright, open the editor so the user is prompted to
        // review or fill in before generating anything.
        if (data.auto_extracted || data.extraction_failed) {
          setEditing(true);
          // Small delay so the form has rendered before we try to
          // scroll/focus its first field.
          setTimeout(() => scrollToForm(), 150);
        }
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

  /**
   * Force a fresh extraction from the brand's website, replacing
   * whatever's currently stored. The escape hatch for when a cached
   * profile is obviously wrong (e.g. Claude classified a digital agency
   * as a law firm because a case study mentioned legal-tech work).
   */
  const regenerate = async () => {
    if (
      !window.confirm(
        "Re-extract the brand profile from your website? This overwrites the current profile. You'll want to review the result before trusting downstream suggestions."
      )
    ) {
      return;
    }
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/profile/regenerate`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProfile(data.profile ?? profile);
      setUpdatedAt(data.profile_updated_at ?? null);
      setAutoExtracted(true); // force review mode
      setEditing(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extraction failed");
    } finally {
      setRegenerating(false);
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
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={regenerate}
              disabled={regenerating}
              title="Re-extract from website (overwrites current profile)"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Re-extract
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Edit2 className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        )}
      </div>

      {/* Extraction-failed warning (takes precedence over auto-extracted).
          The user has just landed on the page after onboarding and seen
          this card replace the auto-fill flow they expected. We owe them
          three things:
            1. Why the auto-fill didn't work (concrete reasons, not vague)
            2. What to do instead (4 fields, 2 minutes)
            3. A button that takes them straight to the form
          The form below is already opened in editing mode by the fetch
          effect, and we auto-scroll to it so the cursor is in the first
          input by the time they read this. */}
      {extractionFailed && !autoExtracted && (
        <div className="px-6 py-4 bg-danger/5 border-b border-danger/30 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
          <div className="text-xs text-text-primary leading-relaxed flex-1">
            <p className="font-semibold text-danger text-sm">
              We couldn&apos;t auto-fill from{" "}
              <span className="font-mono">{websiteUrl ?? "your site"}</span>
            </p>
            <p className="text-text-secondary mt-2">
              The most common reasons sites block our fetch:
            </p>
            <ul className="mt-1.5 ml-4 list-disc text-text-secondary space-y-0.5">
              <li>
                Cloudflare / Webflow / Framer bot protection blocked the
                request (most common — happens to ~40% of sites)
              </li>
              <li>
                The site renders content via JavaScript and has no
                server-side HTML for us to read
              </li>
              <li>
                The page returned an empty body or a placeholder/redirect
              </li>
            </ul>
            <p className="text-text-secondary mt-3">
              No problem — fill the four fields below. It takes ~2 minutes
              and only needs to be done once per project. Your project sits
              in a holding state until this is saved; afterwards everything
              (prompt suggestions, action plans, briefs) personalises off
              this profile.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={scrollToForm}
              className="mt-3"
            >
              <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
              Take me to the form
            </Button>
          </div>
        </div>
      )}

      {/* Auto-extraction review prompt */}
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
              placeholder="One sentence describing what your business does and who for…"
              helperText="Plain-English summary — what you'd say in an elevator pitch. Examples: 'Specialist energy consultancy helping Irish SMEs cut energy costs.' / 'Dublin-based digital agency for mid-market companies.' / 'Boutique law firm specialising in commercial property in Cork.'"
              inputRef={firstFieldRef}
            />
            <Field
              label="Market segment"
              value={profile.market_segment}
              onChange={(v) => updateField("market_segment", v)}
              placeholder="Industry + positioning"
              helperText="Your sector + tier you operate in. Examples: 'Energy consultancy for commercial sector', 'Digital transformation for mid-market', 'Boutique commercial law', 'Independent food & drink retailer'."
            />
            <Field
              label="Brand identity / positioning"
              value={profile.brand_identity}
              onChange={(v) => updateField("brand_identity", v)}
              placeholder="Tone + credibility cues"
              helperText="How customers describe you, or how you'd want to be described. Examples: 'Trusted, results-driven, 20+ years in the Irish market', 'Challenger agency with senior-level experience', 'Family-run, locally rooted, premium quality'."
            />
            <Field
              label="Target audience"
              value={profile.target_audience}
              onChange={(v) => updateField("target_audience", v)}
              placeholder="Who buys"
              helperText="The people or businesses who actually buy from you. Examples: 'Facilities managers at mid-sized Irish manufacturers', 'Marketing directors at Dublin SaaS scale-ups (50–500 staff)', 'Homeowners aged 35–55 in Munster'."
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
  helperText,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Short example/guidance line under the input. Industry-agnostic. */
  helperText?: string;
  /** Ref forwarded to the underlying input. Used for auto-focus. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-[0.12em] font-semibold text-text-muted">
        {label}
      </Label>
      <Input
        ref={inputRef}
        className="mt-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {helperText && (
        <p className="mt-1.5 text-xs text-text-muted leading-relaxed">
          {helperText}
        </p>
      )}
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
