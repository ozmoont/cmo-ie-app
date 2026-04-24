/**
 * MCP JSON-RPC dispatch tests.
 *
 * We test the envelope behaviour: initialize shape, method routing,
 * error codes, scope filtering of tool list. The Supabase-backed
 * tool handlers are exercised elsewhere (and at the integration
 * layer once we wire tests against a test Supabase).
 */

import { describe, expect, it } from "vitest";
import { handleJsonRpc, _ERR } from "../mcp/server";
import { TOOL_NAMES } from "../mcp/tools";
import type { ApiScope } from "../api-auth";

const ALL_SCOPES: ApiScope[] = [
  "visibility.read",
  "sources.read",
  "gaps.read",
  "prompts.read",
  "chats.read",
  "competitors.read",
];

const caller = (scopes: ApiScope[] = ALL_SCOPES) => ({
  orgId: "00000000-0000-0000-0000-000000000000",
  scopes,
});

describe("MCP dispatch: validation", () => {
  it("returns invalid_request for non-JSON-RPC payloads", async () => {
    const res = await handleJsonRpc({ not: "a request" }, caller());
    expect(res).not.toBeNull();
    if (!res || !("error" in res)) throw new Error("expected error response");
    expect(res.error.code).toBe(_ERR.INVALID_REQUEST);
  });

  it("returns invalid_request when jsonrpc version is wrong", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "1.0", method: "initialize", id: 1 },
      caller()
    );
    if (!res || !("error" in res)) throw new Error("expected error response");
    expect(res.error.code).toBe(_ERR.INVALID_REQUEST);
  });

  it("returns method_not_found for unknown methods", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "does/not/exist", id: 42 },
      caller()
    );
    if (!res || !("error" in res)) throw new Error("expected error response");
    expect(res.error.code).toBe(_ERR.METHOD_NOT_FOUND);
  });
});

describe("MCP dispatch: initialize", () => {
  it("advertises tools capability and server metadata", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "initialize", id: 1, params: {} },
      caller()
    );
    if (!res || !("result" in res)) throw new Error("expected success");
    const r = res.result as {
      serverInfo: { name: string };
      capabilities: { tools: unknown };
      protocolVersion: string;
    };
    expect(r.serverInfo.name).toBe("cmo.ie");
    expect(r.capabilities.tools).toBeDefined();
    expect(typeof r.protocolVersion).toBe("string");
  });

  it("echoes the request id on success", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "initialize", id: "abc-123" },
      caller()
    );
    expect(res?.id).toBe("abc-123");
  });

  it("drops notifications/initialized silently", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      caller()
    );
    expect(res).toBeNull();
  });
});

describe("MCP dispatch: tools/list", () => {
  it("returns every tool when the caller has all scopes", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "tools/list", id: 1 },
      caller()
    );
    if (!res || !("result" in res)) throw new Error("expected success");
    const r = res.result as { tools: Array<{ name: string }> };
    expect(r.tools.length).toBe(TOOL_NAMES.length);
    const names = new Set(r.tools.map((t) => t.name));
    for (const expected of TOOL_NAMES) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("filters tools by the caller's scopes", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "tools/list", id: 1 },
      caller(["visibility.read"])
    );
    if (!res || !("result" in res)) throw new Error("expected success");
    const r = res.result as { tools: Array<{ name: string }> };
    const names = r.tools.map((t) => t.name);
    // visibility.read unlocks list_projects + get_visibility only.
    expect(names).toContain("list_projects");
    expect(names).toContain("get_visibility");
    expect(names).not.toContain("list_gaps");
    expect(names).not.toContain("list_sources");
  });

  it("returns an empty list when the caller has no v1 scopes", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "tools/list", id: 1 },
      caller([])
    );
    if (!res || !("result" in res)) throw new Error("expected success");
    const r = res.result as { tools: unknown[] };
    expect(r.tools.length).toBe(0);
  });
});

describe("MCP dispatch: tools/call validation", () => {
  it("rejects tools/call without a name", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "tools/call", id: 1, params: {} },
      caller()
    );
    if (!res || !("error" in res)) throw new Error("expected error");
    expect(res.error.code).toBe(_ERR.INVALID_PARAMS);
  });

  it("returns an isError tool result for unknown tool names", async () => {
    const res = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 1,
        params: { name: "does_not_exist", arguments: {} },
      },
      caller()
    );
    if (!res || !("result" in res)) throw new Error("expected success envelope");
    const r = res.result as { isError?: boolean };
    expect(r.isError).toBe(true);
  });
});

describe("MCP dispatch: ping", () => {
  it("returns an empty object for ping", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", method: "ping", id: 9 },
      caller()
    );
    if (!res || !("result" in res)) throw new Error("expected success");
    expect(res.result).toEqual({});
  });
});
