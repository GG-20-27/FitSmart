console.log('[STARTUP] Starting server initialization...');

// CRITICAL: Load environment variables FIRST before any other imports
import "./loadEnv";

console.log('[STARTUP] Environment loaded, importing dependencies...');

// Fallback for manual injection in Replit (optional safety net)
if (!process.env.N8N_SECRET_TOKEN) {
  process.env.N8N_SECRET_TOKEN = 'fitgpt-secret-2025';
  console.log('[INFO] Set default N8N_SECRET_TOKEN to: fitgpt-secret-2025');
}

console.log('[STARTUP] Importing express...');
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

console.log('[STARTUP] Importing routes...');
import { registerRoutes } from "./routes";

console.log('[STARTUP] Importing services...');
import { whoopApiService } from "./whoopApiService";
import { userService } from "./userService";
import { jwtAuthMiddleware } from "./jwtAuth";
import { whoopTokenStorage } from "./whoopTokenStorage";

console.log('[STARTUP] All imports complete');

// Simple logging utility
const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

const app = express();

// CRITICAL: Trust proxy for Replit deployment
app.set('trust proxy', 1);

// JWT authentication middleware
app.use(jwtAuthMiddleware);

console.log(`[JWT] JWT-based authentication configured`);

// Background token refresh service — covers ALL authenticated users
function startTokenRefreshService() {
  console.log('[TOKEN SERVICE] Starting background token refresh service...');

  const refreshTokens = async () => {
    try {
      const allTokens = await whoopTokenStorage.getAllTokens();
      if (allTokens.length === 0) {
        console.log('[TOKEN SERVICE] No users with tokens found. Waiting for first OAuth login.');
        return;
      }
      console.log(`[TOKEN SERVICE] Checking tokens for ${allTokens.length} user(s)...`);
      let refreshed = 0;
      let failed = 0;
      for (const { userId } of allTokens) {
        try {
          await whoopApiService.getValidWhoopToken(userId);
          refreshed++;
        } catch {
          failed++;
          console.log(`[TOKEN SERVICE] Token refresh failed for user ${userId} — they may need to re-authenticate`);
        }
      }
      console.log(`[TOKEN SERVICE] Complete: ${refreshed} ok, ${failed} failed`);
    } catch (error) {
      console.error('[TOKEN SERVICE] Unexpected error in refresh cycle:', error);
    }
  };

  // Run immediately and then every 5 minutes
  refreshTokens();
  setInterval(refreshTokens, 5 * 60 * 1000);
}
// CORS configuration - must be before express.json()
app.use((req, res, next) => {
  // Allow credentials for JWT-based auth
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Set origin based on environment - be more permissive for Replit
  const origin = req.headers.origin;
  if (process.env.NODE_ENV === 'development' || 
      origin?.includes('localhost') || 
      origin?.includes('replit.app') || 
      origin?.includes('replit.dev') ||
      origin?.includes('health-data-hub')) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // For same-origin requests (no Origin header)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  // Allow common headers including session-related ones
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie');
  
  // Allow common methods
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// General API limit: 300 req/min per IP (generous for active use, stops abuse)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => req.method === 'OPTIONS', // Never block preflight
});

// AI/compute-heavy endpoints: 20 req/min per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI request limit reached. Please wait a moment.' },
});

app.use('/api/', generalLimiter);
app.use('/api/fitscore/calculate', aiLimiter);
app.use('/api/meals/analyze', aiLimiter);
app.use('/api/training/analyze', aiLimiter);
app.use('/api/coach/summary', aiLimiter);
// ──────────────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Serve the app on port 3001 (or PORT env variable)
  // this serves both the API and the client.
  const port = parseInt(process.env.PORT || "3001", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${port} is already in use.`);
      console.error(`   Kill the process using: lsof -ti:${port} | xargs kill`);
      console.error(`   Or use a different port: PORT=3002 npm run dev\n`);
      process.exit(1);
    } else {
      console.error(`\n❌ Server error:`, err);
      process.exit(1);
    }
  });

  // Start background token refresh service
  startTokenRefreshService();

  // Utility to print all registered routes (for debugging)
  (app as any)._router.stack
    .filter((r: any) => r.route)
    .forEach((r: any) => {
      const method = Object.keys(r.route.methods)[0].toUpperCase();
      const path = r.route.path;
      console.log(`[ROUTE] ${method} ${path}`);
    });
})();
