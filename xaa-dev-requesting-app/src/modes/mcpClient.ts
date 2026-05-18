import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config.js';
import { exchangeForResourceAccessToken } from '../caa/tokenExchange.js';

/**
 * MCP-client mode: share the same CAA core, then attach the resulting
 * access token to an MCP StreamableHTTP transport. We list tools, call
 * one if present, and return everything for display.
 */
export async function callMcpClient(idToken: string): Promise<{
  accessToken: string;
  idJag: string;
  mcpUrl: string;
  tools: unknown;
  sampleToolCall?: { name: string; result: unknown; error?: string };
}> {
  const { accessToken, idJag } = await exchangeForResourceAccessToken(
    idToken,
    config.mcp.resourceUrl,
    config.mcp.scopes,
  );

  // Wrap fetch so every MCP request carries the bearer token.
  const authedFetch: typeof fetch = (input, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };

  const mcpUrl = config.mcp.resourceUrl;
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    fetch: authedFetch,
  });

  const client = new Client(
    { name: 'xaa-dev-requesting-app', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  try {
    const tools = await client.listTools();

    let sampleToolCall: { name: string; result: unknown; error?: string } | undefined;
    const first = tools.tools[0];
    if (first) {
      try {
        const result = await client.callTool({
          name: first.name,
          arguments: {},
        });
        sampleToolCall = { name: first.name, result };
      } catch (err) {
        sampleToolCall = {
          name: first.name,
          result: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { accessToken, idJag, mcpUrl, tools, sampleToolCall };
  } finally {
    await client.close();
  }
}
