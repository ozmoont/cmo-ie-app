/**
 * MCP JSON-RPC dispatcher. The route handler at /api/mcp is a 10-line
 * adapter that hands the parsed request off to `handleJsonRpc` here.
 *
 * Supported methods (MCP v0.1 minimal read-only profile):
 *
 *   initialize       Negotiate protocol version + advertise capabilities.
 *   tools/list       Return the list of tools the caller's scopes unlock.
 *   tools/call       Execute a tool by name with args.
 *   ping             Liveness probe — returns {}.
 *
 * Notifications (id omitted) are accepted but we don't produce any —
 * every handler returns a response. That's compliant; clients just
 * don't see status pushes, which the read-only tool set doesn't need.
 */

import type { ApiScope } from "@/lib/api-auth";
import {
  callTool,
  listToolDefinitions,
} from "@/lib/mcp/tools";
import type {
  InitializeResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "@/lib/mcp/types";

// MCP protocol version we advertise. Claude clients negotiate against
// this — we pin a known-good one and bump when we explicitly test
// against a newer spec.
const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "cmo.ie";
const SERVER_VERSION = "0.1.0";

// JSON-RPC standard error codes (-32700 .. -32603) + MCP additions.
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

export interface Caller {
  orgId: string;
  scopes: readonly ApiScope[];
}

export async function handleJsonRpc(
  raw: unknown,
  caller: Caller
): Promise<JsonRpcResponse | null> {
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as JsonRpcRequest).jsonrpc !== "2.0" ||
    typeof (raw as JsonRpcRequest).method !== "string"
  ) {
    return errorFor(null, ERR_INVALID_REQUEST, "Invalid JSON-RPC request");
  }

  const req = raw as JsonRpcRequest;
  // Notifications (no id) — we don't currently send any state back,
  // but we also don't error. Return null so the transport drops it.
  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "initialize":
        return successFor(id, initialize(req.params));
      case "ping":
        return successFor(id, {});
      case "notifications/initialized":
        // Per MCP spec, this is a notification confirming the client
        // finished its own initialize. Notifications get no response.
        return null;
      case "tools/list": {
        const tools = listToolDefinitions(caller.scopes);
        return successFor(id, { tools });
      }
      case "tools/call": {
        const params = (req.params ?? {}) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        if (!params.name || typeof params.name !== "string") {
          return errorFor(id, ERR_INVALID_PARAMS, "tools/call requires `name`");
        }
        const result = await callTool(
          params.name,
          params.arguments ?? {},
          { orgId: caller.orgId, scopes: caller.scopes }
        );
        return successFor(id, result);
      }
      default:
        return errorFor(
          id,
          ERR_METHOD_NOT_FOUND,
          `Method not supported: ${req.method}`
        );
    }
  } catch (err) {
    console.error("MCP dispatch failure:", err);
    return errorFor(
      id,
      ERR_INTERNAL,
      err instanceof Error ? err.message : String(err)
    );
  }
}

function initialize(params: unknown): InitializeResult {
  // We don't require clientInfo or clientCapabilities — MCP lets us
  // advertise what we support regardless of what the client asked for.
  // The spec's rule is that the server picks protocolVersion; mismatch
  // is handled client-side.
  void params;
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    capabilities: {
      tools: { listChanged: false },
    },
  };
}

function successFor<T>(
  id: string | number | null,
  result: T
): JsonRpcResponse<T> {
  return { jsonrpc: "2.0", id, result };
}

function errorFor(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

/** Exposed for tests. */
export const _ERR = {
  PARSE: ERR_PARSE,
  INVALID_REQUEST: ERR_INVALID_REQUEST,
  METHOD_NOT_FOUND: ERR_METHOD_NOT_FOUND,
  INVALID_PARAMS: ERR_INVALID_PARAMS,
  INTERNAL: ERR_INTERNAL,
};
