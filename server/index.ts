import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { config } from './config';
import authRoutes from './routes/auth';
import driveRoutes from './routes/drive';
import aiRoutes from './routes/ai';
import notesProxyRoutes from './routes/notesProxy';
import calendarRoutes from './routes/calendar';
import { requireAuth } from './middleware/requireAuth';
import { startScheduler } from './jobs/scheduler';

const app = express();

// --- CRITICAL HEROKU FIX ---
app.set('trust proxy', 1);

const PostgresqlStore = connectPgSimple(session);

function createSessionStore(): session.Store | undefined {
  if (!config.isProduction) {
    console.warn(
      '[session] Development: in-memory sessions (no DATABASE_URL). Logins clear when the server restarts.'
    );
    return undefined;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is required in production for session persistence.');
    process.exit(1);
  }

  return new PostgresqlStore({
    pool: new pg.Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    }),
    createTableIfMissing: true,
  });
}

// --- Global Rate Limiter ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 300, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// --- AI Route Rate Limiter (stricter) ---
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 20, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please wait before trying again.' },
});

// --- Auth Rate Limiter (prevent brute force) ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// --- MIDDLEWARE ---
app.use(globalLimiter);
// Allow credentialed browser fetches from the SPA when it runs on another origin/port (e.g. Vite on :5173, API on :3000).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

app.use(
  session({
    store: createSessionStore(),
    secret: config.sessionSecret || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// --- ROUTES ---
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/drive', requireAuth, driveRoutes);
app.use('/api/ai', aiLimiter, requireAuth, aiRoutes);
app.use('/api/notes', requireAuth, notesProxyRoutes);
app.use('/api/calendar', requireAuth, calendarRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (config.isProduction) {
  const staticPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(staticPath));
  app.get(/(.*)/, (_req: Request, res: Response) => {
    res.sendFile('index.html', { root: staticPath });
  });
}

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.listen(config.port, () => {
  console.log(`Halo server running on port ${config.port} (${config.isProduction ? 'production' : 'development'})`);
  startScheduler();
});