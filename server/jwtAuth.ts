import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production.');
}
if (!process.env.JWT_SECRET) {
  console.warn('[JWT] ⚠️  JWT_SECRET not set — using insecure development fallback. Set JWT_SECRET before deploying.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret-for-development-only';

// JWT payload interface
interface JWTPayload {
  whoopId: string;      // internal userId — field name kept for backward compat
  role: string;
  dataSource: string;   // "whoop" | "manual"
  exp: number;
}

// Generate JWT token for authenticated user
export function generateJWT(userId: string, role: string = 'user', dataSource: string = 'whoop'): string {
  const payload: JWTPayload = {
    whoopId: userId, // field name kept for backward compat with existing tokens
    role,
    dataSource,
    exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years (set-and-forget)
  };

  return jwt.sign(payload, JWT_SECRET);
}

// Verify JWT token and return payload
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    // Backward compat: tokens issued before Phase 1 won't have dataSource
    if (!payload.dataSource) payload.dataSource = 'whoop';
    return payload;
  } catch (error: any) {
    console.log('[JWT] Token verification failed:', error?.message || 'Unknown error');
    return null;
  }
}

// Middleware to extract userId from JWT token
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyJWT(token);

    if (payload) {
      // Set userId, role, and dataSource on request
      (req as any).userId = payload.whoopId;
      (req as any).role = payload.role;
      (req as any).dataSource = payload.dataSource;
      console.log(`[JWT] Authentication successful for user: ${payload.whoopId}`);
      return next();
    }
  }

  // No userId set - existing middleware will handle this
  console.log(`[JWT] No valid token found`);
  next();
}

// Get current user ID from request
export function getCurrentUserId(req: Request): string | null {
  return (req as any).userId || null;
}

// Get data source from request (set by jwtAuthMiddleware)
export function getRequestDataSource(req: Request): 'whoop' | 'manual' {
  return (req as any).dataSource || 'whoop';
}

// JWT-based authentication middleware for protected routes
export function requireJWTAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyJWT(token);

    if (payload) {
      (req as any).userId = payload.whoopId;
      (req as any).role = payload.role;
      (req as any).dataSource = payload.dataSource;
      console.log(`[JWT AUTH] Extracted userId from token: ${payload.whoopId}`);
    }
  }

  const userId = getCurrentUserId(req);

  console.log(`[JWT AUTH] Checking authentication for path: ${req.path}, userId: ${userId}`);

  if (!userId) {
    console.log(`[JWT AUTH] No userId found, authentication required`);

    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
        redirect_url: '/api/whoop/login'
      });
    }

    console.log(`[JWT AUTH] Redirecting page request to WHOOP OAuth login`);
    return res.redirect('/api/whoop/login');
  }

  console.log(`[JWT AUTH] Authentication successful for user: ${userId}`);
  next();
}
