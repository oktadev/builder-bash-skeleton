import { Router } from 'express';
import { buildLoginUrl, completeLogin } from '../caa/auth.js';
import { config } from '../config.js';

export const authRouter: Router = Router();

authRouter.get('/login', async (req, res, next) => {
  try {
    const { authUrl, codeVerifier, state, nonce } = await buildLoginUrl();
    req.session.codeVerifier = codeVerifier;
    req.session.oauthState = state;
    req.session.oauthNonce = nonce;
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/callback', async (req, res, next) => {
  try {
    const { codeVerifier, oauthState, oauthNonce } = req.session;
    if (!codeVerifier || !oauthState || !oauthNonce) {
      res.status(400).send('Missing PKCE/state in session. Start at /auth/login.');
      return;
    }

    const qs = req.url.split('?')[1] ?? '';
    const currentUrl = new URL(`${config.redirectUri}${qs ? '?' + qs : ''}`);

    const result = await completeLogin(currentUrl, codeVerifier, oauthState, oauthNonce);

    req.session.user = {
      idToken: result.idToken,
      accessToken: result.accessToken,
      claims: result.claims,
    };
    delete req.session.codeVerifier;
    delete req.session.oauthState;
    delete req.session.oauthNonce;

    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

authRouter.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});
