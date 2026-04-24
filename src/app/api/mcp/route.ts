/**
 * POST /api/mcp — Streamable HTTP MCP endpoint.
 *
 * Auth: the same `cmo_…` bearer tokens that power the REST API. The
 * token's scope set controls which tools are visible. Claude connectors
 * can supply the token via the standard MCP OAuth flow (P3-B3, later)
 * or as a static bearer for self-serve installs.
 *
 * The endpoint accepts a single JSON-RPC request per HTTP POST for v1.
 * Batch requests (array-of-RPCs) are not supported yet — MCP clients
 * rarely use them and they complicate error handling.
 */

import { NextResponse } from "next/server";
import { requireApiKey, API_SCOPES, type ApiScope } from "@/lib/api-auth";
import { handleJsonRpc } from "@/lib/mcp/server";

export async function POST(request: Request) {
  // MCP uses a narrower scope model than REST — any one read scope is
  // enough to hit /api/mcp itself; individual tools enforce their own
  // required scope. Pick the most commonly-held scope as the gate here
  // so existing keys work.
  const auth = await requireApiKey(request, "visibility.read");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON body" },
      },
      { status: 400 }
    );
  }

  // Narrow the scopes to the ones we recognise — a badly-shaped row
  // somewhere shouldn't let us escalate.
  const validScopes: ApiScope[] = auth.apiKey.scopes.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s)
  );

  const response = await handleJsonRpc(body, {
    orgId: auth.apiKey.org_id,
    scopes: validScopes,
  });

  // Notifications return null per spec. Reply 204.
  if (response === null) {
    return new Response(null, { status: 204 });
  }
  return NextResponse.json(response);
}

/**
 * GET /api/mcp — simple capability introspection for clients that want
 * to confirm the server is reachable without establishing a full MCP
 * session. Returns nothing sensitive.
 */
export async function GET() {
  return NextResponse.json({
    transport: "streamable-http",
    protocol_version: "2025-03-26",
    server: { name: "cmo.ie", version: "0.1.0" },
    auth: "bearer",
    docs: "/docs/mcp",
  });
}
