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

// Simple session-based authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
  
  next();
}

// Middleware to attach user to request if authenticated
export async function attachUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session?.userId;
    
    if (userId) {
      const user = await userService.getUserById(userId);
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    console.error('Error attaching user to request:', error);
    next();
  }
}

// Get current user ID from request or return null
export function getCurrentUserId(req: Request): string | null {
  return req.user?.id || req.session?.userId || null;
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