/**
 * Minimal types for the MCP Streamable-HTTP transport.
 *
 * The Model Context Protocol is JSON-RPC 2.0 with a specific set of
 * methods (`initialize`, `tools/list`, `tools/call`, …). We only
 * implement the read-only subset we need for v1 — no sampling, no
 * resources, no prompts.
 *
 * We deliberately don't pull in the SDK — the protocol surface we use
 * is small, and keeping our own types makes the wire shape visible.
 * When the SDK matures enough we can swap these out without touching
 * the tool implementations.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

/** JSON-Schema-ish shape used by MCP tool inputSchema. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "integer";
      description?: string;
      enum?: readonly string[];
    }
  >;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

/** Shape returned by tools/call. MCP supports mixed content arrays — we
 *  always return a single text block with JSON-encoded result for the
 *  read-only tools. Claude parses it back in the model context. */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Initialize result we return to the client. Kept minimal. */
export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools: {
      listChanged?: boolean;
    };
  };
}
