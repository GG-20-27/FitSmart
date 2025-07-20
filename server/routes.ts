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

// Helper function to get default admin user ID
async function getDefaultUserId(): Promise<string> {
  let adminUser = await userService.getUserByEmail('admin@fitscore.local');
  if (!adminUser) {
    // Create default admin user if it doesn't exist
    console.log('[USER SERVICE] Creating default admin user...');
    adminUser = await userService.createUser('admin@fitscore.local');
    console.log('[USER SERVICE] Default admin user created:', adminUser.id);
  }
  return adminUser.id;
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
  // Enable CORS for Custom GPT access
  app.use(cors({
    origin: true,
    credentials: true
  }));

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

  // Admin routes for multi-user management
  console.log('[ROUTE] POST /api/admin/users');
  app.post('/api/admin/users', async (req, res) => {
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
  app.get('/api/admin/users', async (req, res) => {
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
  app.post('/api/admin/users/:userId/whoop-token', async (req, res) => {
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
  app.delete('/api/admin/users/:userId', async (req, res) => {
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

      console.log('Valid authorization code received, proceeding with token exchange...');
      const tokenResponse = await whoopApiService.exchangeCodeForToken(code as string);
      
      // Store the token with proper expiration
      const tokenData = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in : undefined,
        user_id: tokenResponse.user?.id
      };
      
      const defaultUserId = await getDefaultUserId();
      await whoopTokenStorage.setToken(defaultUserId, tokenData);
      console.log('WHOOP authentication successful! Token stored with expiration:', tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : 'no expiration');

      // Return HTML that closes the popup and notifies parent
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>WHOOP Authentication Success</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .success { color: #22c55e; font-size: 18px; margin-bottom: 20px; }
              .message { color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="success">✅ WHOOP Authentication Successful!</div>
            <div class="message">This window will close automatically...</div>
            <script>
              // Notify parent window and close popup
              if (window.opener) {
                window.opener.postMessage({ type: 'WHOOP_AUTH_SUCCESS' }, '*');
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error: any) {
      console.error('WHOOP callback error:', error);
      
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
            </style>
          </head>
          <body>
            <div class="error">❌ Authentication Failed</div>
            <div class="message">${error.message || 'An error occurred during authentication'}</div>
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
  app.get('/api/whoop/status', async (req, res) => {
    // Disable caching for this endpoint
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    try {
      const defaultUserId = await getDefaultUserId();
      const tokenData = await whoopTokenStorage.getToken(defaultUserId);
      
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

  // Test endpoint to manually set a WHOOP token for debugging
  app.post('/api/whoop/test-token', async (req, res) => {
    try {
      const { access_token } = req.body;
      if (!access_token) {
        return res.status(400).json({ error: 'access_token required' });
      }

      // Store the test token
      const defaultUserId = await getDefaultUserId();
      await whoopTokenStorage.setToken(defaultUserId, {
        access_token: access_token,
        expires_at: Date.now() / 1000 + (24 * 60 * 60), // 24 hours from now in seconds
        user_id: defaultUserId
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
  app.get('/api/whoop/today', async (req, res) => {
    try {
      console.log('Fetching live WHOOP data for today...');
      
      // Token validation at the top
      const defaultUserId = await getDefaultUserId();
      const tokenData = await whoopTokenStorage.getToken(defaultUserId);
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token' });
      }

      if (!whoopTokenStorage.isTokenValid(tokenData)) {
        console.warn('WHOOP access token has expired. Re-authentication required.');
        return res.status(401).json({ 
          error: 'WHOOP token expired',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      // Fetch real WHOOP data using the corrected API structure
      const whoopData = await whoopApiService.getTodaysData(defaultUserId);
      
      // Store in database for caching
      const todayDate = getTodayDate();
      await storage.createOrUpdateWhoopData({
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
  app.get('/api/whoop/weekly', async (req, res) => {
    try {
      console.log('Fetching weekly WHOOP averages...');
      
      // Token validation
      const tokenData = await whoopTokenStorage.getDefaultToken();
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token' });
      }

      if (!whoopTokenStorage.isTokenValid(tokenData)) {
        console.warn('WHOOP access token has expired. Re-authentication required.');
        return res.status(401).json({ 
          error: 'WHOOP token expired',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      const weeklyData = await whoopApiService.getWeeklyAverages();
      
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

  // Google Calendar today's events endpoint
  app.get('/api/calendar/today', async (req, res) => {
    try {
      console.log('Fetching today\'s calendar events...');
      
      // Extract calendar IDs from the embed URL
      const calendarUrls = [
        'https://calendar.google.com/calendar/ical/gguussttaavvss%40gmail.com/public/basic.ics',
        'https://calendar.google.com/calendar/ical/f384eb70bee502233b35fb8e1d69b6edda889364ac5e8ccd098fe165cad24bd9%40group.calendar.google.com/public/basic.ics',
        'https://calendar.google.com/calendar/ical/florbolists13%40gmail.com/public/basic.ics'
      ];
      
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

  // Calendar events endpoint with date range support
  app.get('/api/calendar/events', async (req, res) => {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end date parameters are required' });
      }

      console.log(`Fetching calendar events from ${start} to ${end}...`);
      
      const calendarUrls = [
        'https://calendar.google.com/calendar/ical/gguussttaavvss%40gmail.com/public/basic.ics',
        'https://calendar.google.com/calendar/ical/f384eb70bee502233b35fb8e1d69b6edda889364ac5e8ccd098fe165cad24bd9%40group.calendar.google.com/public/basic.ics',
        'https://calendar.google.com/calendar/ical/florbolists13%40gmail.com/public/basic.ics'
      ];
      
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

  const httpServer = createServer(app);
  return httpServer;
}
