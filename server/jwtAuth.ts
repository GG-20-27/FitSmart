import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret-for-development-only';

// JWT payload interface
interface JWTPayload {
  whoopId: string;
  role: string;
  exp: number;
}

// Generate JWT token for authenticated user
export function generateJWT(whoopId: string, role: string = 'user'): string {
  const payload: JWTPayload = {
    whoopId,
    role,
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  };
  
  return jwt.sign(payload, JWT_SECRET);
}

// Verify JWT token and return payload
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return payload;
  } catch (error) {
    console.log('[JWT] Token verification failed:', error.message);
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
      // Set userId on request for compatibility with existing code
      (req as any).userId = payload.whoopId;
      console.log(`[JWT] Authentication successful for user: ${payload.whoopId}`);
      return next();
    }
  }
  
  // No userId set - existing middleware will handle this
  console.log(`[JWT] No valid token found`);
  next();
}

// Get current user ID from request (compatible with existing getCurrentUserId function)
export function getCurrentUserId(req: Request): string | null {
  return (req as any).userId || null;
}

// JWT-based authentication middleware for protected routes
export function requireJWTAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getCurrentUserId(req);
  
  console.log(`[JWT AUTH] Checking authentication for path: ${req.path}, userId: ${userId}`);
  
  if (!userId) {
    console.log(`[JWT AUTH] No userId found, authentication required`);
    
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate with WHOOP to access this resource',
        redirect_url: '/api/whoop/login'
      });
    }
    
    // For page requests, redirect to WHOOP OAuth
    console.log(`[JWT AUTH] Redirecting page request to WHOOP OAuth login`);
    return res.redirect('/api/whoop/login');
  }
  
  console.log(`[JWT AUTH] Authentication successful for user: ${userId}`);
  next();
}