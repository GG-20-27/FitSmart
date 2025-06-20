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
      const { code, error } = req.query;
      
      if (error) {
        console.error('WHOOP OAuth error:', error);
        return res.status(400).json({ error: 'OAuth authentication failed' });
      }

      if (!code) {
        return res.status(400).json({ error: 'No authorization code received' });
      }

      console.log('Exchanging authorization code for access token...');
      const tokenResponse = await whoopApiService.exchangeCodeForToken(code as string);
      
      // Store the token
      whoopTokenStorage.setDefaultToken({
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in ? Date.now() + (tokenResponse.expires_in * 1000) : undefined
      });

      console.log('WHOOP authentication successful! Token stored.');
      res.json({ 
        message: 'WHOOP authentication successful!',
        status: 'connected'
      });
    } catch (error) {
      console.error('WHOOP callback error:', error);
      res.status(500).json({ error: 'Failed to complete WHOOP authentication' });
    }
  });

  // WHOOP authentication status endpoint
  app.get('/api/whoop/status', (req, res) => {
    try {
      const tokenData = whoopTokenStorage.getDefaultToken();
      
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

  // WHOOP data endpoint - now uses live API data
  app.get('/api/whoop/today', async (req, res) => {
    try {
      console.log('Fetching live WHOOP data for today...');
      
      const tokenData = whoopTokenStorage.getDefaultToken();
      if (!tokenData) {
        console.warn('No WHOOP access token found. User needs to authenticate first.');
        return res.status(401).json({ 
          error: 'WHOOP authentication required',
          message: 'Please visit /api/whoop/login to authenticate with WHOOP first',
          auth_url: '/api/whoop/login'
        });
      }

      if (!whoopTokenStorage.isTokenValid(tokenData)) {
        console.warn('WHOOP access token has expired. Re-authentication required.');
        return res.status(401).json({ 
          error: 'WHOOP token expired',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      const today = getTodayDate();
      let whoopData = await storage.getWhoopDataByDate(today);
      
      // Always try to fetch fresh data from WHOOP API
      try {
        const freshData = await fetchWhoopData();
        whoopData = await storage.createOrUpdateWhoopData({
          date: today,
          recoveryScore: Math.round(freshData.recovery_score),
          sleepScore: Math.round(freshData.sleep_score),
          strainScore: Math.round(freshData.strain_score * 10), // Store as integer * 10
          restingHeartRate: Math.round(freshData.resting_heart_rate)
        });
        
        console.log('Fresh WHOOP data fetched and stored');
      } catch (apiError) {
        console.error('Failed to fetch fresh WHOOP data:', apiError);
        
        // If we have cached data, use it
        if (whoopData) {
          console.log('Using cached WHOOP data');
        } else {
          return res.status(503).json({ 
            error: 'WHOOP API unavailable',
            message: 'Unable to fetch live data and no cached data available'
          });
        }
      }
      
      const response: WhoopTodayResponse = {
        recovery_score: whoopData.recoveryScore,
        sleep_score: whoopData.sleepScore,
        strain_score: whoopData.strainScore / 10, // Convert back to decimal
        resting_heart_rate: whoopData.restingHeartRate
      };
      
      console.log('WHOOP data retrieved:', response);
      res.json(response);
    } catch (error) {
      console.error('Error in WHOOP endpoint:', error);
      res.status(500).json({ error: 'Internal server error while fetching WHOOP data' });
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
