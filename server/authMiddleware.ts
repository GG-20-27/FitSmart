import { Request, Response, NextFunction } from 'express';
import { userService } from './userService';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        created_at: Date;
        updated_at: Date;
      };
    }
  }
}

// WHOOP OAuth authentication middleware (supports both session and token auth)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getCurrentUserId(req);
  
  console.log(`[AUTH MIDDLEWARE] Session check: sessionId=${req.sessionID}, userId=${userId}, sessionExists=${!!req.session}, path=${req.path}`);
  console.log(`[AUTH MIDDLEWARE] Full session:`, JSON.stringify(req.session, null, 2));
  
  if (!userId) {
    console.log(`[AUTH MIDDLEWARE] No userId in session, authentication required`);
    
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate with WHOOP to access this resource',
        redirect_url: '/api/whoop/login'
      });
    }
    
    // For page requests, redirect to WHOOP OAuth
    console.log(`[AUTH MIDDLEWARE] Redirecting page request to WHOOP OAuth login`);
    return res.redirect('/api/whoop/login');
  }
  
  console.log(`[AUTH MIDDLEWARE] Authentication successful for user: ${userId}`);
  next();
}

// Middleware to attach WHOOP user info to request if authenticated
export async function attachUser(req: Request, res: Response, next: NextFunction) {
  try {
    const whoopUserId = getCurrentUserId(req);
    
    if (whoopUserId) {
      // For WHOOP OAuth, we use the WHOOP user ID directly
      req.user = {
        id: whoopUserId,
        email: `whoop_user_${whoopUserId}@fitscore.local`,
        created_at: new Date(),
        updated_at: new Date()
      };
    }
    
    next();
  } catch (error) {
    console.error('Error attaching WHOOP user to request:', error);
    next();
  }
}

// Get current WHOOP user ID from request or return null
export function getCurrentUserId(req: Request): string | null {
  // First try session-based auth (fallback)
  const sessionUserId = req.session?.userId;
  if (sessionUserId) {
    return sessionUserId;
  }
  
  // Then try token-based auth (primary for OAuth)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    if (global.authTokens && global.authTokens.has(token)) {
      const tokenData = global.authTokens.get(token);
      if (tokenData.expiresAt > Date.now()) {
        console.log(`[AUTH] Valid token found: ${token} -> ${tokenData.userId}`);
        return tokenData.userId;
      } else {
        console.log(`[AUTH] Token expired: ${token}`);
        global.authTokens.delete(token);
      }
    }
  }
  
  // Try URL query parameter as fallback
  const req_any = req as any;
  const token = req_any.query?.token;
  if (token && global.authTokens && global.authTokens.has(token)) {
    const tokenData = global.authTokens.get(token);
    if (tokenData.expiresAt > Date.now()) {
      console.log(`[AUTH] Valid URL token found: ${token} -> ${tokenData.userId}`);
      return tokenData.userId;
    }
  }
  
  return null;
}

// Admin middleware - checks if user is admin
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getCurrentUserId(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await userService.getUserById(userId);
    if (!user || user.email !== 'admin@fitscore.local') {
      return res.status(403).json({ 
        error: 'Admin access required',
        message: 'This action requires administrator privileges'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in admin middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}