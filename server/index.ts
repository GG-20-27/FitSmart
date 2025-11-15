// CRITICAL: Load environment variables FIRST before any other imports
import "./loadEnv";

// Fallback for manual injection in Replit (optional safety net)
if (!process.env.N8N_SECRET_TOKEN) {
  process.env.N8N_SECRET_TOKEN = 'fitgpt-secret-2025';
  console.log('[INFO] Set default N8N_SECRET_TOKEN to: fitgpt-secret-2025');
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { whoopApiService } from "./whoopApiService";
import { userService } from "./userService";
import { jwtAuthMiddleware } from "./jwtAuth";

const app = express();

// CRITICAL: Trust proxy for Replit deployment
app.set('trust proxy', 1);

// JWT authentication middleware
app.use(jwtAuthMiddleware);

console.log(`[JWT] JWT-based authentication configured`);

// Background token refresh service
function startTokenRefreshService() {
  console.log('[TOKEN SERVICE] Starting background token refresh service...');
  
  // Check and refresh tokens every 5 minutes
  const refreshTokens = async () => {
    try {
      // Get admin WHOOP ID from environment
      const adminWhoopId = process.env.ADMIN_WHOOP_ID || '25283528';
      const adminUserId = `whoop_${adminWhoopId}`;
      
      // Try to find admin user by ID
      const adminUser = await userService.getUserById(adminUserId);
      if (adminUser) {
        await whoopApiService.getValidWhoopToken(adminUser.id);
        console.log('[TOKEN SERVICE] Token validation completed successfully for admin user');
      } else {
        console.log(`[TOKEN SERVICE] Admin user not found (ID: ${adminUserId}). User may need to authenticate via WHOOP OAuth first.`);
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
