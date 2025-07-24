// Fallback for manual injection in Replit (optional safety net)
if (!process.env.N8N_SECRET_TOKEN) {
  process.env.N8N_SECRET_TOKEN = 'fitgpt-secret-2025';
  console.log('[INFO] Set default N8N_SECRET_TOKEN to: fitgpt-secret-2025');
}

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { whoopApiService } from "./whoopApiService";
import { userService } from "./userService";

const app = express();

// CRITICAL: Trust proxy for Replit deployment
app.set('trust proxy', 1);

// Session configuration with PostgreSQL store
const PgSession = ConnectPgSimple(session);

// Configure session middleware with proper domain handling  
const isDeployedApp = !!process.env.REPLIT_DOMAINS && process.env.NODE_ENV === 'production';
const isHTTPS = isDeployedApp; // True for Replit deployment, false for local development

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-for-development-only',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Extend session on activity
  cookie: {
    secure: isHTTPS, // HTTPS for deployed environments, HTTP for development
    httpOnly: true, // XSS protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: isHTTPS ? 'none' : 'lax', // 'none' for cross-origin deployed apps, 'lax' for local
    domain: isDeployedApp ? '.replit.app' : undefined, // Replit domain for deployed apps
  },
  name: 'fitscore.sid'
}));

console.log(`[SESSION] Configuration: HTTPS=${isHTTPS}, Deployed=${isDeployedApp}, SameSite=${isHTTPS ? 'none' : 'lax'}, Secure=${isHTTPS}, Domain=${isDeployedApp ? '.replit.app' : 'localhost'}`);

// Background token refresh service
function startTokenRefreshService() {
  console.log('[TOKEN SERVICE] Starting background token refresh service...');
  
  // Check and refresh tokens every 5 minutes
  const refreshTokens = async () => {
    try {
      const adminUser = await userService.getUserByEmail('admin@fitscore.local');
      if (adminUser) {
        await whoopApiService.getValidWhoopToken(adminUser.id);
        console.log('[TOKEN SERVICE] Token validation completed successfully');
      } else {
        console.log('[TOKEN SERVICE] Default admin user not found');
      }
    } catch (error) {
      console.log('[TOKEN SERVICE] Token validation failed, user may need to re-authenticate');
    }
  };

  // Run immediately and then every 5 minutes
  refreshTokens();
  setInterval(refreshTokens, 5 * 60 * 1000); // 5 minutes
}
// CORS configuration - must be before express.json()
app.use((req, res, next) => {
  // Allow credentials for session-based auth
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, (r: any) => {
    log(`serving on port ${port}`);
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
