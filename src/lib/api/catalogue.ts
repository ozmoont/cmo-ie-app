/**
 * Single source of truth for the REST v1 surface.
 *
 * Every entry here corresponds to exactly one route under `src/app/api/v1`.
 * The /docs/api page is generated from this array so docs can't silently
 * drift from what's actually deployed. When we add a route, we add it
 * here too — there's a lint-level check in CI (TODO) to enforce this.
 *
 * We deliberately keep the shape simple: a flat array of entries with
 * strongly-typed scope + method. Query params are written as plain
 * objects because the docs page needs to render them, not validate them.
 */

import type { ApiScope } from "@/lib/api-auth";

export interface EndpointParam {
  name: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface EndpointDoc {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  scope: ApiScope;
  params?: EndpointParam[];
  /** Example response (kept concise — link to full schema when we write it). */
  example_response?: string;
}

export const V1_ENDPOINTS: EndpointDoc[] = [
  {
    method: "GET",
    path: "/api/v1/projects",
    summary: "List projects owned by the authenticated key's organisation.",
    scope: "visibility.read",
    params: [
      { name: "page", required: false, description: "1-indexed page number." },
      {
        name: "page_size",
        required: false,
        description: "Items per page (default 50, max 200).",
      },
    ],
    example_response: `{
  "data": [
    {
      "id": "9c7a0e00-...",
      "name": "Howl.ie",
      "website_url": "https://howl.ie",
      "brand_name": "Howl",
      "brand_display_name": "Howl",
      "country_codes": ["IE"],
      "models": ["claude", "chatgpt", "gemini", "perplexity"],
      "created_at": "2026-04-10T11:12:00Z"
    }
  ],
  "pagination": { "page": 1, "page_size": 50, "total": 1, "has_more": false }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/metrics",
    summary:
      "Headline metrics over the window: visibility %, SoV %, avg position, sentiment distribution.",
    scope: "visibility.read",
    params: [
      { name: "from", required: false, description: "ISO date (default 30d ago)." },
      { name: "to", required: false, description: "ISO date (default now)." },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/prompts",
    summary:
      "Paginated prompt list with a rolling-30d visibility % per prompt.",
    scope: "prompts.read",
    params: [
      { name: "page", required: false, description: "1-indexed page number." },
      { name: "page_size", required: false, description: "Items per page." },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/chats",
    summary:
      "Paginated result rows with snippet + mention flags. One row per prompt × model × run.",
    scope: "chats.read",
    params: [
      { name: "from", required: false, description: "ISO date." },
      { name: "to", required: false, description: "ISO date." },
      {
        name: "model",
        required: false,
        description: "Restrict to chatgpt / claude / perplexity / gemini / google_aio.",
      },
      { name: "prompt_id", required: false, description: "Restrict to one prompt." },
      {
        name: "mentioned",
        required: false,
        description: "`true` or `false` to filter by brand_mentioned.",
      },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/sources",
    summary:
      "Domain or URL aggregates with retrieval / citation rates and source-type breakdown.",
    scope: "sources.read",
    params: [
      {
        name: "scope",
        required: false,
        description: "`domains` (default) or `urls`.",
      },
      { name: "from", required: false, description: "ISO date." },
      { name: "to", required: false, description: "ISO date." },
      { name: "model", required: false, description: "Optional model filter." },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/gaps",
    summary:
      "Ranked Gap Score list — sources where competitors appear and the brand doesn't.",
    scope: "gaps.read",
    params: [
      {
        name: "scope",
        required: false,
        description: "`domains` (default) or `urls`.",
      },
      { name: "from", required: false, description: "ISO date." },
      { name: "to", required: false, description: "ISO date." },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}/competitors",
    summary: "Tracked competitors with aliases, domains, colour.",
    scope: "competitors.read",
  },
];
