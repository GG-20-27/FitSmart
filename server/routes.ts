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

// Mock WHOOP API function with placeholder logic
async function fetchWhoopData(): Promise<WhoopTodayResponse> {
  // In a real implementation, this would use the WHOOP API with stored access token
  const accessToken = process.env.WHOOP_ACCESS_TOKEN || "placeholder_token";
  
  // Placeholder logic - in production this would make actual API calls
  console.log(`Using WHOOP access token: ${accessToken}`);
  
  // Return realistic but static data for now
  return {
    recovery_score: Math.floor(Math.random() * 40) + 60, // 60-100
    sleep_score: Math.floor(Math.random() * 30) + 70,    // 70-100
    strain_score: Math.floor(Math.random() * 15) + 5,     // 5-20
    resting_heart_rate: Math.floor(Math.random() * 20) + 50 // 50-70
  };
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

  // Health check endpoint
  app.get('/', (req, res) => {
    const response: ApiStatusResponse = {
      status: "success",
      message: "✅ FitScore GPT API is running"
    };
    res.json(response);
  });

  // WHOOP data endpoint
  app.get('/api/whoop/today', async (req, res) => {
    try {
      console.log('Fetching WHOOP data for today...');
      
      const today = getTodayDate();
      let whoopData = await storage.getWhoopDataByDate(today);
      
      if (!whoopData) {
        // Fetch fresh data from WHOOP API
        const freshData = await fetchWhoopData();
        whoopData = await storage.createOrUpdateWhoopData({
          date: today,
          recoveryScore: freshData.recovery_score,
          sleepScore: freshData.sleep_score,
          strainScore: Math.round(freshData.strain_score * 10), // Store as integer * 10
          restingHeartRate: freshData.resting_heart_rate
        });
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
      console.error('Error fetching WHOOP data:', error);
      res.status(500).json({ error: 'Failed to fetch WHOOP data' });
    }
  });

  // Meal upload endpoint
  app.post('/api/meals', upload.array('meals', 10), async (req: Request, res: Response) => {
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
      
      const mealUrls = meals.map(meal => `/uploads/${meal.filename}`);
      
      const response: MealResponse = {
        meals: mealUrls
      };
      
      console.log(`Found ${meals.length} meals for today`);
      res.json(response);
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
