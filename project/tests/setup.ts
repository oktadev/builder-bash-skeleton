/**
 * Vitest setup — populate the env vars our config module requires so the
 * tests can import @/lib/* without a real `.env.local`. The actual HTTP
 * traffic is mocked per-test with `vi.spyOn(globalThis, 'fetch')`.
 */
process.env.IDP_URL ??= 'https://idp.test.example';
process.env.CLIENT_ID ??= 'test-client';
process.env.CLIENT_SECRET ??= 'test-client-secret';
process.env.AUTH_SERVER_URL ??= 'https://auth.test.example';
process.env.RESOURCE_CLIENT_ID ??= 'test-resource-client';
process.env.RESOURCE_CLIENT_SECRET ??= 'test-resource-secret';
process.env.RESOURCE_URL ??= 'https://resource.test.example';
process.env.RESOURCE_PATH ??= '/api/todos';
process.env.RESOURCE_SCOPES ??= 'todos.read';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.REDIRECT_URI ??= 'http://localhost:3000/api/auth/callback';
process.env.SESSION_SECRET ??=
  'test-session-secret-at-least-32-chars-long-padding';
