import 'express-session';

declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    oauthState?: string;
    oauthNonce?: string;
    user?: {
      idToken: string;
      accessToken?: string;
      claims: Record<string, unknown>;
    };
  }
}
