import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer, { type FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { z } from "zod";
import type { WhoopTodayResponse, MealResponse, ApiStatusResponse } from "@shared/schema";
import { whoopApiService } from "./whoopApiService";
import { whoopTokenStorage } from "./whoopTokenStorage";
import { userService } from "./userService";
import ical from "ical";
import { DateTime } from "luxon";
import axios from "axios";
import { requireAuth, attachUser, getCurrentUserId, requireAdmin } from './authMiddleware';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(file.originalname);
    cb(null, `meal_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage_multer,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper function to get default user ID for WHOOP OAuth testing
async function getDefaultUserId(): Promise<string> {
  // For WHOOP OAuth, we don't have a default admin user anymore
  // Return a test WHOOP user ID format for development
  return 'whoop_25283528';
}

// Fetch live WHOOP data using OAuth access token
async function fetchWhoopData(userId?: string): Promise<WhoopTodayResponse> {
  try {
    const actualUserId = userId || await getDefaultUserId();
    const data = await whoopApiService.today(actualUserId);
    return data;
  } catch (error) {
    console.error('Failed to fetch live WHOOP data:', error);
    throw error;
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Daily WHOOP data logging system
const historyFile = path.join(process.cwd(), 'data', 'userProfile.json');

function logDailyStats(entry: any) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(historyFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Read existing data or initialize empty array
    let allEntries: any[] = [];
    if (fs.existsSync(historyFile)) {
      const fileContent = fs.readFileSync(historyFile, 'utf8');
      allEntries = JSON.parse(fileContent) || [];
    }

    // Remove existing entry for the same date and add new one
    const updated = [...allEntries.filter(d => d.date !== entry.date), entry];
    
    // Write back to file
    fs.writeFileSync(historyFile, JSON.stringify(updated, null, 2));
    console.log('Daily WHOOP stats logged:', entry.date);
  } catch (error) {
    console.error('Failed to log daily stats:', error);
  }
}

function calculateAverages(days: number = 7): any {
  try {
    if (!fs.existsSync(historyFile)) {
      return { avg_recovery: null, avg_strain: null, avg_sleep: null, avg_hrv: null };
    }

    const fileContent = fs.readFileSync(historyFile, 'utf8');
    const allEntries = JSON.parse(fileContent) || [];
    
    // Get entries from the last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffString = cutoffDate.toISOString().split('T')[0];
    
    const recentEntries = allEntries
      .filter((entry: any) => entry.date >= cutoffString)
      .filter((entry: any) => entry.recovery_score !== null || entry.strain_score !== null || entry.sleep_score !== null || entry.hrv !== null);

    if (recentEntries.length === 0) {
      return { avg_recovery: null, avg_strain: null, avg_sleep: null, avg_hrv: null };
    }

    // Calculate averages
    const validRecovery = recentEntries.filter((e: any) => e.recovery_score !== null);
    const validStrain = recentEntries.filter((e: any) => e.strain_score !== null);
    const validSleep = recentEntries.filter((e: any) => e.sleep_score !== null);
    const validHrv = recentEntries.filter((e: any) => e.hrv !== null);

    return {
      avg_recovery: validRecovery.length > 0 ? Math.round(validRecovery.reduce((sum: number, e: any) => sum + e.recovery_score, 0) / validRecovery.length * 10) / 10 : null,
      avg_strain: validStrain.length > 0 ? Math.round(validStrain.reduce((sum: number, e: any) => sum + e.strain_score, 0) / validStrain.length * 10) / 10 : null,
      avg_sleep: validSleep.length > 0 ? Math.round(validSleep.reduce((sum: number, e: any) => sum + e.sleep_score, 0) / validSleep.length * 10) / 10 : null,
      avg_hrv: validHrv.length > 0 ? Math.round(validHrv.reduce((sum: number, e: any) => sum + e.hrv, 0) / validHrv.length * 10) / 10 : null
    };
  } catch (error) {
    console.error('Failed to calculate averages:', error);
    return { avg_recovery: null, avg_strain: null, avg_sleep: null, avg_hrv: null };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for all routes with pre-flight support
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  }));
  
  // Handle pre-flight requests for all routes
  app.options('*', cors());
  
  // Attach user to all requests (if authenticated)
  app.use(attachUser);

  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadsDir));

  // Log API examples on startup
  console.log('\n🚀 FitScore GPT API Endpoints:');
  console.log('📊 Health Check: GET /api/health');
  console.log('🔐 WHOOP Login: GET /api/whoop/login');
  console.log('🔄 WHOOP Callback: GET /api/whoop/callback');
  console.log('🏃 WHOOP Data: GET /api/whoop/today');
  console.log('📸 Upload Meals: POST /api/meals (field: mealPhotos)');
  console.log('🍽️ Today\'s Meals: GET /api/meals/today');
  console.log('📅 Calendar Today: GET /api/calendar/today');
  console.log('\n📝 Test with curl:');
  console.log('curl http://localhost:5000/api/health');
  console.log('curl http://localhost:5000/api/whoop/login');
  console.log('curl http://localhost:5000/api/whoop/today');
  console.log('curl http://localhost:5000/api/meals/today');
  console.log('curl http://localhost:5000/api/calendar/today');
  console.log('curl -F "mealPhotos=@image.jpg" http://localhost:5000/api/meals');
  console.log('');

  // Remove email/password authentication - redirect to WHOOP OAuth
  console.log('[ROUTE] GET /api/auth/login');
  app.get('/api/auth/login', (req, res) => {
    res.redirect('/api/whoop/login');
  });
  
  // Legacy POST login redirects to WHOOP OAuth
  console.log('[ROUTE] POST /api/auth/login');
  app.post('/api/auth/login', (req, res) => {
    res.redirect('/api/whoop/login');
  });


  console.log('[ROUTE] POST /api/auth/logout');
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ message: 'Logout successful' });
    });
  });

  console.log('[ROUTE] GET /api/auth/me');
  app.get('/api/auth/me', async (req, res) => {
    try {
      const whoopUserId = getCurrentUserId(req);
      console.log(`[AUTH ME] Checking authentication for session: ${req.sessionID}, userId: ${whoopUserId}`);
      console.log(`[AUTH ME] Headers:`, req.headers.authorization ? 'Bearer token present' : 'No bearer token');
      console.log(`[AUTH ME] URL query token:`, (req as any).query?.token ? 'URL token present' : 'No URL token');
      console.log(`[AUTH ME] Full session object:`, JSON.stringify(req.session, null, 2));
      console.log(`[AUTH ME] Session userId property:`, (req.session as any)?.userId);
      console.log(`[AUTH ME] Session exists:`, !!req.session);
      console.log(`[AUTH ME] Session keys:`, req.session ? Object.keys(req.session) : 'no session');
      
      if (!whoopUserId) {
        console.log(`[AUTH ME] No userId found in session or token - authentication required`);
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please authenticate with WHOOP to access this resource'
        });
      }
      
      // Verify user exists in database
      const user = await userService.getUserById(whoopUserId);
      if (!user) {
        console.log(`[AUTH ME] User ${whoopUserId} not found in database`);
        return res.status(404).json({ error: 'User not found' });
      }
      
      console.log(`[AUTH ME] Authentication successful for user: ${whoopUserId}`);
      res.json({
        id: whoopUserId,
        email: user.email || `${whoopUserId}@fitscore.local`,
        whoopUserId: user.whoopUserId || whoopUserId,
        created_at: user.createdAt || new Date()
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user information' });
    }
  });

  // Remove registration - users are created via WHOOP OAuth only
  console.log('[ROUTE] POST /api/auth/register');
  app.post('/api/auth/register', (req, res) => {
    res.redirect('/api/whoop/login');
  });

  // Admin routes for multi-user management (admin only)
  console.log('[ROUTE] POST /api/admin/users');
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const existingUser = await userService.getUserByEmail(email);
      if (existingUser) {
        return res.json({ message: 'User already exists', user: existingUser });
      }

      const user = await userService.createUser(email);
      res.json({ message: 'User created successfully', user });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  console.log('[ROUTE] GET /api/admin/users');
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = await userService.getAllUsers();
      const usersWithTokens = await Promise.all(
        users.map(async (user) => {
          const token = await userService.getWhoopToken(user.id);
          return {
            ...user,
            hasWhoopToken: !!token,
            tokenExpiry: token?.expiresAt || null
          };
        })
      );
      res.json(usersWithTokens);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  console.log('[ROUTE] POST /api/admin/users/:userId/whoop-token');
  app.post('/api/admin/users/:userId/whoop-token', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { accessToken, refreshToken, expiresAt } = req.body;
      
      if (!accessToken) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const expiry = expiresAt ? new Date(expiresAt * 1000) : undefined;
      await userService.addWhoopToken(userId, accessToken, refreshToken, expiry);
      
      res.json({ message: 'WHOOP token added successfully' });
    } catch (error) {
      console.error('Error adding WHOOP token:', error);
      res.status(500).json({ error: 'Failed to add WHOOP token' });
    }
  });

  console.log('[ROUTE] DELETE /api/admin/users/:userId');
  app.delete('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await userService.deleteUser(userId);
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Health check endpoint (moved from root to avoid conflicts with frontend)
  app.get('/api/health', async (req, res) => {
    try {
      const defaultUserId = await getDefaultUserId();
      const tokenData = await whoopTokenStorage.getToken(defaultUserId);
      const tokenStatus = tokenData?.access_token ? 'connected' : 'not connected';
      
      let expiryInfo = '';
      if (tokenData?.expires_at) {
        const expiryTime = new Date(tokenData.expires_at * 1000);
        const now = new Date();
        const timeUntilExpiry = expiryTime.getTime() - now.getTime();
        const hoursUntilExpiry = Math.round(timeUntilExpiry / (1000 * 60 * 60));
        
        if (hoursUntilExpiry > 0) {
          expiryInfo = ` (expires in ${hoursUntilExpiry} hours)`;
        } else {
          expiryInfo = ' (expired, auto-refresh active)';
        }
      }
      
      const response: ApiStatusResponse = {
        status: "success",
        message: `✅ FitScore GPT API is running - WHOOP: ${tokenStatus}${expiryInfo} - Auto-refresh: enabled`
      };
      res.json(response);
    } catch (error) {
      const response: ApiStatusResponse = {
        status: "success",
        message: "✅ FitScore GPT API is running - WHOOP: not connected - Auto-refresh: enabled"
      };
      res.json(response);
    }
  });

  // GET handler for browser testing of refresh-tokens endpoint
  app.get('/api/whoop/refresh-tokens', async (req, res) => {
    const authSecret = req.query.auth as string;
    const expectedSecret = process.env.N8N_SECRET_TOKEN || 'fitgpt-secret-2025';
    
    if (!authSecret || authSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({ 
      status: 'GET ok', 
      message: 'GET endpoint working - use POST for actual token refresh',
      auth_valid: true 
    });
  });

  // Bulk WHOOP token refresh endpoint for n8n automation
  app.post('/api/whoop/refresh-tokens', async (req, res) => {
    try {
      // Force JSON content type header
      res.setHeader('Content-Type', 'application/json');
      
      // Check authentication via query parameter
      const authSecret = req.query.auth as string;
      const expectedSecret = process.env.N8N_SECRET_TOKEN || 'fitgpt-secret-2025';
      
      if (!authSecret || authSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      console.log('[TOKEN REFRESH] Starting bulk token refresh process...');
      
      // Get all WHOOP tokens from database
      const allTokens = await whoopTokenStorage.getAllTokens();
      console.log(`[TOKEN REFRESH] Found ${allTokens.length} tokens to check`);
      
      if (allTokens.length === 0) {
        return res.json({
          message: 'No WHOOP tokens found in database',
          updated_users: [],
          total_checked: 0,
          total_refreshed: 0
        });
      }
      
      const updatedUsers: string[] = [];
      let totalChecked = 0;
      let totalRefreshed = 0;
      
      for (const token of allTokens) {
        totalChecked++;
        
        try {
          // Check if token is expired or expires soon (within 1 hour)
          const currentTime = Math.floor(Date.now() / 1000);
          const expiresAt = token.expiresAt ? Math.floor(token.expiresAt.getTime() / 1000) : null;
          
          if (!expiresAt) {
            console.log(`[TOKEN REFRESH] Token for user ${token.userId} has no expiry time, skipping`);
            continue;
          }
          
          // Refresh if expired or expires within 1 hour (3600 seconds)
          const needsRefresh = (expiresAt - currentTime) <= 3600;
          
          if (!needsRefresh) {
            const hoursUntilExpiry = Math.round((expiresAt - currentTime) / 3600);
            console.log(`[TOKEN REFRESH] Token for user ${token.userId} expires in ${hoursUntilExpiry} hours, not refreshing`);
            continue;
          }
          
          if (!token.refreshToken) {
            console.log(`[TOKEN REFRESH] Token for user ${token.userId} is expired but has no refresh token`);
            continue;
          }
          
          console.log(`[TOKEN REFRESH] Refreshing token for user ${token.userId}...`);
          
          // Attempt to refresh the token
          const newToken = await whoopTokenStorage.refreshWhoopToken(token.userId, token.refreshToken);
          
          if (newToken) {
            updatedUsers.push(token.userId);
            totalRefreshed++;
            console.log(`[TOKEN REFRESH] Successfully refreshed token for user ${token.userId}`);
          } else {
            console.log(`[TOKEN REFRESH] Failed to refresh token for user ${token.userId}`);
          }
          
        } catch (error) {
          console.error(`[TOKEN REFRESH] Error processing token for user ${token.userId}:`, error);
        }
      }
      
      // Always return JSON regardless of content negotiation
      res.setHeader('Content-Type', 'application/json');
      
      const result = {
        message: `Bulk token refresh completed. Checked ${totalChecked} tokens, refreshed ${totalRefreshed}`,
        updated_users: updatedUsers,
        total_checked: totalChecked,
        total_refreshed: totalRefreshed,
        timestamp: new Date().toISOString()
      };
      
      console.log('[TOKEN REFRESH] Bulk refresh completed:', result);
      res.json(result);
      
    } catch (error) {
      console.error('[TOKEN REFRESH] Bulk refresh failed:', error);
      res.status(500).json({ 
        error: 'Failed to refresh tokens',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // WHOOP OAuth login endpoint
  app.get('/api/whoop/login', (req, res) => {
    try {
      const oauthUrl = whoopApiService.getOAuthUrl();
      console.log('Redirecting to WHOOP OAuth:', oauthUrl);
      res.redirect(oauthUrl);
    } catch (error) {
      console.error('Failed to initiate WHOOP OAuth:', error);
      res.status(500).json({ error: 'Failed to initiate WHOOP authentication' });
    }
  });

  // WHOOP OAuth callback endpoint
  app.get('/api/whoop/callback', async (req, res) => {
    try {
      console.log('WHOOP OAuth callback received');
      console.log('Query params:', req.query);
      
      const { code, error, state } = req.query;
      
      if (error) {
        console.error('WHOOP OAuth error received:', error);
        return res.status(400).json({ 
          error: 'OAuth authentication failed',
          details: error 
        });
      }

      if (!code) {
        console.error('No authorization code received in callback');
        return res.status(400).json({ 
          error: 'No authorization code received',
          received_params: Object.keys(req.query)
        });
      }

      // Validate state parameter (basic validation - starts with our prefix)
      if (!state || !state.toString().startsWith('whoop_auth_')) {
        console.error('Invalid or missing state parameter:', state);
        return res.status(400).json({ 
          error: 'Invalid state parameter',
          details: 'OAuth state validation failed'
        });
      }

      console.log('[WHOOP AUTH] Valid authorization code received, proceeding with token exchange...');
      console.log('[WHOOP AUTH] Authorization code:', code.toString().substring(0, 20) + '...');
      
      const tokenResponse = await whoopApiService.exchangeCodeForToken(code as string);
      console.log('[WHOOP AUTH] Token exchange successful, access_token length:', tokenResponse.access_token?.length || 'missing');
      
      // Get user profile to obtain WHOOP user ID
      console.log('[WHOOP AUTH] Fetching user profile to get WHOOP ID...');
      const userProfile = await whoopApiService.getUserProfile(tokenResponse.access_token);
      const whoopUserId = `whoop_${userProfile.user_id}`;
      
      console.log(`[WHOOP AUTH] WHOOP User ID obtained: ${whoopUserId} (original: ${userProfile.user_id})`);
      console.log(`[WHOOP AUTH] Full user profile:`, JSON.stringify(userProfile, null, 2));
      
      // Create or get user in database
      const userEmail = `${whoopUserId}@fitscore.local`;
      const userData = {
        id: whoopUserId,
        email: userEmail,
        whoopUserId: userProfile.user_id.toString()
      };
      
      // Insert or update user in database with detailed logging
      console.log(`[WHOOP AUTH] Attempting to upsert user:`, userData);
      try {
        await db.insert(users).values(userData).onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            whoopUserId: userData.whoopUserId,
            updatedAt: new Date()
          }
        });
        console.log(`[WHOOP AUTH] User upserted successfully in database: ${whoopUserId}`);
      } catch (userError) {
        console.error(`[WHOOP AUTH] User upsert failed:`, userError);
        throw new Error(`Failed to create user: ${userError.message}`);
      }
      
      // Verify user exists before creating token
      const existingUser = await db.select().from(users).where(eq(users.id, whoopUserId)).limit(1);
      if (existingUser.length === 0) {
        throw new Error(`User verification failed - user ${whoopUserId} not found after upsert`);
      }
      console.log(`[WHOOP AUTH] User verified in database: ${whoopUserId}`);
      
      // Store the token with proper expiration using WHOOP user ID
      const tokenData = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in : undefined,
        user_id: whoopUserId
      };
      
      console.log(`[WHOOP AUTH] Attempting to store token for user: ${whoopUserId}`);
      try {
        await whoopTokenStorage.setToken(whoopUserId, tokenData);
        console.log(`[WHOOP AUTH] Token stored successfully for WHOOP user ${whoopUserId}`);
      } catch (tokenError) {
        console.error(`[WHOOP AUTH] Token storage failed:`, tokenError);
        throw new Error(`Failed to store token: ${tokenError.message}`);
      }
      console.log(`[WHOOP AUTH] Token stored for WHOOP user ${whoopUserId} with expiration:`, tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : 'no expiration');
      
      // Regenerate session for security and force cookie refresh
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            console.error('[WHOOP AUTH] Session regeneration error:', err);
            reject(new Error(`Session regeneration failed: ${err.message}`));
            return;
          }
          
          // Set session using WHOOP user ID after regeneration
          const session = req.session as any;
          session.userId = whoopUserId;
          
          console.log(`[WHOOP AUTH] Session regenerated and userId set to: ${whoopUserId}`);
          console.log(`[WHOOP AUTH] New Session ID: ${req.sessionID}`);
          console.log(`[WHOOP AUTH] Session before save:`, JSON.stringify(session, null, 2));
          
          resolve();
        });
      });
      
      // Save session synchronously and verify database persistence
      await new Promise<void>((resolve, reject) => {
        req.session.save(async (err) => {
          if (err) {
            console.error('[WHOOP AUTH] Session save error:', err);
            reject(new Error(`Session save failed: ${err.message}`));
            return;
          }
          
          console.log(`[WHOOP AUTH] Session saved successfully for WHOOP user ${whoopUserId}`);
          console.log(`[WHOOP AUTH] Session after save:`, JSON.stringify(req.session, null, 2));
          console.log(`[WHOOP AUTH] Session userId verification:`, (req.session as any).userId);
          console.log(`[WHOOP AUTH] Session ID: ${req.sessionID}`);
          
          // Verify session was saved to database
          try {
            const { Client } = require('pg');
            const client = new Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();
            const result = await client.query('SELECT sess FROM sessions WHERE sid = $1', [req.sessionID]);
            await client.end();
            
            if (result.rows.length > 0) {
              const savedSession = result.rows[0].sess;
              console.log(`[WHOOP AUTH] ✅ Session verified in database:`, JSON.stringify(savedSession, null, 2));
              console.log(`[WHOOP AUTH] ✅ Database userId:`, savedSession.userId);
            } else {
              console.error(`[WHOOP AUTH] ❌ Session NOT found in database with ID: ${req.sessionID}`);
            }
          } catch (dbError) {
            console.error(`[WHOOP AUTH] Database verification error:`, dbError);
          }
          
          resolve();
        });
      });
      
      // RADICAL NEW APPROACH: Skip sessions entirely, use URL-based auth token
      // Instead of manual tokens, let's try the fundamental fix: set session and redirect immediately
      console.log(`[WHOOP AUTH] Setting session userId directly and redirecting...`);
      
      // Set session with user ID
      (req.session as any).userId = whoopUserId;
      req.session.save((err) => {
        if (err) {
          console.error(`[WHOOP AUTH] Session save error:`, err);
          return res.status(500).send('Authentication failed - session save error');
        }
        
        console.log(`[WHOOP AUTH] Session saved successfully. Redirecting to dashboard.`);
        console.log(`[WHOOP AUTH] Session ID: ${req.sessionID}, User ID: ${whoopUserId}`);
        
        // Redirect to dashboard immediately after session save
        res.redirect('/');
      });
      return;
      
      // OLD SUCCESS PAGE CODE (keeping as backup)
      const successHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>WHOOP Authentication Successful</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; padding: 40px; background: #0f172a; color: white; text-align: center; }
                .success { background: #059669; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .redirect-info { background: #1e293b; padding: 15px; border-radius: 8px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="success">
                <h1>✅ WHOOP Authentication Successful!</h1>
                <p>User ID: ${whoopUserId}</p>
                <p>Session ID: ${req.sessionID}</p>
              </div>
              <div class="redirect-info">
                <p>Redirecting to dashboard in 3 seconds...</p>
                <p>Testing session persistence...</p>
                <div id="session-test"></div>
              </div>
              <script>
                console.log('[WHOOP AUTH] Authentication successful, redirecting to dashboard');
                console.log('[WHOOP AUTH] Session details:', { userId: '${whoopUserId}', sessionId: '${req.sessionID}' });
                console.log('[WHOOP AUTH] Document cookies:', document.cookie);
                
                // Test session persistence before redirect
                async function testSession() {
                  try {
                    console.log('[WHOOP AUTH] Testing session with fetch request...');
                    console.log('[WHOOP AUTH] Current document cookies:', document.cookie);
                    
                    // Use token-based auth instead of cookies
                    const urlParams = new URLSearchParams(window.location.search);
                    const authToken = urlParams.get('token') || '${authToken}';
                    console.log('[WHOOP AUTH] Using auth token:', authToken);
                    
                    const response = await fetch('/api/auth/me', {
                      credentials: 'include',
                      headers: { 
                        'Accept': 'application/json',
                        'Authorization': 'Bearer ' + authToken,
                        'Cache-Control': 'no-cache'
                      }
                    });
                    
                    const testDiv = document.getElementById('session-test');
                    if (response.ok) {
                      const userData = await response.json();
                      console.log('[WHOOP AUTH] Session test successful:', userData);
                      testDiv.innerHTML = '<p style="color: #10b981;">✅ Session verified - redirecting...</p>';
                      // Redirect after successful session verification - use location.href for proper navigation
                      setTimeout(() => window.location.href = '/?token=' + authToken, 1500);
                    } else {
                      const errorText = await response.text();
                      console.error('[WHOOP AUTH] Session test failed:', response.status, errorText);
                      testDiv.innerHTML = \`<p style="color: #ef4444;">❌ Session test failed (\${response.status}) - retrying OAuth...</p>\`;
                      
                      // Try debugging the session state
                      console.log('[WHOOP AUTH] Debugging session state...');
                      try {
                        const debugResponse = await fetch('/api/session/debug', {
                          credentials: 'include',
                          headers: { 'Accept': 'application/json' }
                        });
                        const debugData = await debugResponse.json();
                        console.log('[WHOOP AUTH] Session debug data:', debugData);
                        testDiv.innerHTML += \`<br><small>Debug: Session ID \${debugData.sessionId || 'none'}, User ID: \${debugData.userId || 'none'}</small>\`;
                      } catch (debugError) {
                        console.error('[WHOOP AUTH] Debug request failed:', debugError);
                      }
                      
                      setTimeout(() => window.location.href = '/api/whoop/login', 3000);
                    }
                  } catch (error) {
                    console.error('[WHOOP AUTH] Session test error:', error);
                    document.getElementById('session-test').innerHTML = '<p style="color: #ef4444;">❌ Connection error</p>';
                  }
                }
                
                // Wait 3 seconds to ensure cookie is set, then test session before redirect
                setTimeout(testSession, 3000);
              </script>
            </body>
          </html>
        `;
      
      // This code is now unreachable due to direct redirect above
      // res.send(successHtml);
      
    } catch (error) {
      console.error('[WHOOP AUTH] Callback error:', error);
      
      // Check if it's a token exchange error (common with expired/used auth codes)
      if (error.message?.includes('invalid_grant') || error.message?.includes('HTTP 400') || error.message?.includes('request_forbidden')) {
        console.log('[WHOOP AUTH] OAuth error detected:', error.message);
        console.log('[WHOOP AUTH] This usually means the authorization code was expired, used, or invalid');
        console.log('[WHOOP AUTH] Redirecting user to retry OAuth flow with fresh authorization code');
        
        // Return error page with retry option instead of automatic redirect
        const retryHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>WHOOP Authentication Error</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; padding: 40px; background: #0f172a; color: white; text-align: center; }
                .error { background: #dc2626; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .retry-info { background: #1e293b; padding: 15px; border-radius: 8px; margin: 20px 0; }
                .retry-btn { background: #3b82f6; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
                .retry-btn:hover { background: #2563eb; }
              </style>
            </head>
            <body>
              <div class="error">
                <h1>⚠️ WHOOP Authentication Error</h1>
                <p>Error: ${error.message}</p>
                <p>This usually happens when the authorization code expires or is used more than once.</p>
              </div>
              <div class="retry-info">
                <p>Please try authenticating again with a fresh authorization code.</p>
                <button class="retry-btn" onclick="window.location.href='/api/whoop/login'">
                  🔄 Retry WHOOP Authentication
                </button>
              </div>
              <script>
                console.error('[WHOOP AUTH] OAuth error:', '${error.message}');
              </script>
            </body>
          </html>
        `;
        
        return res.status(400).send(retryHtml);
      }
      
      // Return HTML error page for popup
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>WHOOP Authentication Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 18px; margin-bottom: 20px; }
              .message { color: #6b7280; }
              .retry { margin-top: 20px; }
              .retry a { color: #3b82f6; text-decoration: none; font-weight: bold; }
              .retry { margin-top: 20px; }
              .retry a { color: #3b82f6; text-decoration: none; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="error">❌ Authentication Failed</div>
            <div class="message">WHOOP authentication encountered an error: ${error instanceof Error ? error.message : 'An error occurred during authentication'}</div>
            <div class="retry">
              <a href="/api/whoop/login">🔄 Try Again</a>
            </div>
            <div class="message">This window will close automatically...</div>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.status(500).send(html);
    }
  });

  // WHOOP authentication status endpoint
  app.get('/api/whoop/status', requireAuth, async (req, res) => {
    // Disable caching for this endpoint
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    try {
      const userId = getCurrentUserId(req);
      const tokenData = await whoopTokenStorage.getToken(userId!);
      
      if (!tokenData) {
        return res.json({
          authenticated: false,
          message: 'No WHOOP token found',
          auth_url: '/api/whoop/login'
        });
      }

      const isValid = whoopTokenStorage.isTokenValid(tokenData);
      
      if (!isValid) {
        return res.json({
          authenticated: false,
          message: 'WHOOP token has expired',
          auth_url: '/api/whoop/login',
          expires_at: tokenData.expires_at
        });
      }

      // Test the token against the WHOOP API to make sure it's actually valid
      try {
        const headers = { Authorization: `Bearer ${tokenData.access_token}` };
        console.log('[TOKEN TEST] Testing token against WHOOP API...');
        const testResponse = await axios.get('https://api.prod.whoop.com/developer/v1/user/profile/basic', { 
          headers,
          timeout: 5000
        });
        
        console.log('[TOKEN TEST] Token test successful, status:', testResponse.status);
        res.json({
          authenticated: true,
          message: 'WHOOP token is valid',
          auth_url: null,
          expires_at: tokenData.expires_at
        });
      } catch (tokenError: any) {
        // Token appears valid but fails API validation
        console.error('[TOKEN TEST] Token validation failed:', tokenError.response?.status || tokenError.message);
        res.json({
          authenticated: false,
          message: 'WHOOP token is invalid or expired',
          auth_url: '/api/whoop/login',
          expires_at: tokenData.expires_at
        });
      }
    } catch (error) {
      console.error('Error checking WHOOP status:', error);
      res.status(500).json({ error: 'Failed to check WHOOP authentication status' });
    }
  });

  // Debug endpoint to test OAuth URL generation
  app.get('/api/whoop/debug', async (req, res) => {
    try {
      const oauthUrl = whoopApiService.getOAuthUrl();
      const defaultUserId = await getDefaultUserId();
      const tokenData = await whoopTokenStorage.getToken(defaultUserId);
      res.json({
        oauth_url: oauthUrl,
        client_id: process.env.WHOOP_CLIENT_ID,
        redirect_uri: 'https://health-data-hub.replit.app/api/whoop/callback',
        status: 'OAuth flow ready',
        has_token: !!tokenData,
        token_valid: tokenData ? whoopTokenStorage.isTokenValid(tokenData) : false
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }
  });

  // Test endpoint to manually create session (for debugging authentication)
  app.post('/api/whoop/test-session', async (req, res) => {
    try {
      const { user_id } = req.body;
      
      if (!user_id) {
        return res.status(400).json({ error: 'user_id required' });
      }
      
      const whoopUserId = `whoop_${user_id}`;
      
      // Set session manually for testing
      const session = req.session as any;
      session.userId = whoopUserId;
      
      console.log(`[TEST SESSION] Setting session userId to: ${whoopUserId}`);
      console.log(`[TEST SESSION] Session before save:`, session);
      
      // Save session and return success
      req.session.save((err) => {
        if (err) {
          console.error('[TEST SESSION] Session save error:', err);
          return res.status(500).json({ error: 'Session creation failed' });
        }
        
        console.log(`[TEST SESSION] Session saved successfully for WHOOP user ${whoopUserId}`);
        console.log(`[TEST SESSION] Session after save:`, req.session);
        
        // Force session modification and save
        req.session.touch();
        (req.session as any).modified = true;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('[TEST SESSION] Session save failed:', saveErr);
            return res.status(500).json({ error: 'Session save failed' });
          }
          
          // Manually set the Set-Cookie header for testing
          const cookieName = 'fitscore.sid';
          const cookieValue = req.sessionID;
          const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DOMAINS;
          const isReplotDeployment = !!process.env.REPLIT_DOMAINS;
          
          let cookieHeader = `${cookieName}=${cookieValue}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}`;
          
          if (isProduction) {
            cookieHeader += '; Secure; SameSite=None';
          } else {
            cookieHeader += '; SameSite=Lax';
          }
          
          if (isReplotDeployment) {
            cookieHeader += '; Domain=.replit.app';
          }
          
          res.setHeader('Set-Cookie', cookieHeader);
          console.log(`[TEST SESSION] Manually set Set-Cookie header: ${cookieHeader}`);
          console.log(`[TEST SESSION] Session saved successfully with cookie transmission`);
          
          res.json({ 
            message: 'Test session created successfully',
            userId: whoopUserId,
            sessionId: req.sessionID,
            cookieSet: true
          });
        });

      });
      
    } catch (error) {
      console.error('Error creating test session:', error);
      res.status(500).json({ error: 'Failed to create test session' });
    }
  });

  // Session debugging endpoint
  console.log('[ROUTE] GET /api/session/debug');
  app.get('/api/session/debug', (req, res) => {
    const userId = getCurrentUserId(req);
    res.json({
      sessionId: req.sessionID,
      userId: userId,
      sessionExists: !!req.session,
      sessionKeys: req.session ? Object.keys(req.session) : [],
      cookies: req.headers.cookie,
      timestamp: new Date().toISOString()
    });
  });

  // Test endpoint to manually set a WHOOP token for debugging
  app.post('/api/whoop/test-token', async (req, res) => {
    try {
      const { access_token, refresh_token, expires_in, user_id } = req.body;
      
      if (!access_token || !user_id) {
        return res.status(400).json({ 
          error: 'Missing required fields: access_token and user_id are required' 
        });
      }
      
      // Use the user_id from request to format as WHOOP user ID
      const whoopUserId = `whoop_${user_id}`;
      
      // First ensure the user exists in the database
      try {
        const userData = {
          id: whoopUserId,
          email: `${whoopUserId}@fitscore.local`,
          whoopUserId: user_id.toString()
        };
        
        await db.insert(users).values(userData).onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            whoopUserId: userData.whoopUserId,
            updatedAt: new Date()
          }
        });
        
        console.log(`Test user created/updated: ${whoopUserId}`);
      } catch (userError) {
        console.error('Failed to create test user:', userError);
        return res.status(500).json({ error: 'Failed to create test user' });
      }
      
      await whoopTokenStorage.setToken(whoopUserId, {
        access_token: access_token,
        refresh_token: refresh_token,
        expires_at: expires_in ? Math.floor(Date.now() / 1000) + expires_in : Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        user_id: whoopUserId
      });

      res.json({ 
        message: 'Test token stored successfully',
        status: 'authenticated'
      });
    } catch (error) {
      console.error('Error setting test token:', error);
      res.status(500).json({ error: 'Failed to set test token' });
    }
  });

  // WHOOP data endpoint - now uses live API data
  app.get('/api/whoop/today', requireAuth, async (req, res) => {
    try {
      console.log('Fetching live WHOOP data for today...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      console.log(`Fetching WHOOP data for user: ${userId}`);
      
      // Token validation using user-specific token
      const tokenData = await whoopTokenStorage.getToken(userId);
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token for user' });
      }

      if (!whoopTokenStorage.isTokenValid(tokenData)) {
        console.warn('WHOOP access token has expired. Re-authentication required.');
        return res.status(401).json({ 
          error: 'WHOOP token expired',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      // Fetch real WHOOP data using user-specific authentication
      const whoopData = await whoopApiService.getTodaysData(userId);
      
      // Store in database for caching with correct user_id
      const todayDate = getTodayDate();
      await storage.createOrUpdateWhoopData({
        userId: userId,
        date: todayDate,
        recoveryScore: Math.round(whoopData.recovery_score || 0),
        sleepScore: Math.round(whoopData.sleep_score || 0),
        strainScore: Math.round((whoopData.strain || 0) * 10), // Store as integer * 10
        restingHeartRate: Math.round(whoopData.resting_heart_rate || 0)
      });

      // Log daily stats to userProfile.json
      const dailyEntry = {
        date: todayDate,
        recovery_score: whoopData.recovery_score,
        strain_score: whoopData.strain,
        sleep_score: whoopData.sleep_score,
        hrv: whoopData.hrv
      };
      logDailyStats(dailyEntry);

      // Return the new response format as specified
      const result = {
        cycle_id: whoopData.cycle_id,
        strain: whoopData.strain,
        recovery_score: whoopData.recovery_score,
        hrv: whoopData.hrv,
        resting_heart_rate: whoopData.resting_heart_rate,
        sleep_hours: whoopData.sleep_hours,
        raw: whoopData.raw
      };

      console.log('WHOOP data retrieved successfully');
      res.json(result);
    } catch (error: any) {
      console.error('Error in /api/whoop/today:', error.message);
      
      // Log non-200 responses clearly for debugging
      if (error.response) {
        console.error('WHOOP API Error Response:', {
          status: error.response.status,
          data: error.response.data,
          endpoint: error.config?.url
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch WHOOP data',
        details: error.message
      });
    }
  });

  // Secure WHOOP data endpoint for n8n automation
  app.get('/api/whoop/n8n', async (req, res) => {
    const token = req.headers['authorization'];

    // Check for secret token passed by n8n
    if (token !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
      return res.status(403).json({ error: 'Unauthorized: Invalid token' });
    }

    try {
      console.log('[N8N ENDPOINT] Fetching WHOOP data for n8n automation...');
      
      // Use the enhanced token validation that includes automatic refresh
      const defaultUserId = await getDefaultUserId();
      const whoopData = await whoopApiService.getTodaysData(defaultUserId);
      
      // Store in database for caching
      const todayDate = getTodayDate();
      await storage.createOrUpdateWhoopData({
        date: todayDate,
        recoveryScore: Math.round(whoopData.recovery_score || 0),
        sleepScore: Math.round(whoopData.sleep_hours || 0), // Fixed: use sleep_hours instead of sleep_score
        strainScore: Math.round((whoopData.strain || 0) * 10), // Store as integer * 10
        restingHeartRate: Math.round(whoopData.resting_heart_rate || 0)
      });

      // Log daily stats to userProfile.json
      const dailyEntry = {
        date: todayDate,
        recovery_score: whoopData.recovery_score,
        strain_score: whoopData.strain,
        sleep_hours: whoopData.sleep_hours,
        hrv: whoopData.hrv
      };
      logDailyStats(dailyEntry);

      // Return the response format optimized for n8n
      const result = {
        cycle_id: whoopData.cycle_id,
        strain: whoopData.strain,
        recovery_score: whoopData.recovery_score,
        hrv: whoopData.hrv,
        resting_heart_rate: whoopData.resting_heart_rate,
        sleep_hours: whoopData.sleep_hours,
        date: todayDate,
        timestamp: new Date().toISOString(),
        raw: whoopData.raw
      };

      console.log('[N8N ENDPOINT] WHOOP data retrieved successfully for n8n');
      res.json(result);
    } catch (error: any) {
      console.error('[N8N ENDPOINT] n8n WHOOP fetch failed:', error.message);
      
      // Check if it's a token-related error and provide helpful message
      if (error.message.includes('token') || error.message.includes('access')) {
        return res.status(401).json({ 
          error: 'WHOOP authentication failed',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch WHOOP data',
        message: error.message
      });
    }
  });

  // Token refresh test endpoint
  app.post('/api/whoop/test-token-refresh', async (req, res) => {
    try {
      console.log('[TOKEN REFRESH TEST] Starting token refresh test...');
      
      // Get current token
      const defaultUserId = await getDefaultUserId();
      const currentToken = await whoopTokenStorage.getToken(defaultUserId);
      if (!currentToken) {
        return res.status(401).json({ error: 'No token found to test' });
      }

      console.log('[TOKEN REFRESH TEST] Current token expires at:', currentToken.expires_at);
      console.log('[TOKEN REFRESH TEST] Current time:', Math.floor(Date.now() / 1000));
      console.log('[TOKEN REFRESH TEST] Token valid:', whoopTokenStorage.isTokenValid(currentToken));
      
      // Simulate token expiration by temporarily setting expires_at to past
      if (currentToken.expires_at) {
        const expiredToken = {
          ...currentToken,
          expires_at: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        };
        
        await whoopTokenStorage.setToken(defaultUserId, expiredToken);
        console.log('[TOKEN REFRESH TEST] Token manually expired for testing');
      }
      
      // Test the automatic refresh via getValidWhoopToken
      try {
        const refreshedToken = await whoopApiService.getValidWhoopToken(defaultUserId);
        console.log('[TOKEN REFRESH TEST] Token refresh successful');
        
        res.json({
          success: true,
          message: 'Token refresh test completed successfully',
          original_expires_at: currentToken.expires_at,
          new_expires_at: refreshedToken.expires_at,
          refresh_worked: true
        });
      } catch (refreshError: any) {
        console.error('[TOKEN REFRESH TEST] Token refresh failed:', refreshError.message);
        
        // Restore original token
        await whoopTokenStorage.setToken(defaultUserId, currentToken);
        
        res.json({
          success: false,
          message: 'Token refresh failed',
          error: refreshError.message,
          refresh_worked: false,
          reason: refreshError.message.includes('refresh token') ? 'No refresh token available' : 'Refresh API failed'
        });
      }
    } catch (error: any) {
      console.error('[TOKEN REFRESH TEST] Test failed:', error.message);
      res.status(500).json({ 
        error: 'Token refresh test failed',
        message: error.message
      });
    }
  });

  // WHOOP weekly averages endpoint
  app.get('/api/whoop/weekly', requireAuth, async (req, res) => {
    try {
      console.log('Fetching weekly WHOOP averages...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Token validation using user-specific token
      const tokenData = await whoopTokenStorage.getToken(userId);
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token for user' });
      }

      if (!whoopTokenStorage.isTokenValid(tokenData)) {
        console.warn('WHOOP access token has expired. Re-authentication required.');
        return res.status(401).json({ 
          error: 'WHOOP token expired',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      const weeklyData = await whoopApiService.getWeeklyAverages(userId);
      
      console.log('Weekly WHOOP averages retrieved successfully');
      res.json(weeklyData);
    } catch (error: any) {
      console.error('Error in /api/whoop/weekly:', error.message);
      
      if (error.response) {
        console.error('WHOOP API Error Response:', {
          status: error.response.status,
          data: error.response.data,
          endpoint: error.config?.url
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch weekly WHOOP averages',
        details: error.message
      });
    }
  });

  // WHOOP summary analytics endpoint
  app.get('/api/whoop/summary', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      
      // Validate days parameter
      if (days < 1 || days > 365) {
        return res.status(400).json({ 
          error: 'Invalid days parameter. Must be between 1 and 365.' 
        });
      }

      const averages = calculateAverages(days);
      
      console.log(`WHOOP summary calculated for last ${days} days:`, averages);
      
      res.json({
        period_days: days,
        ...averages
      });
    } catch (error: any) {
      console.error('Error in /api/whoop/summary:', error.message);
      res.status(500).json({ 
        error: 'Failed to calculate WHOOP summary',
        details: error.message
      });
    }
  });

  // Meal upload endpoint
  app.post('/api/meals', upload.array('mealPhotos', 10), async (req: Request, res: Response) => {
    try {
      console.log('Processing meal uploads...');
      
      const files = req.files as Express.Multer.File[];
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      
      const today = getTodayDate();
      const uploadedMeals = [];
      
      for (const file of files) {
        const meal = await storage.createMeal({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          date: today
        });
        uploadedMeals.push(meal);
      }
      
      console.log(`Uploaded ${uploadedMeals.length} meal images`);
      res.json({ 
        message: `Successfully uploaded ${uploadedMeals.length} meal images`,
        meals: uploadedMeals 
      });
    } catch (error) {
      console.error('Error uploading meals:', error);
      res.status(500).json({ error: 'Failed to upload meal images' });
    }
  });

  // Get today's meals endpoint
  app.get('/api/meals/today', async (req, res) => {
    try {
      console.log('Fetching today\'s meals...');
      
      const today = getTodayDate();
      const meals = await storage.getMealsByDate(today);
      
      // Return full URLs including domain
      const baseUrl = req.protocol + '://' + req.get('host');
      const mealUrls = meals.map(meal => `${baseUrl}/uploads/${meal.filename}`);
      
      console.log(`Found ${meals.length} meals for today`);
      res.json(mealUrls);
    } catch (error) {
      console.error('Error fetching meals:', error);
      res.status(500).json({ error: 'Failed to fetch today\'s meals' });
    }
  });

  // Get all meals (for dashboard)
  app.get('/api/meals', async (req, res) => {
    try {
      const meals = await storage.getAllMeals();
      res.json(meals);
    } catch (error) {
      console.error('Error fetching all meals:', error);
      res.status(500).json({ error: 'Failed to fetch meals' });
    }
  });

  // User-specific calendar today's events endpoint
  app.get('/api/calendar/today', requireAuth, async (req, res) => {
    try {
      console.log('Fetching today\'s calendar events...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Get user's calendars from database
      const userCalendars = await storage.getUserCalendars(userId);
      
      if (userCalendars.length === 0) {
        return res.json({
          date: DateTime.now().setZone('Europe/Zurich').toISODate(),
          events: [],
          message: 'No calendars configured. Add a calendar in your profile to see events.'
        });
      }
      
      const calendarUrls = userCalendars
        .filter(cal => cal.isActive)
        .map(cal => cal.calendarUrl);
      
      // Use Europe/Zurich timezone for accurate date/time handling
      const zurichTime = DateTime.now().setZone('Europe/Zurich');
      const todayStart = zurichTime.startOf('day');
      const todayEnd = zurichTime.endOf('day');
      
      const allEvents: any[] = [];
      
      // Fetch and parse each calendar
      for (const calendarUrl of calendarUrls) {
        try {
          console.log(`Fetching calendar from: ${calendarUrl}`);
          const response = await fetch(calendarUrl);
          
          if (!response.ok) {
            console.error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
            continue;
          }
          
          const icsData = await response.text();
          const parsedCal = ical.parseICS(icsData);
          
          // Filter events for today
          Object.keys(parsedCal).forEach(key => {
            const event = parsedCal[key];
            
            if (event.type === 'VEVENT' && event.start && event.summary) {
              // Convert event times to Europe/Zurich timezone
              const eventStart = DateTime.fromJSDate(new Date(event.start)).setZone('Europe/Zurich');
              const eventEnd = event.end ? DateTime.fromJSDate(new Date(event.end)).setZone('Europe/Zurich') : eventStart;
              
              // Check if event is today and not in the past
              const now = DateTime.now().setZone('Europe/Zurich');
              const isToday = eventStart >= todayStart && eventStart <= todayEnd;
              const isFutureOrActive = eventEnd >= now;
              
              if (isToday && isFutureOrActive) {
                allEvents.push({
                  title: event.summary,
                  start: eventStart.toISO(), // Returns ISO string with timezone info
                  location: event.location || null,
                  startTime: eventStart.toFormat('HH:mm'), // 24-hour format for display
                  endTime: eventEnd.toFormat('HH:mm')
                });
              }
            }
          });
        } catch (error) {
          console.error(`Error parsing calendar ${calendarUrl}:`, error);
        }
      }
      
      // Sort events by start time
      allEvents.sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());
      
      const result = {
        date: zurichTime.toISODate(), // Returns YYYY-MM-DD format
        events: allEvents
      };
      
      console.log(`Found ${allEvents.length} events for today`);
      res.json(result);
      
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      res.status(500).json({ 
        error: 'Failed to fetch calendar events',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // User-specific calendar events endpoint with date range support
  app.get('/api/calendar/events', requireAuth, async (req, res) => {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end date parameters are required' });
      }

      console.log(`Fetching calendar events from ${start} to ${end}...`);
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Get user's calendars from database
      const userCalendars = await storage.getUserCalendars(userId);
      
      if (userCalendars.length === 0) {
        return res.json({
          events: [],
          range: { start, end },
          message: 'No calendars configured. Add a calendar in your profile to see events.'
        });
      }
      
      const calendarUrls = userCalendars
        .filter(cal => cal.isActive)
        .map(cal => cal.calendarUrl);
      
      // Use Europe/Zurich timezone for date range
      const rangeStart = DateTime.fromISO(start).setZone('Europe/Zurich').startOf('day');
      const rangeEnd = DateTime.fromISO(end).setZone('Europe/Zurich').endOf('day');
      
      const allEvents: any[] = [];
      
      // Fetch and parse each calendar
      for (const calendarUrl of calendarUrls) {
        try {
          console.log(`Fetching calendar from: ${calendarUrl}`);
          const response = await fetch(calendarUrl);
          
          if (!response.ok) {
            console.error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
            continue;
          }
          
          const icsData = await response.text();
          const parsedCal = ical.parseICS(icsData);
          
          // Filter events for date range
          Object.keys(parsedCal).forEach(key => {
            const event = parsedCal[key];
            
            if (event.type === 'VEVENT' && event.start && event.summary) {
              const eventStart = DateTime.fromJSDate(new Date(event.start)).setZone('Europe/Zurich');
              const eventEnd = event.end ? DateTime.fromJSDate(new Date(event.end)).setZone('Europe/Zurich') : eventStart;
              
              // Check if event overlaps with the requested range
              const eventOverlaps = eventStart <= rangeEnd && eventEnd >= rangeStart;
              
              if (eventOverlaps) {
                allEvents.push({
                  id: key,
                  title: event.summary,
                  start: eventStart.toISO(),
                  end: eventEnd.toISO(),
                  startTime: eventStart.toFormat('HH:mm'),
                  endTime: eventEnd.toFormat('HH:mm'),
                  location: event.location || null,
                  date: eventStart.toISODate()
                });
              }
            }
          });
        } catch (error) {
          console.error(`Error parsing calendar ${calendarUrl}:`, error);
        }
      }
      
      // Sort events by start time
      allEvents.sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());
      
      const result = {
        events: allEvents,
        range: {
          start: rangeStart.toISODate(),
          end: rangeEnd.toISODate()
        }
      };
      
      console.log(`Found ${allEvents.length} events in date range`);
      res.json(result);
      
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      res.status(500).json({ 
        error: 'Failed to fetch calendar events',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Calendar Management Endpoints
  
  // Get user's calendars
  app.get('/api/calendars', requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const calendars = await storage.getUserCalendars(userId);
      res.json(calendars);
    } catch (error) {
      console.error('Error fetching calendars:', error);
      res.status(500).json({ error: 'Failed to fetch calendars' });
    }
  });

  // Add new calendar
  app.post('/api/calendars', requireAuth, async (req, res) => {
    try {
      const { calendarUrl, calendarName } = req.body;
      const userId = getCurrentUserId(req);
      
      if (!calendarUrl || !calendarName) {
        return res.status(400).json({ error: 'Calendar URL and name are required' });
      }
      
      const finalUserId = userId || await getDefaultUserId();
      
      const calendar = await storage.createUserCalendar({
        userId: finalUserId,
        calendarUrl,
        calendarName,
        isActive: true
      });
      
      res.json(calendar);
    } catch (error) {
      console.error('Error creating calendar:', error);
      res.status(500).json({ error: 'Failed to create calendar' });
    }
  });

  // Delete calendar
  app.delete('/api/calendars/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUserCalendar(id);
      res.json({ message: 'Calendar deleted successfully' });
    } catch (error) {
      console.error('Error deleting calendar:', error);
      res.status(500).json({ error: 'Failed to delete calendar' });
    }
  });

  // Update calendar (toggle active status or change name)
  app.patch('/api/calendars/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const calendar = await storage.updateUserCalendar(id, updates);
      res.json(calendar);
    } catch (error) {
      console.error('Error updating calendar:', error);
      res.status(500).json({ error: 'Failed to update calendar' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
