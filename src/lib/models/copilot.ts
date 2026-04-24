// ── Microsoft Copilot adapter ──
//
// Microsoft Copilot for consumers doesn't expose a public API. The
// production path tracks the same underlying GPT model via Azure
// OpenAI with Bing grounding — Azure's `extensions.data_sources` block
// supports `azure_search` and `bing`, with `bing` producing the same
// style of grounded answer + citations that the consumer Copilot shows.
//
// We ship the adapter with the Azure path as the default implementation.
// It's gated by three env vars (endpoint, deployment, key) so orgs
// without an Azure OpenAI subscription just see the adapter as
// unavailable rather than erroring mid-run.
//
// Env vars:
//   AZURE_OPENAI_ENDPOINT      e.g. https://cmo-ie.openai.azure.com
//   AZURE_OPENAI_DEPLOYMENT    the deployment name targeting a GPT-4.1
//                              or later model (Azure-specific)
//   AZURE_OPENAI_KEY           api key for the above
//   BING_SEARCH_CONNECTION     optional — Bing connection name if your
//                              deployment isn't pre-wired with a search
//                              connection.
//
// When BYOK is wired in at the org level, `apiKey` carries the Azure
// key override (BYOK for Azure only, no separate Bing key plumbing
// for now — keeps the BYOK story simple).

import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";
import { retryWithBackoff } from "./retry";

const API_VERSION = "2024-10-21";

function endpointUrl(): string | null {
  const base = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!base || !deployment) return null;
  return `${base}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`;
}

function keyFor(opts?: QueryOptions): string | null {
  return opts?.apiKey ?? process.env.AZURE_OPENAI_KEY ?? null;
}

// Azure Chat Completions response (with `context.citations` when the
// bing data source is enabled). Narrowed to what we consume.
interface AzurePayload {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      context?: {
        citations?: Array<{
          url?: string;
          title?: string;
          content?: string;
          filepath?: string;
        }>;
      };
    };
    finish_reason: string;
  }>;
}

async function runCopilot(
  prompt: string,
  opts: QueryOptions
): Promise<AzurePayload> {
  const url = endpointUrl();
  if (!url) {
    throw new AdapterError(
      "copilot",
      "AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_DEPLOYMENT not configured"
    );
  }
  const key = keyFor(opts);
  if (!key) {
    throw new AdapterError(
      "copilot",
      "AZURE_OPENAI_KEY not configured"
    );
  }

  const systemPrompt = opts.marketContext
    ? `You are answering user questions about the ${opts.marketContext}. Ground your answers using the provided search results. Be factual.`
    : "Ground your answers using the provided search results. Be factual.";

  const body = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    max_tokens: 2048,
    temperature: 0.3,
    // Azure's `data_sources` (was `dataSources`) attaches retrieval.
    // The `bing` type is Microsoft-managed grounding — the closest
    // 1:1 equivalent to what end-users see in Microsoft Copilot.
    data_sources: [
      {
        type: "bing",
        parameters: {
          // Connection name is optional when the deployment is
          // pre-wired with a Bing resource. Pass only when set.
          ...(process.env.BING_SEARCH_CONNECTION
            ? { connection: process.env.BING_SEARCH_CONNECTION }
            : {}),
        },
      },
    ],
  };

  const res = await retryWithBackoff(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Azure OpenAI HTTP ${response.status}: ${errText.slice(0, 200)}`
      );
    }
    return response.json() as Promise<AzurePayload>;
  });

  return res;
}

function parseSources(
  raw: AzurePayload,
  responseText: string
): ModelSource[] {
  const citations =
    raw.choices[0]?.message?.context?.citations ?? [];
  const seen = new Set<string>();
  const sources: ModelSource[] = [];
  let position = 1;
  for (const c of citations) {
    const url = c.url ?? c.filepath;
    if (!url || typeof url !== "string") continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const citedInline = responseText.includes(url);
    sources.push({
      url,
      domain: domainFromUrl(url),
      cited_inline: citedInline,
      position: position++,
    });
  }
  return sources;
}

export const copilotAdapter: ModelAdapter = {
  name: "copilot",
  label: "Microsoft Copilot",
  available(): boolean {
    return (
      Boolean(process.env.AZURE_OPENAI_ENDPOINT) &&
      Boolean(process.env.AZURE_OPENAI_DEPLOYMENT) &&
      Boolean(process.env.AZURE_OPENAI_KEY)
    );
  },
  async query(prompt, opts = {}): Promise<ModelResponse> {
    try {
      const payload = await runCopilot(prompt, opts);
      const text = payload.choices[0]?.message?.content ?? "";
      if (!text) {
        throw new AdapterError("copilot", "Azure returned an empty response");
      }
      return {
        text,
        sources: parseSources(payload, text),
        model_version: payload.model ?? "copilot-azure",
      };
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(
        "copilot",
        err instanceof Error ? err.message : String(err),
        err
      );
    }
  },
};
