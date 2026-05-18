/**
 * Shared types for the XAA Requesting App.
 */

export interface SessionUser {
  /** OIDC ID Token from the IdP. Exchanged for ID-JAG via RFC 8693. */
  idToken: string;
  /** OIDC user claims (sub, email, name, etc.) decoded from the ID Token. */
  claims: Record<string, unknown>;
  /** ISO timestamp of when the user logged in. */
  loggedInAt: string;
}

/** PKCE + state material stored before redirect to IdP, validated on callback. */
export interface PkceTransaction {
  codeVerifier: string;
  state: string;
  nonce: string;
  /** ISO timestamp; transactions older than 10 minutes are rejected. */
  startedAt: string;
}

export interface SessionData {
  user?: SessionUser;
  pkce?: PkceTransaction;
}

export interface TokenState {
  hasIdToken: boolean;
  idTokenExpiresAt?: string;
  hasResourceAccessToken: boolean;
  resourceAccessTokenExpiresAt?: string;
  scopes: string[];
}

/** A single log entry in the in-memory observability buffer. */
export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category:
    | 'auth'
    | 'token-exchange'
    | 'jwt-bearer'
    | 'resource-call'
    | 'session'
    | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export interface CallResult {
  ok: true;
  request: { url: string; method: string };
  status: number;
  body: unknown;
  /** Tokens redacted to first/last 8 chars only, never full values. */
  tokens: {
    idJag?: string;
    accessToken?: string;
  };
  scopes: string[];
  durationMs: number;
}

export type ErrorCode =
  | 'unauthorized'
  | 'invalid_token'
  | 'expired_token'
  | 'insufficient_scope'
  | 'resource_failure'
  | 'config_error'
  | 'token_exchange_failure'
  | 'unknown';

export interface ApiError {
  ok: false;
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
