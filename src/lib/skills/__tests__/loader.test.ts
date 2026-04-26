import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseSkillZip, LoaderError } from "../loader";

/**
 * Build a synthetic skill .zip Buffer from a plain object describing
 * the file tree. Used by every test below — keeps fixtures inline so
 * what's expected is obvious from the assertion.
 */
async function buildZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("parseSkillZip", () => {
  it("parses a minimal SKILL.md-only zip", async () => {
    const buf = await buildZip({
      "skills/seo-auditor/SKILL.md": "# SEO Auditor\n\nContent here.",
    });
    const result = await parseSkillZip(buf);
    expect(result.skill_md).toContain("# SEO Auditor");
    expect(result.plugin_metadata).toBeNull();
    expect(result.suggested_name).toBe("SEO Auditor");
    expect(result.suggested_slug).toBe("seo-auditor");
  });

  it("uses plugin.json metadata when present", async () => {
    const buf = await buildZip({
      ".claude-plugin/plugin.json": JSON.stringify({
        name: "howl-seo-auditor",
        version: "1.2.3",
        description: "An advanced SEO audit framework.",
      }),
      "skills/seo-auditor/SKILL.md": "# Wrong-name title",
    });
    const result = await parseSkillZip(buf);
    expect(result.plugin_metadata?.name).toBe("howl-seo-auditor");
    expect(result.suggested_name).toBe("howl-seo-auditor");
    expect(result.suggested_slug).toBe("howl-seo-auditor");
    expect(result.source_version).toBe("1.2.3");
  });

  it("collects markdown reference files", async () => {
    const buf = await buildZip({
      "skills/seo-auditor/SKILL.md": "# Skill",
      "README.md": "# Readme content",
      "AGENT_SDK_INTEGRATION.md": "# Integration guide",
    });
    const result = await parseSkillZip(buf);
    expect(Object.keys(result.reference_files).sort()).toEqual([
      "AGENT_SDK_INTEGRATION.md",
      "README.md",
    ]);
    expect(result.reference_files["README.md"]).toContain("Readme content");
  });

  it("skips macOS junk and .DS_Store noise", async () => {
    const buf = await buildZip({
      "skills/seo-auditor/SKILL.md": "# Skill",
      "__MACOSX/.._DS_Store": "binary junk",
      ".DS_Store": "more junk",
      "skills/.DS_Store": "deep junk",
    });
    const result = await parseSkillZip(buf);
    // Only SKILL.md should land — the rest is junk and gets ignored.
    expect(Object.keys(result.reference_files)).toEqual([]);
  });

  it("rejects a zip with no SKILL.md", async () => {
    const buf = await buildZip({
      "README.md": "# Just a readme",
    });
    await expect(parseSkillZip(buf)).rejects.toThrow(LoaderError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/SKILL.md/);
  });

  it("rejects an empty buffer", async () => {
    await expect(parseSkillZip(Buffer.alloc(0))).rejects.toThrow(
      /empty/
    );
  });

  it("tolerates malformed plugin.json without failing", async () => {
    const buf = await buildZip({
      ".claude-plugin/plugin.json": "{ this is not valid JSON",
      "skills/seo-auditor/SKILL.md": "# Title",
    });
    const result = await parseSkillZip(buf);
    expect(result.plugin_metadata).toBeNull();
    // Falls back to first H1 in SKILL.md for naming.
    expect(result.suggested_name).toBe("Title");
  });

  it("rejects path-traversal attempts", async () => {
    const buf = await buildZip({
      "skills/seo-auditor/SKILL.md": "# Skill",
      "../escape.md": "tries to escape",
    });
    await expect(parseSkillZip(buf)).rejects.toThrow(/traversal/);
  });
});
