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

// Fetch live WHOOP data using OAuth access token
async function fetchWhoopData(): Promise<WhoopTodayResponse> {
  try {
    const data = await whoopApiService.getTodaysData();
    return data;
  } catch (error) {
    console.error('Failed to fetch live WHOOP data:', error);
    throw error;
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
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
  console.log('\n📝 Test with curl:');
  console.log('curl http://localhost:5000/api/health');
  console.log('curl http://localhost:5000/api/whoop/login');
  console.log('curl http://localhost:5000/api/whoop/today');
  console.log('curl http://localhost:5000/api/meals/today');
  console.log('curl -F "mealPhotos=@image.jpg" http://localhost:5000/api/meals');
  console.log('');

  // Health check endpoint (moved from root to avoid conflicts with frontend)
  app.get('/api/health', (req, res) => {
    const response: ApiStatusResponse = {
      status: "success",
      message: "✅ FitScore GPT API is running"
    };
    res.json(response);
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
        user_id: tokenResponse.user?.id || 'default'
      };
      
      await whoopTokenStorage.setDefaultToken(tokenData);
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
    try {
      const tokenData = await whoopTokenStorage.getDefaultToken();
      
      if (!tokenData) {
        return res.json({
          authenticated: false,
          message: 'No WHOOP token found',
          auth_url: '/api/whoop/login'
        });
      }

      const isValid = whoopTokenStorage.isTokenValid(tokenData);
      
      res.json({
        authenticated: isValid,
        message: isValid ? 'WHOOP token is valid' : 'WHOOP token has expired',
        auth_url: isValid ? null : '/api/whoop/login',
        expires_at: tokenData.expires_at
      });
    } catch (error) {
      console.error('Error checking WHOOP status:', error);
      res.status(500).json({ error: 'Failed to check WHOOP authentication status' });
    }
  });

  // Debug endpoint to test OAuth URL generation
  app.get('/api/whoop/debug', async (req, res) => {
    try {
      const oauthUrl = whoopApiService.getOAuthUrl();
      const tokenData = await whoopTokenStorage.getDefaultToken();
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
      await whoopTokenStorage.setDefaultToken({
        access_token: access_token,
        expires_at: Date.now() / 1000 + (24 * 60 * 60), // 24 hours from now in seconds
        user_id: 'test_user'
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
      
      // Fetch real WHOOP data using the corrected API structure
      const whoopData = await whoopApiService.getTodaysData();
      
      // Store in database for caching
      const today = getTodayDate();
      await storage.createOrUpdateWhoopData({
        date: today,
        recoveryScore: Math.round(whoopData.recovery_score || 0),
        sleepScore: Math.round(whoopData.sleep_score || 0),
        strainScore: Math.round((whoopData.strain || 0) * 10), // Store as integer * 10
        restingHeartRate: Math.round(whoopData.resting_heart_rate || 0)
      });

      // Return the new response format as specified
      const result = {
        cycle_id: whoopData.cycle_id,
        strain: whoopData.strain,
        recovery_score: whoopData.recovery_score,
        hrv: whoopData.hrv,
        resting_heart_rate: whoopData.resting_heart_rate,
        sleep_score: whoopData.sleep_score,
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

  const httpServer = createServer(app);
  return httpServer;
}
