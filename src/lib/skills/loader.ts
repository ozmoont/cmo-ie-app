/**
 * Skill ZIP loader.
 *
 * Parses an uploaded Claude Code plugin / Anthropic Skills folder
 * `.zip` and extracts the parts we need to run the skill at audit
 * time:
 *
 *   - SKILL.md: the body Claude reads as a system prompt
 *   - plugin.json (optional): metadata block (name, version, etc.)
 *   - reference docs (optional): README.md, AGENT_SDK_INTEGRATION.md,
 *     anything else. Stored alongside SKILL.md so the run engine
 *     can include them as supporting context if the skill asks.
 *
 * The Howl SEO Auditor zip we received looks like:
 *   howl-seo-auditor/
 *     .claude-plugin/plugin.json
 *     skills/seo-auditor/SKILL.md
 *     README.md
 *     AGENT_SDK_INTEGRATION.md
 *
 * The loader doesn't care about exact paths — it walks the archive,
 * finds the FIRST SKILL.md it sees (skipping macOS junk), and
 * collects sibling .md / .json files as reference content.
 *
 * Bounds:
 *   - Total decompressed size capped at MAX_TOTAL_BYTES (5 MB) so a
 *     malicious upload can't blow up memory.
 *   - Per-file size capped at MAX_FILE_BYTES (1 MB).
 *   - Reference files truncated to MAX_REFERENCE_CHARS at the per-file
 *     level so even a huge SKILL.md doesn't bloat skill_versions row.
 */

import JSZip from "jszip";

export interface ParsedSkill {
  /** SKILL.md body. The text Claude sees as system prompt. */
  skill_md: string;
  /** plugin.json contents if present, else null. */
  plugin_metadata: Record<string, unknown> | null;
  /** Other supporting markdown / json files. { filename: content } */
  reference_files: Record<string, string>;
  /** Best-guess slug derived from plugin.json `name`, or filename stem. */
  suggested_slug: string;
  /** Best-guess display name from plugin.json `name` or first H1 in SKILL.md. */
  suggested_name: string;
  /** plugin.json `version` or the string "0.1.0". */
  source_version: string;
}

// ── Bounds ────────────────────────────────────────────────────────
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB decompressed budget
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB per file
const MAX_REFERENCE_CHARS = 50_000; // store at most this much per ref file
const ALLOWED_REFERENCE_EXTS = new Set([
  ".md",
  ".markdown",
  ".json",
  ".txt",
  ".yaml",
  ".yml",
]);
const SKILL_FILENAME = "SKILL.md";
const PLUGIN_FILENAME = "plugin.json";

/**
 * Parse a skill ZIP from a Buffer (uploaded multipart). Throws
 * `LoaderError` with a user-friendly message on any failure.
 */
export async function parseSkillZip(buffer: Buffer): Promise<ParsedSkill> {
  if (buffer.length === 0) throw new LoaderError("Uploaded file is empty");
  if (buffer.length > MAX_TOTAL_BYTES) {
    throw new LoaderError(
      `Upload is too large (${formatBytes(buffer.length)}). Max ${formatBytes(MAX_TOTAL_BYTES)}.`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new LoaderError(
      `Couldn't read ZIP: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  // Walk every file in the archive.
  // Skip macOS junk (__MACOSX/, .DS_Store) and anything outside the
  // allowed extension whitelist. We're paranoid about traversal: we
  // also reject any path containing `..` segments.
  let skillMd: string | null = null;
  let pluginJson: Record<string, unknown> | null = null;
  const referenceFiles: Record<string, string> = {};
  let totalDecompressed = 0;

  const entries = Object.entries(zip.files);
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) continue;
    if (path.endsWith(".DS_Store")) continue;
    if (path.split("/").some((seg) => seg === "..")) {
      throw new LoaderError("ZIP contains path traversal — rejected");
    }

    const basename = path.split("/").pop() ?? "";
    const ext = (basename.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();

    // Read the raw bytes once we're sure we want this file. Decompresses lazily.
    let content: string;
    try {
      const raw = await entry.async("nodebuffer");
      if (raw.length > MAX_FILE_BYTES) {
        throw new LoaderError(
          `${basename} is too large (${formatBytes(raw.length)} > ${formatBytes(MAX_FILE_BYTES)})`
        );
      }
      totalDecompressed += raw.length;
      if (totalDecompressed > MAX_TOTAL_BYTES) {
        throw new LoaderError(
          `Decompressed contents exceed ${formatBytes(MAX_TOTAL_BYTES)} budget`
        );
      }
      content = raw.toString("utf-8");
    } catch (err) {
      if (err instanceof LoaderError) throw err;
      throw new LoaderError(
        `Failed to read ${basename}: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }

    // Hit on the SKILL.md? Take the first one. Multi-skill plugins
    // would need expanded loader logic; for now we accept whichever
    // SKILL.md we find first, which matches the user's single-skill
    // upload shape.
    if (basename === SKILL_FILENAME && skillMd === null) {
      skillMd = content;
      continue;
    }

    // plugin.json — optional metadata. Tolerate parse errors (we
    // fall back to filename-derived slug/name).
    if (basename === PLUGIN_FILENAME && pluginJson === null) {
      try {
        pluginJson = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // Silent fallback. The user can still upload a zip with a
        // malformed plugin.json — we just won't get the metadata.
      }
      continue;
    }

    // Otherwise, if it's a markdown / text doc, save as reference.
    // Skip binary/code files; we only want documentation.
    if (ALLOWED_REFERENCE_EXTS.has(ext)) {
      const truncated =
        content.length > MAX_REFERENCE_CHARS
          ? content.slice(0, MAX_REFERENCE_CHARS) +
            `\n\n[truncated at ${MAX_REFERENCE_CHARS} chars]`
          : content;
      referenceFiles[basename] = truncated;
    }
  }

  if (!skillMd) {
    throw new LoaderError(
      `ZIP doesn't contain a ${SKILL_FILENAME} file. Make sure your skill folder includes a SKILL.md (typically in skills/<name>/SKILL.md).`
    );
  }

  // ── Derive metadata ────────────────────────────────────────────
  const pluginName = typeof pluginJson?.name === "string" ? pluginJson.name : null;
  const pluginVersion =
    typeof pluginJson?.version === "string" ? pluginJson.version : null;

  // Slug: prefer plugin.json `name`, fall back to first-h1, fall back to "skill".
  const firstH1 = skillMd.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const suggested_name = pluginName ?? firstH1 ?? "Untitled skill";
  const suggested_slug = slugify(pluginName ?? firstH1 ?? "skill");

  return {
    skill_md: skillMd,
    plugin_metadata: pluginJson,
    reference_files: referenceFiles,
    suggested_slug,
    suggested_name,
    source_version: pluginVersion ?? "0.1.0",
  };
}

// ── Helpers ───────────────────────────────────────────────────────

export class LoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoaderError";
  }
}

/** Mirrors lib/url-validation slug logic. Lowercase + dashes only. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "skill";
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
