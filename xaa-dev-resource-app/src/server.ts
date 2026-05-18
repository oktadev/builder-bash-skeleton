import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { filesRouter } from './routes/files.js';
import { foldersRouter } from './routes/folders.js';
import { mcpRouter } from './mcp/router.js';
import { protectedResourceMetadataRouter } from './mcp/metadata.js';
import { authServerRouter } from './authServer/router.js';

const app = express();

// Playground origins per BYOR CORS guidance.
app.use(
  cors({
    origin: ['https://xaa.dev', 'https://app.xaa.dev'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['WWW-Authenticate'],
  }),
);

app.use(express.json());

// Health + RFC 9728 metadata are public (no bearer required).
app.use('/', healthRouter);
app.use('/', protectedResourceMetadataRouter);

// REST API
app.use('/api', filesRouter);
app.use('/api', foldersRouter);

// MCP endpoint (mounted at /mcp)
app.use('/mcp', mcpRouter);

app.listen(config.port, () => {
  console.log(`xaa-dev-resource-app listening on http://localhost:${config.port}`);
  console.log(`  resource URL: ${config.resourceUrl}`);
  console.log(`  auth mode:    ${config.authMode}`);
  if (config.authMode === 'playground') {
    console.log(`  accepting tokens from ${config.playground.issuer}`);
  } else {
    console.log(`  own auth server at ${config.own.authServerUrl}`);
    console.log(`  trusting ID-JAGs from ${config.own.idpIssuer}`);
  }
});

// Own auth server runs as a separate Express app on AUTH_PORT so it can be
// exposed via its own tunnel URL, independent of the resource server.
if (config.authMode === 'own') {
  const authApp = express();
  authApp.use(
    cors({
      origin: ['https://xaa.dev', 'https://app.xaa.dev'],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['WWW-Authenticate'],
    }),
  );
  authApp.use('/', authServerRouter);
  authApp.listen(config.authPort, () => {
    console.log(`  auth server listening on http://localhost:${config.authPort}`);
  });
}
