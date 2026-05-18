import { Router } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { requireAccessToken } from '../auth/jwt.js';
import { requireScope } from '../auth/scopes.js';
import { createFile, getFile, getFolder, listFiles, listFolders } from '../data/store.js';

export const mcpRouter = Router();

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'xaa-dev-resource-app',
    version: '0.1.0',
  });

  server.registerTool(
    'list_folders',
    {
      description: 'List every folder in the user\'s Box-style drive.',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(listFolders(), null, 2) }],
    }),
  );

  server.registerTool(
    'list_files',
    {
      description: 'List files, optionally filtered by folderId.',
      inputSchema: { folderId: z.string().optional() },
    },
    async ({ folderId }) => ({
      content: [{ type: 'text', text: JSON.stringify(listFiles(folderId), null, 2) }],
    }),
  );

  server.registerTool(
    'get_file',
    {
      description: 'Fetch a file\'s metadata by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const file = getFile(id);
      if (!file) {
        return { content: [{ type: 'text', text: `File ${id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] };
    },
  );

  server.registerTool(
    'get_folder',
    {
      description: 'Fetch a folder (and its file list) by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const folder = getFolder(id);
      if (!folder) {
        return { content: [{ type: 'text', text: `Folder ${id} not found` }], isError: true };
      }
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ...folder, files: listFiles(folder.id) }, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    'create_file',
    {
      description: 'Create a new file in a folder. Requires files.write scope.',
      inputSchema: {
        name: z.string(),
        folderId: z.string(),
        sizeBytes: z.number().optional(),
        mimeType: z.string().optional(),
      },
    },
    async ({ name, folderId, sizeBytes, mimeType }) => {
      const file = createFile({
        name,
        folderId,
        sizeBytes: sizeBytes ?? 0,
        mimeType: mimeType ?? 'application/octet-stream',
        owner: 'mcp',
      });
      return { content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] };
    },
  );

  return server;
}

// StreamableHTTP: each POST /mcp is a one-shot request/response. We build a
// fresh server + transport per request so sessions don't bleed across clients.
// The requireScope("files.read") gate is the minimum scope to reach MCP; tools
// themselves can fail with isError when per-tool policy (like write) applies.
// Bearer-token + scope gate in front of the MCP endpoint. 401s carry the
// RFC 9728 resource_metadata hint so agents can auto-discover the auth server.
mcpRouter.post(
  '/',
  requireAccessToken({ mcp: true }),
  requireScope('files.read', { mcp: true }),
  async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on('close', () => {
      void transport.close();
    });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal MCP error',
        },
        id: null,
      });
    }
  }
  },
);
