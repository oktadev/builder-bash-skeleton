import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './session.js';
import { config } from './config.js';
import { indexRouter } from './routes/index.js';
import { authRouter } from './routes/auth.js';
import { callRouter } from './routes/call.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Behind a tunnel (cloudflared/ngrok) or any cloud proxy, trust the first hop
// so req.protocol and cookies reflect the HTTPS edge, not the local HTTP.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false },
  }),
);

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/', callRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`xaa-dev-requesting-app listening on http://localhost:${config.port}`);
});
