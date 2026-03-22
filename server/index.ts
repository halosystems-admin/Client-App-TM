import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import helmet from 'helmet';
import FileStoreFactory from 'session-file-store';
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
// Tells Express to trust the Heroku proxy so secure cookies are sent properly
app.set('trust proxy', 1);

const FileStore = FileStoreFactory(session);

// --- Global Rate Limiter ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// --- AI Route Rate Limiter (stricter) ---
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 AI requests per minute
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
app.use(helmet());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

const sessionStore = new FileStore({
  path: path.join(__dirname, '../sessions'),
  retries: 1,
});

app.use(session({
  store: sessionStore,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.isProduction, // Now this will work on Heroku!
    httpOnly: true,
    sameSite: config.isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

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