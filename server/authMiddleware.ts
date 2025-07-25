import { Request, Response, NextFunction } from 'express';
import { userService } from './userService';
import { getCurrentUserId, requireJWTAuth } from './jwtAuth';

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

// WHOOP OAuth authentication middleware (JWT-based)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  return requireJWTAuth(req, res, next);
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

// Helper function to get current user ID (re-exported from jwtAuth for compatibility)
export { getCurrentUserId } from './jwtAuth';

// Helper function to get user role from JWT token
export function getUserRole(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { verifyJWT } = require('./jwtAuth');
    const payload = verifyJWT(token);
    
    return payload ? payload.role : null;
  }
  
  return null;
}

// Admin middleware - checks if user has admin role in JWT
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getCurrentUserId(req);
    const userRole = getUserRole(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (userRole !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required',
        message: 'This action requires administrator privileges'
      });
    }
    
    console.log(`[ADMIN] Admin access granted for user: ${userId}`);
    next();
  } catch (error) {
    console.error('Error in admin middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}