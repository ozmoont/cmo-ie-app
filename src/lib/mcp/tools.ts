/**
 * MCP tool catalogue + executors.
 *
 * Every tool is a thin wrapper over an existing lib/queries/* helper.
 * The MCP server dispatches `tools/call` here based on the tool name,
 * passes the pre-authorised org_id as an implicit scope, and returns
 * the result as a text block containing JSON.
 *
 * Design rules:
 *
 *   1. Tools never accept `org_id` as a parameter — it's resolved
 *      server-side from the bearer token. Model context can't override
 *      it. (Defence-in-depth against prompt injection asking Claude to
 *      impersonate another tenant.)
 *   2. Every project_id is re-checked against the caller's org before
 *      we run the underlying query. Same reasoning.
 *   3. Descriptions are written for Claude, not for a human docs
 *      reader — they should tell the model when to use the tool.
 *   4. Tool outputs are JSON strings inside a text content block.
 *      MCP clients unwrap the content; we keep the JSON shape close
 *      to the REST v1 response so both surfaces match.
 */

import type { ApiScope } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getProjectSourceDomains,
  getProjectSourceUrls,
} from "@/lib/queries/sources";
import { getDomainGaps, getUrlGaps } from "@/lib/queries/gap-analysis";
import { getPromptDetail } from "@/lib/queries/prompt-detail";
import { computeShareOfVoice } from "@/lib/format";
import type {
  ToolCallResult,
  ToolDefinition,
} from "@/lib/mcp/types";

interface ToolContext {
  orgId: string;
  scopes: readonly ApiScope[];
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<ToolCallResult>;

interface Tool {
  definition: ToolDefinition;
  requires: ApiScope;
  handle: ToolHandler;
}

// ── Helper: assert the caller's org owns the project ─────────────

async function assertProjectAccess(
  orgId: string,
  projectId: string
): Promise<{ brand_name: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select("org_id, brand_name")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string; brand_name: string }>();
  if (!data || data.org_id !== orgId) return null;
  return { brand_name: data.brand_name };
}

function textResult(value: unknown): ToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function textError(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function getString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function getNumber(
  args: Record<string, unknown>,
  key: string
): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ── Tool implementations ────────────────────────────────────────

const listProjects: Tool = {
  requires: "visibility.read",
  definition: {
    name: "list_projects",
    description:
      "List every project the user is tracking. Use this first when the user hasn't named a specific project — the other tools require a project_id.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  handle: async (_args, ctx) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select(
        "id, name, brand_name, website_url, country_codes, models, created_at"
      )
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });
    if (error) return textError(`Failed to list projects: ${error.message}`);
    return textResult({ projects: data ?? [] });
  },
};

const getVisibility: Tool = {
  requires: "visibility.read",
  definition: {
    name: "get_visibility",
    description:
      "Headline visibility metrics for a project over an optional window. Returns visibility percent, share of voice, average position, sentiment distribution, and totals. Use this when the user asks 'how is my AI visibility?' or compares time periods.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The project's UUID. Call list_projects first if unknown.",
        },
        window_days: {
          type: "integer",
          description: "Window size in days. Default 30.",
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  handle: async (args, ctx) => {
    const projectId = getString(args, "project_id");
    if (!projectId) return textError("project_id is required");
    const project = await assertProjectAccess(ctx.orgId, projectId);
    if (!project) return textError("Project not found in this organisation");

    const days = getNumber(args, "window_days") ?? 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const to = new Date();

    const admin = createAdminClient();
    const { data: results, error } = await admin
      .from("results")
      .select(
        "id, brand_mentioned, mention_position, sentiment, prompts!inner(project_id)"
      )
      .eq("prompts.project_id", projectId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());
    if (error) return textError(`results lookup failed: ${error.message}`);

    const resultIds = (results ?? []).map((r) => r.id as string);
    let trackedMentions = 0;
    let totalMentions = 0;
    if (resultIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < resultIds.length; i += CHUNK) {
        const slice = resultIds.slice(i, i + CHUNK);
        const { data: mentions } = await admin
          .from("result_brand_mentions")
          .select("is_tracked_brand")
          .in("result_id", slice);
        for (const m of mentions ?? []) {
          totalMentions += 1;
          if (m.is_tracked_brand) trackedMentions += 1;
        }
      }
    }

    const total = results?.length ?? 0;
    const mentioned = results?.filter((r) => r.brand_mentioned).length ?? 0;
    const visibility = total > 0 ? Math.round((mentioned / total) * 100) : 0;
    const positions = (results ?? [])
      .map((r) => r.mention_position as number | null)
      .filter((p): p is number => typeof p === "number" && p > 0);
    const avgPosition =
      positions.length > 0
        ? Number(
            (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(2)
          )
        : null;

    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    for (const r of results ?? []) {
      const s = r.sentiment as keyof typeof sentiment | null;
      if (s && s in sentiment) sentiment[s] += 1;
    }

    return textResult({
      brand: project.brand_name,
      window: { from: from.toISOString(), to: to.toISOString(), days },
      visibility_pct: visibility,
      share_of_voice_pct: computeShareOfVoice(trackedMentions, totalMentions),
      avg_position: avgPosition,
      sentiment_distribution: sentiment,
      totals: {
        results: total,
        results_with_brand_mentioned: mentioned,
        tracked_brand_mentions: trackedMentions,
        total_brand_mentions: totalMentions,
      },
    });
  },
};

const listGaps: Tool = {
  requires: "gaps.read",
  definition: {
    name: "list_gaps",
    description:
      "Ranked list of sources where competitors appear and the tracked brand doesn't. Each row has a Gap Score and a source-type-specific playbook (pitch editor / community reply / directory submission / etc). Use this when the user asks 'where should I act?' or 'where am I missing?'.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        scope: {
          type: "string",
          enum: ["domains", "urls"] as const,
          description:
            "'domains' for domain-level gaps (aggregated, fewer rows). 'urls' for URL-level (more specific, actionable). Default 'domains'.",
        },
        limit: {
          type: "integer",
          description: "Max rows to return. Default 20, max 100.",
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  handle: async (args, ctx) => {
    const projectId = getString(args, "project_id");
    if (!projectId) return textError("project_id is required");
    const project = await assertProjectAccess(ctx.orgId, projectId);
    if (!project) return textError("Project not found in this organisation");

    const scope = getString(args, "scope") === "urls" ? "urls" : "domains";
    const limit = Math.min(getNumber(args, "limit") ?? 20, 100);

    const admin = createAdminClient();
    try {
      if (scope === "urls") {
        const result = await getUrlGaps(admin, projectId, { limit });
        return textResult({ scope, ...result });
      }
      const result = await getDomainGaps(admin, projectId, { limit });
      return textResult({ scope, ...result });
    } catch (err) {
      return textError(
        `Failed to compute gaps: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

const listSources: Tool = {
  requires: "sources.read",
  definition: {
    name: "list_sources",
    description:
      "Domains or URLs the AI models cite when answering this project's tracked prompts. Use when the user asks 'where is AI finding me?' or 'what publications drive my visibility?'. Rows include source type (Editorial / Corporate / UGC / Reference / Social) and retrieval/citation rates.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        scope: {
          type: "string",
          enum: ["domains", "urls"] as const,
          description: "'domains' (default) or 'urls' for URL-level detail.",
        },
        limit: { type: "integer", description: "Max rows. Default 20, max 100." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  handle: async (args, ctx) => {
    const projectId = getString(args, "project_id");
    if (!projectId) return textError("project_id is required");
    const project = await assertProjectAccess(ctx.orgId, projectId);
    if (!project) return textError("Project not found in this organisation");

    const scope = getString(args, "scope") === "urls" ? "urls" : "domains";
    const limit = Math.min(getNumber(args, "limit") ?? 20, 100);

    const admin = createAdminClient();
    try {
      if (scope === "urls") {
        const result = await getProjectSourceUrls(admin, projectId, { limit });
        return textResult({ scope, ...result });
      }
      const result = await getProjectSourceDomains(admin, projectId, { limit });
      return textResult({ scope, ...result });
    } catch (err) {
      return textError(
        `Failed to list sources: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

const getPromptDetailTool: Tool = {
  requires: "prompts.read",
  definition: {
    name: "get_prompt_detail",
    description:
      "Full visibility arc for one specific tracked prompt: daily trend, per-model snapshot, sources cited, brands named, and response history. Use when the user drills into one question like 'tell me about the prompt X'.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        prompt_id: { type: "string" },
      },
      required: ["project_id", "prompt_id"],
      additionalProperties: false,
    },
  },
  handle: async (args, ctx) => {
    const projectId = getString(args, "project_id");
    const promptId = getString(args, "prompt_id");
    if (!projectId || !promptId)
      return textError("project_id and prompt_id are required");
    const project = await assertProjectAccess(ctx.orgId, projectId);
    if (!project) return textError("Project not found in this organisation");

    const admin = createAdminClient();
    const detail = await getPromptDetail(admin, projectId, promptId);
    if (!detail) return textError("Prompt not found in this project");

    // Trim the response_snippet fields to keep the payload small for
    // model context — full text is still available via REST.
    const trimmed = {
      ...detail,
      results: detail.results.slice(0, 30).map((r) => ({
        ...r,
        response_snippet: r.response_snippet
          ? r.response_snippet.slice(0, 400)
          : null,
      })),
    };
    return textResult(trimmed);
  },
};

const getRecentChats: Tool = {
  requires: "chats.read",
  definition: {
    name: "get_recent_chats",
    description:
      "The most recent individual AI responses for a project. Each entry is one prompt × model × run with a snippet and mention metadata. Use when the user wants to see raw evidence or specific examples.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        limit: {
          type: "integer",
          description: "Max chats to return. Default 10, max 50.",
        },
        mentioned_only: {
          type: "boolean",
          description:
            "If true, only return chats where the brand was mentioned.",
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  handle: async (args, ctx) => {
    const projectId = getString(args, "project_id");
    if (!projectId) return textError("project_id is required");
    const project = await assertProjectAccess(ctx.orgId, projectId);
    if (!project) return textError("Project not found in this organisation");

    const limit = Math.min(getNumber(args, "limit") ?? 10, 50);
    const mentionedOnly = args.mentioned_only === true;

    const admin = createAdminClient();
    let q = admin
      .from("results")
      .select(
        "id, prompt_id, model, model_version, brand_mentioned, mention_position, sentiment, response_snippet, created_at, prompts!inner(text, project_id)"
      )
      .eq("prompts.project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (mentionedOnly) q = q.eq("brand_mentioned", true);

    const { data, error } = await q;
    if (error)
      return textError(`Failed to load recent chats: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      // Supabase types the embedded relation as either an object or
      // array depending on how it's declared; in practice it's a single
      // row for `!inner`. Unwrap defensively so we handle both.
      const prompts = r.prompts as unknown;
      const promptRow = Array.isArray(prompts)
        ? (prompts[0] as { text: string } | undefined)
        : (prompts as { text: string } | null | undefined);
      return {
        id: r.id,
        prompt_id: r.prompt_id,
        prompt_text: promptRow?.text ?? null,
        model: r.model,
        model_version: r.model_version,
        brand_mentioned: r.brand_mentioned,
        mention_position: r.mention_position,
        sentiment: r.sentiment,
        response_snippet: r.response_snippet
          ? (r.response_snippet as string).slice(0, 500)
          : null,
        created_at: r.created_at,
      };
    });
    return textResult({ chats: rows });
  },
};

// ── Registry ────────────────────────────────────────────────────

const TOOLS: readonly Tool[] = [
  listProjects,
  getVisibility,
  listGaps,
  listSources,
  getPromptDetailTool,
  getRecentChats,
];

/** Surface every tool definition for `tools/list`. */
export function listToolDefinitions(
  scopes: readonly ApiScope[]
): ToolDefinition[] {
  return TOOLS.filter((t) => scopes.includes(t.requires)).map(
    (t) => t.definition
  );
}

/** Dispatch a `tools/call` by name. Returns an isError result if the
 *  tool is unknown or the caller's scopes don't cover it. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolCallResult> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  if (!ctx.scopes.includes(tool.requires)) {
    return {
      content: [
        {
          type: "text",
          text: `Token missing scope for this tool (${tool.requires}). Mint a new key at /settings/api-keys with the right scopes.`,
        },
      ],
      isError: true,
    };
  }
  try {
    return await tool.handle(args, ctx);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

/** Exposed for tests. */
export const TOOL_NAMES = TOOLS.map((t) => t.definition.name);
