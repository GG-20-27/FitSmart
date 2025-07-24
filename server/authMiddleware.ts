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

// WHOOP OAuth session-based authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  
  console.log(`[AUTH MIDDLEWARE] Session check: sessionId=${req.sessionID}, userId=${userId}, sessionExists=${!!req.session}, fullSession=`, req.session);
  
  if (!userId) {
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate with WHOOP to access this resource'
      });
    }
    
    // For page requests, redirect to WHOOP OAuth
    return res.redirect('/api/whoop/login');
  }
  
  next();
}

// Middleware to attach WHOOP user info to request if authenticated
export async function attachUser(req: Request, res: Response, next: NextFunction) {
  try {
    const whoopUserId = req.session?.userId;
    
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
  return req.session?.userId || null;
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