import { Router } from 'express';
import { callNormalApp } from '../modes/normalApp.js';
import { callMcpClient } from '../modes/mcpClient.js';
import type { Mode } from '../config.js';

export const callRouter: Router = Router();

callRouter.post('/call', async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) {
      res.status(401).json({ error: 'Not logged in. Go to /auth/login first.' });
      return;
    }

    const mode = (req.body?.mode ?? 'normal') as Mode;
    if (mode !== 'normal' && mode !== 'mcp') {
      res.status(400).json({ error: `Unknown mode: ${mode}` });
      return;
    }

    const started = Date.now();
    if (mode === 'normal') {
      const result = await callNormalApp(user.idToken);
      res.json({ mode, durationMs: Date.now() - started, ...result });
    } else {
      const result = await callMcpClient(user.idToken);
      res.json({ mode, durationMs: Date.now() - started, ...result });
    }
  } catch (err) {
    next(err);
  }
});
