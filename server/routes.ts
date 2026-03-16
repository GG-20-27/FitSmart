import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer, { type FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { z } from "zod";
import type { WhoopTodayResponse, MealResponse, ApiStatusResponse, ChatRequest, ChatResponse } from "@shared/schema";
import { whoopApiService } from "./whoopApiService";
import { whoopTokenStorage } from "./whoopTokenStorage";
import { userService } from "./userService";
import { chatService, ChatErrorType } from "./chatService";
import { chatSummarizationService } from "./chatSummarizationService";
import { whisperService } from "./whisperService.ts";
import { openAIService } from "./services/openAiService";
import { trainingScoreService } from "./services/trainingScoreService";
import ical from "ical";
import { DateTime } from "luxon";
import axios from "axios";
import { getCurrentUserId, requireAdmin } from './authMiddleware';
import { requireJWTAuth, jwtAuthMiddleware } from './jwtAuth';
import { db } from './db';
import { users, fitScores, userGoals, fitlookDaily, dailyCheckins, fitroastWeekly, userContext, whoopData as whoopDataTable, trainingData as trainingDataTable, meals as mealsTable, planHabits as planHabitsTable, habitCheckins as habitCheckinsTable, improvementPlans } from '@shared/schema';
import type { UserGoal, FitScore } from '@shared/schema';
import { eq, desc, sql, and, gte, lt } from 'drizzle-orm';
import { Resend } from 'resend';

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

// Configure multer for audio file uploads (voice messages)
const audioUpload = multer({
  storage: multer.memoryStorage(), // Store in memory for immediate processing
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const audioMimeTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
      'audio/wav', 'audio/webm', 'audio/ogg', 'audio/flac'
    ];
    if (audioMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Helper function for timezone-aware date keys
function todayKey(tz = process.env.USER_TZ || 'Europe/Zurich'): string {
  const isoDate = DateTime.now().setZone(tz).toISODate();
  return isoDate ?? new Date().toISOString().split('T')[0];
}

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
    const data = await whoopApiService.getTodaysData(actualUserId);
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

// ── Macro target calculation utility ─────────────────────────────────────────
function calculateMacroTargets(params: {
  weightKg: number;
  tier1Goal?: string;
  tier2DietPhase?: string;
  trainingSessionsPerWeek?: string | null;
}): { proteinTarget: number; calorieTarget: number } {
  const goal = (params.tier1Goal ?? '').toLowerCase();
  const diet = (params.tier2DietPhase ?? '').toLowerCase();
  const sessions = (params.trainingSessionsPerWeek ?? '').toLowerCase();

  // Protein multiplier (g per kg bodyweight) — distinct per goal
  let proteinMultiplier = 1.6; // default (longevity/health, rehab)
  if (goal.includes('high performance')) proteinMultiplier = 2.0;
  else if (goal.includes('balanced performance')) proteinMultiplier = 1.8;
  else if (goal.includes('recomp') || goal.includes('body recomp')) proteinMultiplier = 1.9;
  else if (goal.includes('rehab') || goal.includes('longevity')) proteinMultiplier = 1.8;
  // Diet phase overrides
  if (diet.includes('cut')) proteinMultiplier = Math.max(proteinMultiplier, 2.0);
  else if (diet.includes('aggressive bulk')) proteinMultiplier = Math.max(proteinMultiplier, 1.9);
  const proteinTarget = Math.round((params.weightKg * proteinMultiplier) / 5) * 5;

  // TDEE estimate (kcal per kg)
  let activityMultiplier = 32; // moderate default
  if (sessions.includes('1') || sessions.includes('2')) activityMultiplier = 28;
  if (sessions.includes('5') || sessions.includes('6') || sessions.includes('7')) activityMultiplier = 36;
  let tdee = params.weightKg * activityMultiplier;

  // Goal + diet adjustments
  if (goal.includes('high performance')) tdee *= 1.10;
  if (diet.includes('cut')) tdee *= 0.85;
  else if (diet.includes('aggressive bulk')) tdee *= 1.15;
  else if (diet.includes('lean bulk')) tdee *= 1.10;
  const calorieTarget = Math.round(tdee / 50) * 50;

  return { proteinTarget, calorieTarget };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for all routes with pre-flight support
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  }));

  // Apply JWT middleware globally to extract userId from token for all requests
  app.use(jwtAuthMiddleware);
  
  // Handle pre-flight requests for all routes
  app.options('*', cors());

  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadsDir));

  // Privacy Policy page (required for WHOOP OAuth)
  app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FitSmart – Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 60px auto; padding: 0 24px; color: #1a1a2e; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: 4px; }
    h2 { font-size: 1.1rem; margin-top: 36px; color: #333; }
    p, li { font-size: 0.97rem; color: #444; }
    a { color: #6366f1; }
    .updated { color: #888; font-size: 0.85rem; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: February 2026</p>

  <p>FitSmart ("we", "our", or "us") is a personal fitness intelligence app. This policy explains what data we collect, how we use it, and your rights.</p>

  <h2>1. Data We Collect</h2>
  <ul>
    <li><strong>WHOOP health data</strong> – heart rate, HRV, sleep, recovery, and strain data accessed via the WHOOP API with your explicit consent.</li>
    <li><strong>Meal photos</strong> – images you upload for nutrition analysis.</li>
    <li><strong>Goals &amp; check-ins</strong> – fitness goals and daily check-in responses you enter in the app.</li>
    <li><strong>Chat messages</strong> – messages sent to the AI coach for personalised advice.</li>
  </ul>

  <h2>2. How We Use Your Data</h2>
  <ul>
    <li>To generate your FitScore, recovery insights, and AI coaching summaries.</li>
    <li>To analyse meal photos for nutritional content using OpenAI Vision.</li>
    <li>To personalise your fitness recommendations over time.</li>
    <li>We do <strong>not</strong> sell your data to third parties.</li>
  </ul>

  <h2>3. Data Storage</h2>
  <p>Your data is stored in a secure PostgreSQL database hosted on Supabase (EU region). WHOOP OAuth tokens are encrypted and stored only to maintain your connection to the WHOOP API.</p>

  <h2>4. Third-Party Services</h2>
  <ul>
    <li><strong>WHOOP API</strong> – health data is fetched from WHOOP with your permission. See <a href="https://www.whoop.com/privacy" target="_blank">WHOOP's Privacy Policy</a>.</li>
    <li><strong>OpenAI</strong> – meal photos and chat messages are processed by OpenAI. See <a href="https://openai.com/privacy" target="_blank">OpenAI's Privacy Policy</a>.</li>
  </ul>

  <h2>5. Your Rights</h2>
  <p>You can request deletion of all your data at any time by contacting us. Disconnecting WHOOP in the app immediately revokes our access to your WHOOP data.</p>

  <h2>6. Contact</h2>
  <p>For any privacy questions, contact us at: <a href="mailto:privacy@fitsmart.app">privacy@fitsmart.app</a></p>
</body>
</html>`);
  });

  // Log API examples on startup
  console.log('\n🚀 FitScore GPT API Endpoints:');
  console.log('📊 Health Check: GET /api/health');
  console.log('🔐 WHOOP Login: GET /api/whoop/login');
  console.log('🔄 WHOOP Callback: GET /api/whoop/callback');
  console.log('🏃 WHOOP Data: GET /api/whoop/today');
  console.log('📸 Upload Meals: POST /api/meals (field: mealPhotos)');
  console.log('🍽️ Today\'s Meals: GET /api/meals/today');
  console.log('📅 Calendar Today: GET /api/calendar/today');
  console.log('🤖 Chat Coach: POST /api/chat (requires JWT)');
  console.log('🧪 Chat Test: GET /api/chat/test (requires JWT)');
  console.log('\n📝 Test with curl:');
  console.log('curl http://localhost:3001/api/health');
  console.log('curl http://localhost:3001/api/whoop/login');
  console.log('curl http://localhost:3001/api/whoop/today');
  console.log('curl http://localhost:3001/api/meals/today');
  console.log('curl http://localhost:3001/api/calendar/today');
  console.log('curl -F "mealPhotos=@image.jpg" http://localhost:3001/api/meals');
  console.log('curl -H "Authorization: Bearer <jwt>" http://localhost:3001/api/chat/test');
  console.log('curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d \'{"messages":[{"role":"user","content":"Hello"}]}\' http://localhost:3001/api/chat');
  console.log('');

  // Email auth endpoints (register/login/me) are registered later in the file

  // GET /reset-password — web redirect page that opens the app via deep link
  // Linked from password reset emails (HTTPS links work; direct fitsmart:// links don't in email clients)
  app.get('/reset-password', (req, res) => {
    const token = req.query.token as string;
    if (!token) return res.status(400).send('Missing token');

    const deepLink = `fitsmart://reset-password?token=${encodeURIComponent(token)}`;

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your FitSmart password</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#161b22;border-radius:16px;padding:40px 32px;max-width:420px;width:100%;text-align:center}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-size:22px;font-weight:700;margin-bottom:10px}
    p{color:#8b949e;font-size:15px;line-height:1.5;margin-bottom:28px}
    a.btn{display:block;background:#27e9b5;color:#0d1117;font-weight:700;font-size:17px;padding:16px 24px;border-radius:12px;text-decoration:none}
    .note{margin-top:20px;font-size:13px;color:#555}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Reset your password</h1>
    <p>Tap below to open FitSmart and set a new password.</p>
    <a href="${deepLink}" class="btn">Open FitSmart</a>
    <p class="note">Link expires in 1 hour.</p>
  </div>
  <script>
    // Auto-open the app after a short delay
    setTimeout(function() { window.location.href = '${deepLink}'; }, 300);
  </script>
</body>
</html>`);
  });


  console.log('[ROUTE] POST /api/auth/logout');
  app.post('/api/auth/logout', (req, res) => {
    // For JWT, logout is handled client-side by removing the token
    res.json({ message: 'Logout successful' });
  });

  // GET /api/auth/me is registered later in the file (email auth section)

  // User profile endpoint
  console.log('[ROUTE] GET /api/users/me');
  app.get('/api/users/me', requireJWTAuth, async (req, res) => {
    try {
      const whoopUserId = getCurrentUserId(req);

      // Get user role from JWT token
      const authHeader = req.headers.authorization;
      let userRole = 'user';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const { verifyJWT } = await import('./jwtAuth');
          const payload = verifyJWT(token);

          if (payload) {
          userRole = payload.role || 'user';
          }
        } catch (jwtError) {
          const message = jwtError instanceof Error ? jwtError.message : String(jwtError);
          console.log(`[USERS ME] JWT verification failed:`, message);
        }
      }

      res.json({
        whoopId: whoopUserId,
        role: userRole
      });
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  });

  // User settings endpoints
  console.log('[ROUTE] GET /api/users/settings');
  app.get('/api/users/settings', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const user = await userService.getUserById(userId!);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        estimate_macros_enabled: user.estimateMacrosEnabled ?? false,
        morning_outlook_enabled: user.morningOutlookEnabled ?? false,
        comedy_roast_enabled: user.comedyRoastEnabled ?? false,
        meal_reminders_enabled: user.mealRemindersEnabled ?? false,
      });
    } catch (error) {
      console.error('Get user settings error:', error);
      res.status(500).json({ error: 'Failed to get user settings' });
    }
  });

  console.log('[ROUTE] PATCH /api/users/settings');
  app.patch('/api/users/settings', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const {
        estimate_macros_enabled,
        morning_outlook_enabled,
        outlook_time,
        comedy_roast_enabled,
        meal_reminders_enabled
      } = req.body;

      const updates: any = {};
      if (estimate_macros_enabled !== undefined) updates.estimateMacrosEnabled = estimate_macros_enabled;
      if (morning_outlook_enabled !== undefined) updates.morningOutlookEnabled = morning_outlook_enabled;
      if (outlook_time !== undefined) updates.outlookTime = outlook_time;
      if (comedy_roast_enabled !== undefined) updates.comedyRoastEnabled = comedy_roast_enabled;
      if (meal_reminders_enabled !== undefined) updates.mealRemindersEnabled = meal_reminders_enabled;

      await userService.updateUser(userId, updates);

      res.json({
        message: 'Settings updated successfully',
        settings: updates
      });
    } catch (error) {
      console.error('Update user settings error:', error);
      res.status(500).json({ error: 'Failed to update user settings' });
    }
  });

  // Static JWT endpoint for Custom GPT integration
  console.log('[ROUTE] GET /api/auth/static-jwt');
  app.get('/api/auth/static-jwt', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[STATIC JWT] Fetching static JWT for user: ${userId}`);
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please authenticate with WHOOP to access this resource'
        });
      }
      
      const tokenData = await whoopTokenStorage.getToken(userId);
      const staticJwt = tokenData?.static_jwt || null;
      
      console.log(`[STATIC JWT] Found static JWT for user ${userId}:`, staticJwt ? 'Present' : 'Not found');
      
      res.json({ 
        static_jwt: staticJwt 
      });
    } catch (error) {
      console.error('Get static JWT error:', error);
      res.status(500).json({ error: 'Failed to get static JWT token' });
    }
  });

  // POST /api/auth/register — handled later in the email auth section

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

  console.log('[ROUTE] PATCH /api/admin/users/:userId');
  app.patch('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { displayName } = req.body;
      
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await userService.updateUserDisplayName(userId, displayName);
      res.json({ message: 'User display name updated successfully' });
    } catch (error) {
      console.error('Error updating user display name:', error);
      res.status(500).json({ error: 'Failed to update user display name' });
    }
  });

  // Voice transcription endpoint (base64 JSON approach)
  console.log('[ROUTE] POST /api/chat/transcribe');
  app.post('/api/chat/transcribe', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[TRANSCRIBE] Voice transcription request from user: ${userId}`);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to use transcription service'
        });
      }

      // Extract base64 audio and filename from JSON body
      const { audioBase64, filename } = req.body;

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        console.error('[TRANSCRIBE] No audioBase64 in request body');
        return res.status(400).json({
          error: 'Invalid request',
          message: 'audioBase64 (string) is required in request body'
        });
      }

      if (!whisperService.isConfigured()) {
        return res.status(500).json({
          error: 'Transcription service not configured',
          message: 'OpenAI API key is not configured'
        });
      }

      // Decode base64 to buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      console.log(`[TRANSCRIBE] Decoded ${audioBuffer.length} bytes from base64`);
      console.log(`[TRANSCRIBE] Filename: ${filename || 'audio.m4a'}`);

      const transcription = await whisperService.transcribeAudio(
        audioBuffer,
        filename || 'audio.m4a'
      );

      console.log(`[TRANSCRIBE] Successfully transcribed audio for user ${userId}`);
      res.json({ transcription });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while transcribing audio';
      console.error('[TRANSCRIBE] Error:', message);
      res.status(500).json({
        error: 'Transcription failed',
        message
      });
    }
  });

  // Image upload endpoint - uploads base64 images to ImgBB and returns URLs
  console.log('[ROUTE] POST /api/images/upload');
  app.post('/api/images/upload', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[IMAGE UPLOAD] Image upload request from user: ${userId}`);
      console.log(`[IMAGE UPLOAD] Request body keys:`, Object.keys(req.body));

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to upload images'
        });
      }

      const { images } = req.body;

      console.log(`[IMAGE UPLOAD] images present: ${!!images}, is array: ${Array.isArray(images)}, length: ${images?.length || 0}`);

      if (!images || !Array.isArray(images) || images.length === 0) {
        console.error('[IMAGE UPLOAD] Invalid images array! Body keys:', Object.keys(req.body));
        return res.status(400).json({
          error: 'Invalid request',
          message: 'images array is required'
        });
      }

      console.log(`[IMAGE UPLOAD] Processing ${images.length} images`);

      const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

      if (!IMGBB_API_KEY) {
        console.warn("IMGBB_API_KEY is not set. Image upload features may not work.");
      }

      for (let i = 0; i < images.length; i++) {
        const base64Image = images[i];

        // Remove data URL prefix if present
        const base64Data = base64Image.includes(',')
          ? base64Image.split(',')[1]
          : base64Image;

        console.log(`[IMAGE UPLOAD] Uploading image ${i + 1}/${images.length}, base64 size: ${base64Data.length} chars`);

        try {
          const formData = new URLSearchParams();
          formData.append('image', base64Data);

          console.log(`[IMAGE UPLOAD] Sending request to ImgBB...`);

          const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
          });

          console.log(`[IMAGE UPLOAD] ImgBB response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[IMAGE UPLOAD] ImgBB HTTP ${response.status} error for image ${i + 1}:`, errorText);
            throw new Error(`ImgBB upload failed: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
          }

          const data = await response.json();
          console.log(`[IMAGE UPLOAD] ImgBB response data:`, JSON.stringify(data).substring(0, 300));

          if (!data.success || !data.data || !data.data.url) {
            console.error(`[IMAGE UPLOAD] ImgBB response missing URL:`, data);
            throw new Error('ImgBB response missing image URL');
          }

          const imageUrl = data.data.url;
          uploadedUrls.push(imageUrl);
          console.log(`[IMAGE UPLOAD] ✅ Image ${i + 1} uploaded successfully: ${imageUrl}`);
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
          console.error(`[IMAGE UPLOAD] ❌ Failed to upload image ${i + 1} to ImgBB:`, errorMsg);

          // Fallback: Use base64 data URI instead of failing
          console.log(`[IMAGE UPLOAD] Using base64 data URI fallback for image ${i + 1}`);
          const dataUri = base64Image.includes('data:')
            ? base64Image
            : `data:image/jpeg;base64,${base64Data}`;
          uploadedUrls.push(dataUri);
          console.log(`[IMAGE UPLOAD] ✅ Image ${i + 1} using base64 fallback (${dataUri.length} chars)`);
        }
      }

      // All images processed (either uploaded or using base64 fallback)
      if (uploadedUrls.length === 0) {
        return res.status(500).json({
          error: 'Upload failed',
          message: 'Failed to process any images'
        });
      }

      console.log(`[IMAGE UPLOAD] Successfully uploaded ${uploadedUrls.length}/${images.length} images`);
      res.json({ urls: uploadedUrls });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while uploading images';
      console.error('[IMAGE UPLOAD] Error:', message);
      res.status(500).json({
        error: 'Upload failed',
        message
      });
    }
  });

  // Chat endpoints
  console.log('[ROUTE] GET /api/chat/test');
  app.get('/api/chat/test', requireJWTAuth, async (req, res) => {
    try {
      console.log('[CHAT TEST] Testing chat service connection');
      const response = await chatService.testConnection();
      res.json(response);
    } catch (error) {
      console.error('[CHAT TEST] Error:', error);
      res.status(500).json({ error: 'Chat service test failed' });
    }
  });

  console.log('[ROUTE] POST /api/chat');
  app.post('/api/chat', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[CHAT] Chat request from user: ${userId}`);

      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please authenticate to use chat service'
        });
      }

      // Validate request body
      const { message, image, images, goalsContext }: ChatRequest = req.body;

      const hasImages = (images && images.length > 0) || image;
      if ((!message || typeof message !== 'string' || !message.trim()) && !hasImages) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'A message string or image is required'
        });
      }

      // Check if chat service is configured
      if (!chatService.isConfigured()) {
        return res.status(500).json({
          error: 'Chat service not configured',
          message: 'OpenAI API key is not configured'
        });
      }

      const imageCount = images?.length || (image ? 1 : 0);
      console.log(`[CHAT] Processing message for user ${userId}: "${message?.substring(0, 50) || `${imageCount} image(s)`}..."`);

      const response: ChatResponse = await chatService.sendChat({
        userId,
        message: message || 'Analyze these images',
        image,
        images,
        goalsContext
      });
      
      console.log(`[CHAT] Successfully processed chat request for user ${userId}`);
      res.json(response);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while processing your request';
      console.error('[CHAT] Error processing chat request:', message);

      const chatError = error as { type?: ChatErrorType; message?: string } | null;

      // Handle chat service errors
      if (chatError?.type === ChatErrorType.CONFIGURATION_ERROR) {
        return res.status(500).json({ error: chatError.message ?? message });
      }
      
      if (chatError?.type === ChatErrorType.VALIDATION_ERROR) {
        return res.status(400).json({ error: chatError.message ?? message });
      }
      
      if (chatError?.type === ChatErrorType.RATE_LIMIT_ERROR) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      }
      
      if (chatError?.type === ChatErrorType.NETWORK_ERROR) {
        return res.status(503).json({ error: 'Chat service temporarily unavailable' });
      }
      
      // Generic error
      res.status(500).json({ 
        error: 'Failed to process chat request',
        message
      });
    }
  });

  // Persona test endpoint - test FitSmart persona responses with current WHOOP data
  console.log('[ROUTE] POST /api/chat/persona-test');
  app.post('/api/chat/persona-test', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[PERSONA-TEST] Persona test request from user: ${userId}`);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to use persona test'
        });
      }

      // Use default test message if none provided
      const testMessage = req.body.message || "How's my recovery today?";

      console.log(`[PERSONA-TEST] Testing with message: "${testMessage}"`);

      // Call chat service (which now uses persona pipeline)
      const response: ChatResponse = await chatService.sendChat({
        userId,
        message: testMessage
      });

      // Return response with debug info
      res.json({
        message: testMessage,
        reply: response.reply,
        timestamp: new Date().toISOString(),
        debug: {
          personaPipelineUsed: true,
          flowSteps: ['[CTX] Build context pack', '[PERSONA] Compose prompt', '[REFLECT] Add reflection', '[FINAL] Deliver reply']
        }
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred during persona test';
      console.error('[PERSONA-TEST] Error:', message);
      res.status(500).json({
        error: 'Persona test failed',
        message
      });
    }
  });

  // Morning Outlook Test Endpoint
  console.log('[ROUTE] POST /api/chat/outlook-test');
  app.post('/api/chat/outlook-test', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[OUTLOOK-TEST] Manual outlook test from user: ${userId}`);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to test morning outlook'
        });
      }

      // TODO: Create morning outlook persona/prompt
      // For now, use a placeholder message
      const outlookMessage = "Good morning! Here's your daily outlook based on your recovery metrics...";

      res.json({
        message: outlookMessage,
        timestamp: new Date().toISOString(),
        note: 'Morning outlook feature - prompt to be implemented'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred during outlook test';
      console.error('[OUTLOOK-TEST] Error:', message);
      res.status(500).json({
        error: 'Outlook test failed',
        message
      });
    }
  });

  // Comedy Roast Test Endpoint
  console.log('[ROUTE] POST /api/chat/roast-test');
  app.post('/api/chat/roast-test', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[ROAST-TEST] Manual roast test from user: ${userId}`);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to test comedy roast'
        });
      }

      // TODO: Create comedy roast persona/prompt
      // For now, use a placeholder message
      const roastMessage = "Weekly roast coming soon! We'll have some fun with your training data...";

      res.json({
        message: roastMessage,
        timestamp: new Date().toISOString(),
        note: 'Comedy roast feature - prompt to be implemented'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred during roast test';
      console.error('[ROAST-TEST] Error:', message);
      res.status(500).json({
        error: 'Roast test failed',
        message
      });
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
        const expiresAtSeconds = typeof tokenData.expires_at === 'number'
          ? tokenData.expires_at
          : tokenData.expires_at instanceof Date
            ? Math.floor(tokenData.expires_at.getTime() / 1000)
            : null;

        if (expiresAtSeconds) {
          const expiryTime = new Date(expiresAtSeconds * 1000);
        const now = new Date();
        const timeUntilExpiry = expiryTime.getTime() - now.getTime();
        const hoursUntilExpiry = Math.round(timeUntilExpiry / (1000 * 60 * 60));
        
        if (hoursUntilExpiry > 0) {
          expiryInfo = ` (expires in ${hoursUntilExpiry} hours)`;
        } else {
          expiryInfo = ' (expired, auto-refresh active)';
        }
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

  // ============================================
  // AI INSIGHTS ENDPOINTS
  // ============================================

  // POST /api/ai/fitscore - Calculate and return daily FitScore
  app.post('/api/ai/fitscore', requireJWTAuth, async (req, res) => {
    const buildFallback = () => ({
      title: "✨ Strong Performance",
      summary: "Your daily performance is balanced. Sleep and recovery are solid, while nutrition and strain show room for optimization.",
      components: {
        sleep: 7.5,
        recovery: 8.2,
        nutrition: 6.8,
        strain: 7.0
      },
      finalScore: 7.4,
      timestamp: new Date().toISOString()
    });

    const isProduction = process.env.NODE_ENV === 'production';

    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // If no database URL, return mock data immediately
      if (!process.env.DATABASE_URL) {
        return res.json(buildFallback());
      }

      const latestScore = await db
        .select()
        .from(fitScores)
        .where(eq(fitScores.userId, userId))
        .orderBy(desc(fitScores.calculatedAt), desc(fitScores.date))
        .limit(1);

      if (latestScore.length === 0) {
        return res.json({
          title: "No Data Available",
          summary: "Start logging your meals and syncing WHOOP data to calculate your FitScore.",
          components: {
            sleep: 0,
            recovery: 0,
            nutrition: 0,
            strain: 0
          },
          finalScore: 0,
          timestamp: new Date().toISOString()
        });
      }

      const score = latestScore[0];
      const componentsData = (score.components || {}) as Record<string, any>;

      const parseNumeric = (value: unknown): number => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const normalize = (value: number): number =>
        Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;

      const getMetric = (key: string) => {
        const metric = componentsData?.[key];
        if (!metric) {
          return { score: 0, comment: undefined as string | undefined };
        }

        if (typeof metric === 'number') {
          return { score: metric, comment: undefined as string | undefined };
        }

        return {
          score: normalize(parseNumeric(metric.score)),
          comment: typeof metric.comment === 'string' ? metric.comment : undefined
        };
      };

      const sleepMetric = getMetric('sleep');
      const recoveryMetric = getMetric('recovery');
      const nutritionMetric = getMetric('nutrition');
      const cardioMetric = getMetric('cardioBalance');
      const trainingMetric = getMetric('trainingAlignment');

      const finalScoreRaw = normalize(parseNumeric(score.score));
      const strainMetric = trainingMetric.score > 0 ? trainingMetric : cardioMetric;
      const title =
        (typeof score.tagline === 'string' && score.tagline.trim().length > 0)
          ? score.tagline
          : finalScoreRaw >= 8 ? "⚡ Exceptional Performance"
          : finalScoreRaw >= 7 ? "✨ Strong Performance"
          : finalScoreRaw >= 6 ? "💪 Good Balance"
          : finalScoreRaw >= 5 ? "⚖️ Room for Improvement"
          : "🔄 Recovery Focus Needed";

      const summaryCandidates = [
        typeof score.motivation === 'string' ? score.motivation : undefined,
        sleepMetric.comment,
        recoveryMetric.comment,
        nutritionMetric.comment,
        strainMetric.comment
      ].filter((text): text is string => !!text && text.trim().length > 0);

      const summary = summaryCandidates.length > 0
        ? summaryCandidates.slice(0, 2).map(text => text.trim()).join(' • ')
        : "Your daily performance summary based on sleep, recovery, nutrition, and training alignment.";

      const toIsoDate = (): string => {
        if (score.calculatedAt instanceof Date) {
          return score.calculatedAt.toISOString();
        }

        if (typeof score.calculatedAt === 'string') {
          const parsed = new Date(score.calculatedAt);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }

        if (typeof score.date === 'string' && score.date.length > 0) {
          const parsed = new Date(`${score.date}T00:00:00Z`);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }

        return new Date().toISOString();
      };

      res.json({
        title,
        summary,
        components: {
          sleep: sleepMetric.score,
          recovery: recoveryMetric.score,
          nutrition: nutritionMetric.score,
          strain: strainMetric.score
        },
        finalScore: finalScoreRaw,
        timestamp: toIsoDate()
      });
    } catch (error) {
      console.error('[AI FitScore] Error:', error);
      if (!isProduction) {
        return res.json(buildFallback());
      }
      res.status(500).json({ error: 'Failed to calculate FitScore' });
    }
  });

  // POST /api/ai/outlook - Generate morning outlook
  app.post('/api/ai/outlook', requireJWTAuth, async (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const buildMockOutlook = () => {
      const mockReadiness = 8.1;
      return {
        title: "🌅 Ready to Perform",
        summary: "Your recovery looks strong today. You're primed for challenging workouts and high performance tasks.",
        readiness: mockReadiness,
        focusAreas: [
          "High-intensity training is favorable today",
          "Maintain consistent meal timing",
          "Focus on achieving your strength goals"
        ],
        timestamp: new Date().toISOString()
      };
    };

    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // If no database URL, return mock data
      if (!process.env.DATABASE_URL) {
        return res.json(buildMockOutlook());
      }

      // Fetch latest WHOOP data
      const whoopData = await whoopApiService.getTodaysData(userId);

      // Calculate readiness score (simple average of recovery and sleep)
      const readiness = whoopData?.recovery_score
        ? (whoopData.recovery_score * 10) / 100
        : 7.0;

      // Get today's goals
      const goals: UserGoal[] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .limit(3);

      const focusAreas = goals.map((goal) => goal.title);

      res.json({
        title: readiness >= 8 ? "🌅 Ready to Perform" :
               readiness >= 6 ? "☀️ Moderate Energy" :
               "🌤️ Recovery Priority",
        summary: readiness >= 8
          ? "Your recovery looks strong today. You're primed for challenging workouts and high performance tasks."
          : readiness >= 6
          ? "You're moderately recovered. Consider scaling intensity based on how you feel throughout the day."
          : "Your body needs recovery today. Focus on low-intensity activities, good nutrition, and rest.",
        readiness: readiness,
        focusAreas: focusAreas.length > 0 ? focusAreas : [
          "Prioritize sleep quality tonight",
          "Stay hydrated throughout the day",
          "Listen to your body's signals"
        ],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[AI Outlook] Error:', error);
      if (!isProduction) {
        return res.json(buildMockOutlook());
      }
      res.status(500).json({ error: 'Failed to generate morning outlook' });
    }
  });

  // POST /api/ai/roast - Generate weekly performance roast
  app.post('/api/ai/roast', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // If no database URL, return mock data
      if (!process.env.DATABASE_URL) {
        const mockAvgScore = 7.2;
        return res.json({
          title: "💪 Solid Performance",
          roast: "Solid week! You're performing well, though there's definitely room to push harder. You're like a sports car stuck in second gear - powerful, but not quite unleashed.",
          highlights: [
            "Consistent training schedule maintained",
            "Strong recovery metrics on most days"
          ],
          lowlights: [
            "Nutrition consistency could be improved",
            "Two days showed suboptimal sleep duration"
          ],
          weekScore: mockAvgScore,
          timestamp: new Date().toISOString()
        });
      }

      // Get past week's FitScores
      const weekScores: FitScore[] = await db
        .select()
        .from(fitScores)
        .where(eq(fitScores.userId, userId))
        .orderBy(desc(fitScores.calculatedAt), desc(fitScores.date))
        .limit(7);

      if (weekScores.length === 0) {
        return res.json({
          title: "📊 Not Enough Data",
          roast: "I'd love to roast your performance, but you haven't given me much to work with yet! Start tracking your metrics consistently.",
          highlights: [],
          lowlights: ["Need more data to generate insights"],
          weekScore: 0,
          timestamp: new Date().toISOString()
        });
      }

      const parseNumeric = (value: unknown): number => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const normalize = (value: number): number =>
        Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;

      const getComponentScore = (components: FitScore['components'], key: string): number => {
        const data = (components || {}) as Record<string, any>;
        const metric = data?.[key];
        if (!metric) return 0;
        if (typeof metric === 'number') {
          return normalize(metric);
        }
        return normalize(parseNumeric(metric.score));
      };

      const getComponentComment = (components: FitScore['components'], key: string): string | undefined => {
        const data = (components || {}) as Record<string, any>;
        const metric = data?.[key];
        if (metric && typeof metric === 'object' && typeof metric.comment === 'string') {
          return metric.comment;
        }
        return undefined;
      };

      const formatDateLabel = (record: FitScore): string => {
        if (record.calculatedAt instanceof Date) {
          return record.calculatedAt.toLocaleDateString();
        }

        if (typeof record.calculatedAt === 'string') {
          const parsed = new Date(record.calculatedAt);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString();
          }
        }

        if (typeof record.date === 'string') {
          const parsed = new Date(`${record.date}T00:00:00Z`);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString();
          }
        }

        return 'recent day';
      };

      // Calculate average score
      const avgScore = weekScores.reduce((sum: number, record: FitScore) => sum + parseNumeric(record.score), 0) / weekScores.length;
      const avgScoreRounded = normalize(avgScore);

      // Find best and worst days
      const sortedScores = [...weekScores].sort((a, b) => parseNumeric(b.score) - parseNumeric(a.score));
      const bestDay = sortedScores[0];
      const worstDay = sortedScores[sortedScores.length - 1];

      const highlights = [];
      const lowlights = [];

      if (bestDay) {
        const bestScore = normalize(parseNumeric(bestDay.score));
        if (bestScore >= 8) {
          highlights.push(`Peak performance on ${formatDateLabel(bestDay)} with a ${bestScore.toFixed(1)} score`);
        }

        const bestComment = getComponentComment(bestDay.components, 'trainingAlignment')
          || getComponentComment(bestDay.components, 'recovery')
          || getComponentComment(bestDay.components, 'sleep');
        if (bestComment && highlights.length < 3) {
          highlights.push(bestComment);
        }
      }

      if (avgScoreRounded >= 7.5) {
        highlights.push("Consistent high performance throughout the week");
      }

      if (worstDay) {
        const worstScore = normalize(parseNumeric(worstDay.score));
        if (worstScore < 6) {
          lowlights.push(`Recovery dip on ${formatDateLabel(worstDay)} (${worstScore.toFixed(1)} score)`);
        }

        const strainComment = getComponentComment(worstDay.components, 'trainingAlignment');
        if (strainComment && lowlights.length < 3) {
          lowlights.push(strainComment);
        }
      }

      if (weekScores.some((record) => getComponentScore(record.components, 'sleep') < 6)) {
        lowlights.push("Sleep quality needs attention");
      }

      const roastText = avgScoreRounded >= 8
        ? "Look at you, crushing it like a well-oiled machine! Your metrics are so consistent, I'm wondering if you're actually a robot. Keep this up and you'll be invincible... or at least feel that way."
        : avgScoreRounded >= 7
        ? "Solid week! You're performing well, though there's definitely room to push harder. You're like a sports car stuck in second gear - powerful, but not quite unleashed."
        : avgScoreRounded >= 6
        ? "Not bad, not great. You're hovering in that 'meh' zone. Time to step it up - your potential is higher than your actual performance right now."
        : "Okay, let's be real - this week was rough. But hey, acknowledging it is the first step. Focus on recovery, sleep, and getting back to basics.";

      res.json({
        title: avgScoreRounded >= 8 ? "🔥 Outstanding Week" :
               avgScoreRounded >= 7 ? "💪 Solid Performance" :
               avgScoreRounded >= 6 ? "⚖️ Mixed Results" :
               "📉 Recovery Week",
        roast: roastText,
        highlights: highlights.length > 0 ? highlights : ["Completed the week"],
        lowlights: lowlights.length > 0 ? lowlights : [],
        weekScore: avgScoreRounded,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[AI Roast] Error:', error);
      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          title: "💪 Solid Performance",
          roast: "Solid week! You're performing well, though there's definitely room to push harder. You're like a sports car stuck in second gear - powerful, but not quite unleashed.",
          highlights: [
            "Consistent training schedule maintained",
            "Strong recovery metrics on most days"
          ],
          lowlights: [
            "Nutrition consistency could be improved",
            "Two days showed suboptimal sleep duration"
          ],
          weekScore: 7.2,
          timestamp: new Date().toISOString()
        });
      }
      res.status(500).json({ error: 'Failed to generate weekly roast' });
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
          const tokenData = token.tokenData;
          const expiresAtRaw = tokenData.expires_at;
          const expiresAt = typeof expiresAtRaw === 'number'
            ? expiresAtRaw
            : expiresAtRaw instanceof Date
              ? Math.floor(expiresAtRaw.getTime() / 1000)
              : null;
          
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
          
          if (!tokenData.refresh_token) {
            console.log(`[TOKEN REFRESH] Token for user ${token.userId} is expired but has no refresh token`);
            continue;
          }
          
          console.log(`[TOKEN REFRESH] Refreshing token for user ${token.userId}...`);
          
          // Attempt to refresh the token
          const newToken = await whoopTokenStorage.refreshWhoopToken(token.userId, tokenData.refresh_token);
          
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

  // WHOOP OAuth callback endpoint - CLEAN IMPLEMENTATION FOLLOWING CHECKLIST
  app.get('/api/whoop/callback', async (req, res, next) => {
    try {
      console.log('[WHOOP AUTH] OAuth callback received');
      const { code, error, state } = req.query;
      
      if (error) {
        console.error('[WHOOP AUTH] OAuth error:', error);
        return res.status(400).json({ error: 'OAuth authentication failed', details: error });
      }

      if (!code) {
        console.error('[WHOOP AUTH] No authorization code received');
        return res.status(400).json({ error: 'No authorization code received' });
      }

      if (!state || !state.toString().startsWith('whoop_auth_')) {
        console.error('[WHOOP AUTH] Invalid state parameter:', state);
        return res.status(400).json({ error: 'Invalid state parameter' });
      }

      console.log('[WHOOP AUTH] Exchanging code for token...');
      const tokenResponse = await whoopApiService.exchangeCodeForToken(code as string);
      
      console.log('[WHOOP AUTH] Getting user profile...');
      const userProfile = await whoopApiService.getUserProfile(tokenResponse.access_token);
      const whoopUserId = `whoop_${userProfile.user_id}`;
      
      console.log(`[WHOOP AUTH] User authenticated: ${whoopUserId}`);
      console.log(`[WHOOP AUTH] Full user profile:`, JSON.stringify(userProfile, null, 2));
      
      // Create or get user in database with admin role check
      const userEmail = `${whoopUserId}@fitscore.local`;
      const adminWhoopId = process.env.ADMIN_WHOOP_ID || '25283528';
      const isAdmin = userProfile.user_id.toString() === adminWhoopId;
      
      const userData = {
        id: whoopUserId,
        email: userEmail,
        whoopUserId: userProfile.user_id.toString(),
        role: isAdmin ? 'admin' : 'user',
        authProvider: 'whoop' as const,
        dataSource: 'whoop' as const,
      };

      console.log(`[WHOOP AUTH] User role assignment: ${isAdmin ? 'admin' : 'user'} (Admin WHOOP ID: ${adminWhoopId})`);

      // Insert or update user in database with detailed logging
      console.log(`[WHOOP AUTH] Attempting to upsert user:`, userData);
      try {
        // Check if user exists first
        const existingUser = await db.select().from(users).where(eq(users.id, whoopUserId)).limit(1);
        if (existingUser.length === 0) {
          // User doesn't exist, create new one
          await db.insert(users).values(userData);
          console.log(`[WHOOP AUTH] New user created in database: ${whoopUserId}`);
        } else {
          // User exists, update their information including role and authProvider/dataSource
          await db.update(users).set({
            email: userData.email,
            whoopUserId: userData.whoopUserId,
            role: userData.role,
            authProvider: 'whoop',
            dataSource: 'whoop',
            updatedAt: new Date()
          }).where(eq(users.id, whoopUserId));
          console.log(`[WHOOP AUTH] Existing user updated in database: ${whoopUserId}`);
        }
      } catch (userError) {
        const message = userError instanceof Error ? userError.message : String(userError);
        console.error(`[WHOOP AUTH] User upsert failed:`, message);
        throw new Error(`Failed to create user: ${message}`);
      }
      
      // Verify user exists before creating token
      const existingUser = await db.select().from(users).where(eq(users.id, whoopUserId)).limit(1);
      if (existingUser.length === 0) {
        throw new Error(`User verification failed - user ${whoopUserId} not found after upsert`);
      }
      console.log(`[WHOOP AUTH] User verified in database: ${whoopUserId}`);
      
      // Generate long-lived JWT token for Custom GPT integration (10 years)
      const { generateJWT } = await import('./jwtAuth');
      const staticJwtToken = generateJWT(whoopUserId, userData.role, 'whoop');
      console.log(`[WHOOP AUTH] Generated static JWT token for user: ${whoopUserId} (10-year expiration)`);
      
      // Store the token with proper expiration using WHOOP user ID, including static JWT
      const tokenData = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in : undefined,
        user_id: whoopUserId,
        static_jwt: staticJwtToken
      };
      
      console.log(`[WHOOP AUTH] Attempting to store token for user: ${whoopUserId}`);
      try {
        await whoopTokenStorage.setToken(whoopUserId, tokenData);
        console.log(`[WHOOP AUTH] Token and static JWT stored successfully for WHOOP user ${whoopUserId}`);
      } catch (tokenError) {
        const message = tokenError instanceof Error ? tokenError.message : String(tokenError);
        console.error(`[WHOOP AUTH] Token storage failed:`, message);
        throw new Error(`Failed to store token: ${message}`);
      }
      console.log(`[WHOOP AUTH] Token stored for WHOOP user ${whoopUserId} with expiration:`, tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : 'no expiration');
      
      // Immediately fetch and store today's WHOOP data
      console.log(`[WHOOP AUTH] Fetching today's WHOOP data for user: ${whoopUserId}`);
      try {
        const today = new Date().toISOString().split('T')[0];
        const whoopDataResult = await whoopApiService.getTodaysData(whoopUserId);
        
        if (whoopDataResult && whoopDataResult.recovery_score !== undefined) {
          const sleepHours = typeof whoopDataResult.sleep_hours === 'number' ? whoopDataResult.sleep_hours : 0;
          const whoopDataRecord = {
            userId: whoopUserId,
            date: today,
            recoveryScore: Math.round(whoopDataResult.recovery_score),
            sleepScore: Math.round(sleepHours * 10) || 0, // Convert hours to score
            strainScore: Math.round((whoopDataResult.strain || 0) * 10), // Store as integer * 10
            restingHeartRate: Math.round(whoopDataResult.resting_heart_rate || 0)
          };
          
          // Store with unique key whoop_data_<id>_<yyyy-mm-dd>
          await storage.upsertWhoopData(whoopDataRecord);
          console.log(`[WHOOP AUTH] Today's data stored for user: ${whoopUserId}`, whoopDataRecord);
        }
      } catch (dataError) {
        const message = dataError instanceof Error ? dataError.message : String(dataError);
        console.error(`[WHOOP AUTH] Failed to fetch initial WHOOP data:`, message);
        // Continue with authentication even if data fetch fails
      }
      
      console.log(`[WHOOP AUTH] Using static JWT token for redirect to user: ${whoopUserId} with role: ${userData.role}`);

      // Check if request is from mobile app (via User-Agent or query param)
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = userAgent.includes('Expo') ||
                       userAgent.includes('FitScore') ||
                       userAgent.includes('iPhone') ||
                       userAgent.includes('Android') ||
                       req.query.mobile === 'true';

      if (isMobile) {
        // Direct redirect to mobile app - WebBrowser.openAuthSessionAsync will catch this
        console.log(`[WHOOP AUTH] Redirecting to mobile app with token`);
        res.redirect(`fitsmart://auth?token=${staticJwtToken}`);
      } else {
        // Redirect to web dashboard
        res.redirect(`/#token=${staticJwtToken}`);
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP AUTH] Callback error:', message);
      
      // Check if it's a token exchange error (common with expired/used auth codes)
      if (message.includes('invalid_grant') || message.includes('HTTP 400') || message.includes('request_forbidden')) {
        console.log('[WHOOP AUTH] OAuth error detected:', message);
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
                <p>Error: ${message}</p>
                <p>This usually happens when the authorization code expires or is used more than once.</p>
              </div>
              <div class="retry-info">
                <p>Please try authenticating again with a fresh authorization code.</p>
                <button class="retry-btn" onclick="window.location.href='/api/whoop/login'">
                  🔄 Retry WHOOP Authentication
                </button>
              </div>
              <script>
                console.error('[WHOOP AUTH] OAuth error:', '${message.replace(/'/g, "\\'")}');
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
            <div class="message">WHOOP authentication encountered an error: ${message}</div>
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

  // ─── Email Auth ────────────────────────────────────────────────────────────

  // POST /api/auth/register — create an email/password account (manual-mode user)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check uniqueness
      const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 12);
      const userId = `user_${crypto.randomUUID()}`;

      await db.insert(users).values({
        id: userId,
        email: normalizedEmail,
        whoopUserId: null,
        role: 'user',
        authProvider: 'email',
        dataSource: 'manual',
        passwordHash,
      });
      console.log(`[EMAIL AUTH] New user registered: ${userId}`);

      const { generateJWT } = await import('./jwtAuth');
      const token = generateJWT(userId, 'user', 'manual');

      res.json({ token, userId, dataSource: 'manual' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[EMAIL AUTH] Register error:', message);
      res.status(500).json({ error: 'Registration failed', details: message });
    }
  });

  // POST /api/auth/login — sign in with email + password
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const found = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      const user = found[0];

      if (!user || user.authProvider !== 'email' || !user.passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const bcrypt = await import('bcrypt');
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      console.log(`[EMAIL AUTH] User signed in: ${user.id}`);
      const { generateJWT } = await import('./jwtAuth');
      const token = generateJWT(user.id, user.role, user.dataSource);

      res.json({ token, userId: user.id, dataSource: user.dataSource });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[EMAIL AUTH] Login error:', message);
      res.status(500).json({ error: 'Login failed', details: message });
    }
  });

  // GET /api/auth/me — return current user info
  app.get('/api/auth/me', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = found[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        authProvider: user.authProvider,
        dataSource: user.dataSource,
        whoopConnected: !!user.whoopUserId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to fetch user', details: message });
    }
  });

  // POST /api/auth/forgot-password — request a password reset email
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const found = await db.select().from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);
      const user = found[0];

      // Always return ok — never leak whether the email exists
      if (!user || user.authProvider !== 'email') {
        return res.json({ ok: true });
      }

      // Generate a random token and store it with 1-hour expiry
      const { randomBytes } = await import('crypto');
      const rawToken = randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.update(users)
        .set({ resetToken: rawToken, resetTokenExpiry: expiry })
        .where(eq(users.id, user.id));

      // Send reset email via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.error('[FORGOT PW] RESEND_API_KEY not set — cannot send email');
        return res.json({ ok: true });
      }

      const resendClient = new Resend(resendKey);
      const serverUrl = process.env.SERVER_URL || 'https://fitsmart-production.up.railway.app';
      const resetLink = `${serverUrl}/reset-password?token=${rawToken}`;
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

      const { data: emailData, error: emailError } = await resendClient.emails.send({
        from: fromAddress,
        to: user.email,
        subject: 'Reset your FitSmart password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d1117;color:#fff;border-radius:12px">
            <h2 style="margin-top:0;color:#27e9b5">Reset your password</h2>
            <p>You requested a password reset for your FitSmart account.</p>
            <p>Tap the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
            <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:14px 28px;background:#27e9b5;color:#0d1117;border-radius:8px;text-decoration:none;font-weight:600">
              Reset Password
            </a>
            <p style="color:#888;font-size:13px;margin-top:24px">
              If you didn't request this, ignore this email — your password won't change.
            </p>
          </div>
        `,
      });

      if (emailError) {
        console.error('[FORGOT PW] Resend error:', JSON.stringify(emailError));
      } else {
        console.log(`[FORGOT PW] Reset email sent to ${user.email}, id: ${emailData?.id}`);
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FORGOT PW] Error:', message);
      res.status(500).json({ error: 'Failed to send reset email' });
    }
  });

  // POST /api/auth/reset-password — set new password using reset token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body ?? {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Reset token is required' });
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const found = await db.select().from(users)
        .where(eq(users.resetToken, token))
        .limit(1);
      const user = found[0];

      if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return res.status(400).json({ error: 'Reset link is invalid or has expired' });
      }

      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.default.hash(newPassword, 12);

      await db.update(users)
        .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
        .where(eq(users.id, user.id));

      console.log(`[RESET PW] Password updated for user ${user.id}`);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[RESET PW] Error:', message);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // ─── End Email Auth ─────────────────────────────────────────────────────────

  // WHOOP raw data debug endpoint (JWT-authenticated)
  app.get('/api/whoop/raw', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[WHOOP RAW] Getting raw WHOOP data for user: ${userId}`);
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please authenticate with WHOOP to access this resource'
        });
      }
      
      // Fetch comprehensive raw data for debugging
      const rawData = await whoopApiService.getTodaysData(userId);
      
      return res.json({
        timestamp: new Date().toISOString(),
        userId: userId,
        rawData: rawData,
        message: 'Raw WHOOP API response for debugging purposes'
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP RAW] Error:', message);
      res.status(500).json({ 
        error: 'Failed to fetch raw WHOOP data',
        details: message 
      });
    }
  });

  // WHOOP authentication status endpoint
  app.get('/api/whoop/status', requireJWTAuth, async (req, res) => {
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
      } catch (tokenError) {
        const tokenErrorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
        // Token appears valid but fails API validation
        console.error('[TOKEN TEST] Token validation failed:', tokenErrorMessage);
        res.json({
          authenticated: false,
          message: 'WHOOP token is invalid or expired',
          auth_url: '/api/whoop/login',
          expires_at: tokenData.expires_at
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error checking WHOOP status:', message);
      res.status(500).json({ error: 'Failed to check WHOOP authentication status' });
    }
  });

  // Debug endpoint to test OAuth URL generation
  app.get('/api/whoop/debug', async (req, res) => {
    try {
      const oauthUrl = whoopApiService.getOAuthUrl();
      const defaultUserId = await getDefaultUserId();
      const tokenData = await whoopTokenStorage.getToken(defaultUserId);
      
      // Use the same redirect URI logic as the service (from .env)
      const redirectUriEnv = process.env.WHOOP_REDIRECT_URI?.trim();
      if (!redirectUriEnv) {
        throw new Error('WHOOP_REDIRECT_URI must be set in environment variables');
      }
      
      res.json({
        oauth_url: oauthUrl,
        client_id: process.env.WHOOP_CLIENT_ID,
        redirect_uri: redirectUriEnv, // Use .env value, not hardcoded Replit URL
        status: 'OAuth flow ready',
        has_token: !!tokenData,
        token_valid: tokenData ? whoopTokenStorage.isTokenValid(tokenData) : false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to generate OAuth URL', details: message });
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
      const sessionRequest = req as typeof req & { session?: any; sessionID?: string };
      if (!sessionRequest.session) {
        return res.status(500).json({ error: 'Session middleware not available' });
      }

      const session = sessionRequest.session as any;
      session.userId = whoopUserId;
      
      console.log(`[TEST SESSION] Setting session userId to: ${whoopUserId}`);
      console.log(`[TEST SESSION] Session before save:`, session);
      
      // Save session and return success
      session.save?.((err: unknown) => {
        if (err) {
          console.error('[TEST SESSION] Session save error:', err);
          return res.status(500).json({ error: 'Session creation failed' });
        }
        
        console.log(`[TEST SESSION] Session saved successfully for WHOOP user ${whoopUserId}`);
        console.log(`[TEST SESSION] Session after save:`, sessionRequest.session);
        
        // Force session modification and save
        session.touch?.();
        if (sessionRequest.session) {
          (sessionRequest.session as any).modified = true;
        }

        session.save?.((saveErr: unknown) => {
          if (saveErr) {
            console.error('[TEST SESSION] Session save failed:', saveErr);
            return res.status(500).json({ error: 'Session save failed' });
          }
          
          // Manually set the Set-Cookie header for testing
          const cookieName = 'fitscore.sid';
          const cookieValue = sessionRequest.sessionID ?? '';
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
            sessionId: sessionRequest.sessionID,
            cookieSet: true
          });
        });

      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error creating test session:', message);
      res.status(500).json({ error: 'Failed to create test session' });
    }
  });

  // Session debugging endpoint
  console.log('[ROUTE] GET /api/session/debug');
  app.get('/api/session/debug', (req, res) => {
    const userId = getCurrentUserId(req);
    const sessionRequest = req as typeof req & { session?: any; sessionID?: string };

    res.json({
      sessionId: sessionRequest.sessionID,
      userId: userId,
      sessionExists: !!sessionRequest.session,
      sessionKeys: sessionRequest.session ? Object.keys(sessionRequest.session) : [],
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
        const message = userError instanceof Error ? userError.message : String(userError);
        console.error('Failed to create test user:', message);
        return res.status(500).json({ error: 'Failed to create test user', details: message });
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error setting test token:', message);
      res.status(500).json({ error: 'Failed to set test token', details: message });
    }
  });

  // FitScore Forecast endpoint - predicts today's FitScore based on current metrics
  app.get('/api/fitscore/forecast', requireJWTAuth, async (req, res) => {
    console.log('[FITSCORE FORECAST] Generating forecast');
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const todayDate = todayKey(tz);

      // Fetch today's WHOOP data
      let todayData;
      try {
        todayData = await whoopApiService.getTodaysData(userId);
      } catch (error) {
        // Fallback to cached data
        const cachedData = await storage.getWhoopDataByUserAndDate(userId, todayDate);
        if (cachedData) {
          todayData = {
            recovery_score: cachedData.recoveryScore,
            sleep_score: cachedData.sleepScore,
            sleep_hours: cachedData.sleepHours,
            strain: cachedData.strainScore,
            hrv: cachedData.hrv,
            resting_heart_rate: cachedData.restingHeartRate,
          };
        } else {
          return res.status(404).json({ error: 'No WHOOP data available' });
        }
      }

      // Use FitScore v3.0 calculator for forecast (1-10 scale)
      const { fitScoreCalculatorV3 } = await import('./services/fitScoreCalculatorV3');

      const recovery = todayData.recovery_score || 0;
      const sleepScore = todayData.sleep_score || 0;
      const sleepHours = todayData.sleep_hours || 0;
      const hrv = todayData.hrv || 0;
      const rhr = todayData.resting_heart_rate || 0;
      const strain = todayData.strain || 0;

      // Build input for v3.0 calculator
      const forecastInput = {
        sleepHours,
        targetSleepHours: 8.0,
        recoveryPercent: recovery,
        currentHRV: hrv,
        baselineHRV: hrv, // Use current as baseline for forecast
        currentRHR: rhr,
        baselineRHR: rhr,
        actualStrain: strain,
        targetStrain: 14.0,
        // Predict nutrition and training based on typical behavior
        meals: [] // No meals yet - will predict
      };

      // Calculate current metrics (what we know)
      const partialResult = fitScoreCalculatorV3.calculate(forecastInput, todayDate);

      // Predict nutrition score (assume user will log 3-4 balanced meals)
      const predictedNutritionScore = 7.5; // Optimistic but realistic

      // Dynamic nutrition tip based on projected score
      const projectedScoreWithoutNutrition = (
        partialResult.components.sleep.score * 0.25 +
        partialResult.components.recovery.score * 0.25 +
        partialResult.components.cardioBalance.score * 0.15 +
        8.0 * 0.10 // Assume decent training
      );
      const nutritionImpact = predictedNutritionScore * 0.25;
      const potentialTotal = projectedScoreWithoutNutrition + nutritionImpact;

      let nutritionTip = 'Aim for 3-4 balanced meals with adequate protein';
      if (potentialTotal >= 8.0) {
        // Only mention hitting 8+ if actually achievable
        nutritionTip = 'Aim for 3-4 balanced meals with adequate protein to maintain strong performance';
      }

      // Predict training alignment (based on strain and recovery)
      let predictedTrainingScore = 8.0;
      let trainingTip = 'Follow your planned training — your body is ready';

      if (recovery < 50) {
        predictedTrainingScore = 6.0;
        trainingTip = 'Consider light active recovery instead of high intensity';
      } else if (recovery >= 70) {
        predictedTrainingScore = 9.0;
        trainingTip = 'Great day for quality training — push for your goals';
      }

      // Calculate projected FitScore with predicted nutrition and training
      const projectedFitScore = (
        partialResult.components.sleep.score * 0.25 +
        partialResult.components.recovery.score * 0.25 +
        partialResult.components.cardioBalance.score * 0.15 +
        predictedNutritionScore * 0.25 +
        predictedTrainingScore * 0.10
      );

      const forecast = Math.round(projectedFitScore * 10) / 10; // Round to 0.1

      // Generate insight with predictions
      let insight = '';
      const factors = {
        sleep: `${sleepHours.toFixed(1)}h (${partialResult.components.sleep.score}/10)`,
        recovery: `${recovery}% (${partialResult.components.recovery.score}/10)`,
        cardio: `HRV ${hrv}ms, RHR ${rhr}bpm (${partialResult.components.cardioBalance.score}/10)`,
        nutritionPrediction: `Projected: ${predictedNutritionScore}/10`,
        trainingPrediction: `Projected: ${predictedTrainingScore}/10`
      };

      let insightLine1 = '';
      let insightLine2 = '';

      if (recovery >= 70 && sleepScore >= 70) {
        insightLine1 = `Forecast: ${forecast}/10 — your body is primed.`;
        insightLine2 = trainingTip + '.';
      } else if (recovery >= 50 && sleepScore >= 50) {
        insightLine1 = `Forecast: ${forecast}/10 — moderate output expected.`;
        insightLine2 = trainingTip + '.';
      } else {
        insightLine1 = `Forecast: ${forecast}/10 — recovery takes priority.`;
        insightLine2 = trainingTip + '.';
      }

      // Keep insight for backward compat
      insight = `${insightLine1}\n${insightLine2}`;

      const response = {
        forecast, // Now 1-10 scale
        factors,
        insight,
        insightLine1,
        insightLine2,
        nutritionTip,
        trainingTip,
        updatedAt: new Date().toISOString(),
      };

      console.log(`[FITSCORE FORECAST] user=${userId} forecast=${forecast}/10 recovery=${recovery}% sleep=${sleepScore}%`);
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITSCORE FORECAST] Error:', message);
      res.status(500).json({ error: 'Failed to generate forecast', details: message });
    }
  });

  // FitScore history endpoint (7-day sparkline data)
  app.get('/api/fitscore/history', requireJWTAuth, async (req, res) => {
    console.log('[FITSCORE HISTORY] Fetching 7-day history');
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Fetch last 7 days of FitScores from the database
      const result = await db
        .select({
          date: fitScores.date,
          score: fitScores.score,
        })
        .from(fitScores)
        .where(eq(fitScores.userId, userId))
        .orderBy(desc(fitScores.date))
        .limit(7);

      if (result.length === 0) {
        return res.json({ scores: [], weeklyAverage: 0, trend: 0 });
      }

      // Reverse to get chronological order (oldest to newest)
      const scores = result.reverse().map(item => ({
        date: item.date,
        score: Number(item.score.toFixed(1)),
      }));

      // Calculate weekly average
      const weeklyAverage = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;

      // Calculate trend (difference between last 3 days avg and first 3 days avg)
      let trend = 0;
      if (scores.length >= 6) {
        const firstThree = scores.slice(0, 3).reduce((sum, item) => sum + item.score, 0) / 3;
        const lastThree = scores.slice(-3).reduce((sum, item) => sum + item.score, 0) / 3;
        trend = lastThree - firstThree;
      }

      console.log(`[FITSCORE HISTORY] user=${userId} count=${scores.length} avg=${weeklyAverage.toFixed(1)} trend=${trend >= 0 ? '+' : ''}${trend.toFixed(1)}`);

      res.json({
        scores,
        weeklyAverage: Number(weeklyAverage.toFixed(1)),
        trend: Number(trend.toFixed(1)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITSCORE HISTORY] Error:', message);
      res.status(500).json({ error: 'Failed to fetch FitScore history', details: message });
    }
  });

  // GET /api/fitscore/date — fetch stored FitScore for a specific past date
  app.get('/api/fitscore/date', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { date } = req.query;
      if (!date || typeof date !== 'string') {
        return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
      }

      const result = await db
        .select()
        .from(fitScores)
        .where(and(eq(fitScores.userId, userId), eq(fitScores.date, date)))
        .limit(1);

      if (result.length === 0) {
        return res.json({ found: false });
      }

      const row = result[0];
      return res.json({
        found: true,
        date: row.date,
        score: row.score,
        calculatedAt: row.calculatedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITSCORE DATE] Error:', message);
      return res.status(500).json({ error: 'Failed to fetch FitScore', details: message });
    }
  });

  // Goals endpoints
  // GET /api/goals - Fetch all goals for user
  app.get('/api/goals', requireJWTAuth, async (req, res) => {
    console.log('[GOALS] Fetching user goals');
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const goals = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .orderBy(desc(userGoals.createdAt));

      console.log(`[GOALS] Found ${goals.length} goals for user ${userId}`);
      res.json(goals);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[GOALS] Error fetching goals:', message);
      res.status(500).json({ error: 'Failed to fetch goals', details: message });
    }
  });

  // POST /api/goals - Create new goal
  app.post('/api/goals', requireJWTAuth, async (req, res) => {
    console.log('[GOALS] Creating new goal, body:', JSON.stringify(req.body));
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { title, emoji, category, progress, streak, microhabits } = req.body;

      if (!title || !category) {
        console.log(`[GOALS] Validation failed - title: "${title}", category: "${category}"`);
        return res.status(400).json({ error: `Missing required fields (title: ${!!title}, category: ${!!category})` });
      }

      console.log(`[GOALS] Inserting goal for user ${userId}: title="${title}", category="${category}", emoji="${emoji}"`);

      const goalId = crypto.randomUUID();
      const microhabitsValue = typeof microhabits === 'string'
        ? JSON.parse(microhabits)
        : (microhabits ?? []);

      const newGoal = await db
        .insert(userGoals)
        .values({
          id: goalId,
          userId,
          title,
          emoji: emoji || '🎯',
          category,
          progress: progress || 0,
          streak: streak || 0,
          microhabits: microhabitsValue,
        })
        .returning();

      console.log(`[GOALS] Created goal ${newGoal[0].id} for user ${userId}`);
      res.json(newGoal[0]);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[GOALS] Error creating goal:', message);
      res.status(500).json({ error: 'Failed to create goal', details: message });
    }
  });

  // PATCH /api/goals/:id - Update existing goal
  app.patch('/api/goals/:id', requireJWTAuth, async (req, res) => {
    console.log('[GOALS] Updating goal');
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const updates = { ...req.body };
      // Ensure microhabits is stored as object/array, not a double-encoded string
      if (updates.microhabits && typeof updates.microhabits === 'string') {
        try { updates.microhabits = JSON.parse(updates.microhabits); } catch { updates.microhabits = []; }
      }

      // Verify goal belongs to user
      const [existingGoal] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.id, id))
        .limit(1);

      if (!existingGoal) {
        return res.status(404).json({ error: 'Goal not found' });
      }

      if (existingGoal.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const [updatedGoal] = await db
        .update(userGoals)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(userGoals.id, id))
        .returning();

      console.log(`[GOALS] Updated goal ${id}`);
      res.json(updatedGoal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[GOALS] Error updating goal:', message);
      res.status(500).json({ error: 'Failed to update goal', details: message });
    }
  });

  // DELETE /api/goals/:id - Delete goal
  app.delete('/api/goals/:id', requireJWTAuth, async (req, res) => {
    console.log('[GOALS] Deleting goal');
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // Verify goal belongs to user
      const [existingGoal] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.id, id))
        .limit(1);

      if (!existingGoal) {
        return res.status(404).json({ error: 'Goal not found' });
      }

      if (existingGoal.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await db
        .delete(userGoals)
        .where(eq(userGoals.id, id));

      console.log(`[GOALS] Deleted goal ${id}`);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[GOALS] Error deleting goal:', message);
      res.status(500).json({ error: 'Failed to delete goal', details: message });
    }
  });

  // WHOOP today's data endpoint (JWT-authenticated)
  app.get('/api/whoop/today', requireJWTAuth, async (req, res) => {
    console.log(`[WHOOP TODAY] *** ENDPOINT CALLED *** This should always appear in logs`);
    try {
      const userId = getCurrentUserId(req);
      const sourceLive = req.query.source === 'live';
      const invalidateCache = req.query.invalidate === '1';
      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const todayDate = todayKey(tz);
      
      console.log(`[WHOOP TODAY] Getting today's WHOOP data for user: ${userId}, source: ${sourceLive ? 'live' : 'auto'}, invalidate: ${invalidateCache}`);
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please authenticate with WHOOP to access this resource'
        });
      }
      
      // Handle cache invalidation if requested
      if (invalidateCache) {
        console.log(`[WHOOP TODAY] Invalidating cache for user=${userId} date=${todayDate}`);
        await storage.deleteWhoopDataByUserAndDate(userId, todayDate);
      }
      
      // If source=live, bypass cache and fetch directly from WHOOP
      let shouldTryLive = sourceLive || true; // Always try live first unless only cache requested
      let freshData = null;
      let source = 'cache';
      
      if (shouldTryLive) {
        console.log(`[WHOOP TODAY] Attempting to fetch fresh WHOOP data for user: ${userId}`);
        
        try {
          console.log(`[WHOOP TODAY] About to call whoopApiService.getTodaysData for user: ${userId}`);

          // Check if WHOOP token exists for this user
          const tokenCheck = await whoopTokenStorage.getToken(userId);
          if (!tokenCheck) {
            console.error(`[WHOOP TODAY] ❌ No WHOOP token found for user: ${userId}`);
            console.error(`[WHOOP TODAY] User needs to complete WHOOP OAuth authentication`);
          } else {
            console.log(`[WHOOP TODAY] ✅ Found WHOOP token for user: ${userId}, expires: ${tokenCheck.expires_at ? new Date(tokenCheck.expires_at * 1000) : 'no expiration'}`);
          }

          freshData = await whoopApiService.getTodaysData(userId);
          console.log(`[WHOOP TODAY] getTodaysData returned:`, JSON.stringify(freshData, null, 2).substring(0, 500));

          // Accept data if we have any valid WHOOP data (cycle_id, recovery_score, or strain)
          const hasValidData = freshData && (
            freshData.cycle_id ||
            typeof freshData.recovery_score === 'number' ||
            typeof freshData.strain === 'number'
          );

          if (hasValidData) {
            const recoveryScore = freshData.recovery_score || 0;
            const sleepScore = typeof freshData.sleep_score === 'number' ? freshData.sleep_score : 0;
            const strain = typeof freshData.strain === 'number' ? freshData.strain : 0;
            const restingHeartRate = typeof freshData.resting_heart_rate === 'number' ? freshData.resting_heart_rate : 0;
            const sleepHours = typeof freshData.sleep_hours === 'number' ? freshData.sleep_hours : 0;
            const hrv = typeof freshData.hrv === 'number' ? freshData.hrv : 0;
            const respiratoryRate = typeof freshData.respiratory_rate === 'number' ? freshData.respiratory_rate : 0;
            const skinTemp = typeof freshData.skin_temperature === 'number' ? freshData.skin_temperature : 0;
            const spo2 = typeof freshData.spo2_percentage === 'number' ? freshData.spo2_percentage : 0;
            const averageHeartRate = typeof freshData.average_heart_rate === 'number' ? freshData.average_heart_rate : 0;

            // Store the fresh data in cache
            await storage.upsertWhoopData({
              userId: userId,
              date: todayDate,
              recoveryScore: Math.round(recoveryScore),
              sleepScore: Math.round(sleepScore || 0), // Store sleep score as percentage
              strainScore: strain || 0, // Store strain as decimal for precision
              restingHeartRate: Math.round(restingHeartRate || 0),
              sleepHours: sleepHours || 0,
              hrv: hrv || 0, // Store HRV as decimal for precision
              respiratoryRate: respiratoryRate || 0,
              skinTempCelsius: skinTemp || 0,
              spo2Percentage: spo2 || 0,
              averageHeartRate: Math.round(averageHeartRate || 0)
            });
            
            source = 'live';
            console.log(`[WHOOP TODAY] user=${userId} date=${todayDate} source=${source} values: rec=${Math.round(recoveryScore)}% sleepScore=${Math.round(sleepScore)}% hours=${sleepHours} strain=${strain} hrv=${Math.round(hrv)} rhr=${Math.round(restingHeartRate)}`);
            
            return res.json({
              recovery_score: recoveryScore,
              sleep_score: sleepScore,
              sleep_hours: sleepHours,
              strain,
              resting_heart_rate: restingHeartRate,
              hrv: Math.round(hrv),
              date: todayDate,
              user_id: userId,
              timestamp: new Date().toISOString(),
              source: 'live'
            });
          }
        } catch (fetchError) {
          const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.log(`[WHOOP TODAY] Live fetch failed: ${fetchMessage}`);
          // Continue to cache fallback
        }
      }
      
      // Try cached data if live failed or wasn't requested
      if (!sourceLive || !freshData) {
        console.log(`[WHOOP TODAY] Looking for cached data with userId: ${userId}, date: ${todayDate}`);
        const cachedData = await storage.getWhoopDataByUserAndDate(userId, todayDate);
        
        if (cachedData) {
          source = 'cache';
          console.log(`[WHOOP TODAY] user=${userId} date=${todayDate} source=${source} values: rec=${cachedData.recoveryScore}% sleepScore=${cachedData.sleepScore}% hours=${cachedData.sleepHours} strain=${cachedData.strainScore / 10} hrv=${cachedData.hrv} rhr=${cachedData.restingHeartRate}`);
          
          return res.json({
            recovery_score: cachedData.recoveryScore,
            sleep_score: cachedData.sleepScore,
            sleep_hours: cachedData.sleepHours || null,
            strain: cachedData.strainScore,
            resting_heart_rate: cachedData.restingHeartRate,
            hrv: cachedData.hrv || null,
            date: todayDate,
            user_id: userId,
            timestamp: new Date().toISOString(),
            source: 'cache'
          });
        }
      }
      console.log(`[WHOOP TODAY] No fresh or cached data available for user: ${userId}`);
      return res.status(404).json({
        error: 'No WHOOP data available',
        message: 'Please complete WHOOP OAuth authentication to fetch today\'s data',
        date: todayDate
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP TODAY] Error:', message);
      res.status(500).json({
        error: 'Failed to fetch WHOOP data',
        details: message
      });
    }
  });

  // HRV Baseline endpoint - returns 7-day rolling average HRV
  app.get('/api/whoop/hrv-baseline', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate with WHOOP to access this resource'
        });
      }

      console.log(`[HRV BASELINE] Calculating 7-day HRV baseline for user: ${userId}`);

      // Use getWeeklyAverages which already calculates 7-day HRV average
      const weeklyAverages = await whoopApiService.getWeeklyAverages(userId);

      if (weeklyAverages.avgHRV !== null) {
        console.log(`[HRV BASELINE] 7-day average HRV: ${weeklyAverages.avgHRV}ms for user: ${userId}`);
        return res.json({
          hrv_baseline: weeklyAverages.avgHRV,
          period_days: 7,
          user_id: userId,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`[HRV BASELINE] No HRV data available for baseline calculation for user: ${userId}`);
        return res.status(404).json({
          error: 'Insufficient HRV data',
          message: 'Not enough HRV data available to calculate baseline',
          user_id: userId
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[HRV BASELINE] Error:', message);
      res.status(500).json({
        error: 'Failed to calculate HRV baseline',
        details: message
      });
    }
  });

  // WHOOP workouts for a specific date (for training import)
  app.get('/api/whoop/workouts', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' });
      }

      console.log(`[WHOOP WORKOUTS] Fetching workouts for user=${userId} date=${date}`);
      const workouts = await whoopApiService.getWorkoutsForDate(userId, date);
      console.log(`[WHOOP WORKOUTS] Found ${workouts.length} workout(s)`);
      res.json(workouts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP WORKOUTS] Error:', message);
      res.status(500).json({ error: 'Failed to fetch WHOOP workouts', details: message });
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
        userId: defaultUserId,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[N8N ENDPOINT] n8n WHOOP fetch failed:', message);
      
      // Check if it's a token-related error and provide helpful message
      if (message.includes('token') || message.includes('access')) {
        return res.status(401).json({ 
          error: 'WHOOP authentication failed',
          message: 'Please visit /api/whoop/login to re-authenticate with WHOOP',
          auth_url: '/api/whoop/login'
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch WHOOP data',
        message
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
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        console.error('[TOKEN REFRESH TEST] Token refresh failed:', refreshMessage);
        
        // Restore original token
        await whoopTokenStorage.setToken(defaultUserId, currentToken);
        
        res.json({
          success: false,
          message: 'Token refresh failed',
          error: refreshMessage,
          refresh_worked: false,
          reason: refreshMessage.includes('refresh token') ? 'No refresh token available' : 'Refresh API failed'
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TOKEN REFRESH TEST] Test failed:', message);
      res.status(500).json({ 
        error: 'Token refresh test failed',
        message
      });
    }
  });

  // Test endpoint to generate JWT token for testing (development only)
  console.log('[ROUTE] GET /api/test/jwt');
  app.get('/api/test/jwt', async (req, res) => {
    try {
      const { generateJWT } = await import('./jwtAuth');
      const requestedUserId = req.query.userId as string;
      const testUserId = requestedUserId ? `whoop_${requestedUserId}` : 'whoop_99999999';
      const testToken = generateJWT(testUserId, 'user', 'whoop');
      
      console.log(`[TEST] Generated JWT token for test user: ${testUserId}`);
      res.json({ 
        token: testToken,
        userId: testUserId,
        message: 'Test JWT token generated successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TEST] JWT generation error:', message);
      res.status(500).json({ error: 'Failed to generate test JWT token', details: message });
    }
  });

  // Test endpoint to simulate WHOOP OAuth callback success
  console.log('[ROUTE] GET /api/test/whoop-callback');
  app.get('/api/test/whoop-callback', async (req, res) => {
    try {
      const testUserId = 'whoop_88888888';
      
      // Create user in database FIRST (before token) with conflict handling
      const userEmail = `${testUserId}@fitscore.local`;
      const adminWhoopId = process.env.ADMIN_WHOOP_ID;
      const isAdmin = adminWhoopId && testUserId.replace('whoop_', '') === adminWhoopId;
      
      const userData = {
        id: testUserId,
        email: userEmail,
        whoopUserId: testUserId.replace('whoop_', ''),
        role: isAdmin ? 'admin' : 'user'
      };
      
      console.log(`[TEST] Attempting to upsert user:`, userData);
      try {
        // Check if user exists first
        const existingUser = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
        if (existingUser.length === 0) {
          // User doesn't exist, create new one
          await db.insert(users).values(userData);
          console.log(`[TEST] New user created in database: ${testUserId}`);
        } else {
          console.log(`[TEST] User already exists in database: ${testUserId}`);
        }
      } catch (userError) {
        console.error(`[TEST] User upsert failed:`, userError);
        // Continue execution even if user creation fails (user might already exist)
      }
      
      // Then simulate token storage (after user exists)
      await whoopTokenStorage.setToken(testUserId, {
        access_token: 'test_access_token',
        refresh_token: 'test_refresh_token', 
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user_id: testUserId
      });
      
      // Generate JWT token for authentication with role
      const { generateJWT } = await import('./jwtAuth');
      const authToken = generateJWT(testUserId, userData.role, 'whoop');
      
      console.log(`[TEST] JWT token generated for simulated user: ${testUserId}`);
      
      // Redirect to dashboard with token like real callback
      res.redirect(`/#token=${authToken}`);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TEST] Simulated callback error:', message);
      res.status(500).json({ error: 'Test callback failed', details: message });
    }
  });

  // WHOOP weekly averages endpoint
  app.get('/api/whoop/weekly', requireJWTAuth, async (req, res) => {
    try {
      console.log('Fetching weekly WHOOP averages...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Token validation using user-specific token
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const tokenData = await whoopTokenStorage.getToken(userId);
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token for user' });
      }

      // Try WHOOP API first, fallback to cache if needed
      let weeklyData;
      const isTokenValid = whoopTokenStorage.isTokenValid(tokenData);

      if (!isTokenValid) {
        console.warn('WHOOP access token has expired. Using cache fallback only.');
      }

      try {
        if (isTokenValid) {
          weeklyData = await whoopApiService.getWeeklyAverages(userId);
        } else {
          throw new Error('Token expired, skip to cache');
        }
        
        // If API succeeds but returns null values, try cache fallback
        if (!weeklyData || (weeklyData.avgRecovery === null && weeklyData.avgStrain === null && weeklyData.avgSleep === null && weeklyData.avgHRV === null)) {
          console.log('WHOOP API returned null values, trying cache fallback');
          throw new Error('No data from WHOOP API');
        }
        
        console.log('Weekly WHOOP averages retrieved successfully from API');
      } catch (apiError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        console.log('Failed to get weekly data from WHOOP API, trying cache fallback', apiMessage ? `(${apiMessage})` : '');
        
        // Get 7 days of cached data as fallback using timezone-aware dates
        const tz = process.env.USER_TZ || 'Europe/Zurich';
        const cachedData = [];
        for (let i = 0; i < 7; i++) {
          const dateIso = DateTime.now().setZone(tz).minus({ days: i }).toISODate();
          if (!dateIso) {
            continue;
          }
          const dayData = await storage.getWhoopDataByUserAndDate(userId, dateIso);
          if (dayData) cachedData.push(dayData);
        }
        
        if (cachedData && cachedData.length > 0) {
          // Calculate averages from cached data
          const recoverySum = cachedData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0);
          const strainSum = cachedData.reduce((sum, d) => sum + (d.strainScore || 0), 0);
          const sleepSum = cachedData.reduce((sum, d) => sum + (d.sleepScore || 0), 0);
          const hrvSum = cachedData.reduce((sum, d) => sum + (d.hrv || 0), 0);
          
          const count = cachedData.length;
          weeklyData = {
            avgRecovery: recoverySum > 0 ? Math.round(recoverySum / count) : null,
            avgStrain: strainSum > 0 ? Math.round((strainSum / count) * 10) / 10 : null,
            avgSleep: sleepSum > 0 ? Math.round(sleepSum / count) : null,
            avgHRV: hrvSum > 0 ? Math.round(hrvSum / count) : null
          };
          const used = 'cache-only';
          console.log(`[WHOOP WEEKLY] user=${userId} tz=${tz} used=${used} avg: rec=${weeklyData.avgRecovery}, strain=${weeklyData.avgStrain}, sleep=${weeklyData.avgSleep}, hrv=${weeklyData.avgHRV}`);
        } else {
          weeklyData = { avgRecovery: null, avgStrain: null, avgSleep: null, avgHRV: null };
        }
      }
      
      // Get weekly average from a month ago for comparison
      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const now = DateTime.now().setZone(tz);

      // Get data from the same 7-day period one month ago (days 28-34)
      const monthAgoWeekData = [];
      for (let i = 28; i <= 34; i++) {
        const dateIso = now.minus({ days: i }).toISODate();
        if (!dateIso) continue;
        const dayData = await storage.getWhoopDataByUserAndDate(userId, dateIso);
        if (dayData) monthAgoWeekData.push(dayData);
      }

      // Only calculate deltas if we have enough comparison data (at least 4 days from a month ago)
      let sleepDelta = undefined;
      let recoveryDelta = undefined;
      let strainDelta = undefined;
      let hrvDelta = undefined;

      if (monthAgoWeekData.length >= 4) {
        const count = monthAgoWeekData.length;
        const monthAgoAvg = {
          avgRecovery: Math.round(monthAgoWeekData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / count),
          avgStrain: Math.round((monthAgoWeekData.reduce((sum, d) => sum + (d.strainScore || 0), 0) / count) * 10) / 10,
          avgSleep: Math.round(monthAgoWeekData.reduce((sum, d) => sum + (d.sleepScore || 0), 0) / count),
          avgHRV: Math.round(monthAgoWeekData.reduce((sum, d) => sum + (d.hrv || 0), 0) / count)
        };

        console.log(`[WHOOP WEEKLY] Month ago week (days 28-34) avg: sleep=${monthAgoAvg.avgSleep}%, recovery=${monthAgoAvg.avgRecovery}%, strain=${monthAgoAvg.avgStrain}, hrv=${monthAgoAvg.avgHRV}ms (${count} days)`);
        console.log(`[WHOOP WEEKLY] Current week (days 0-6) avg: sleep=${weeklyData.avgSleep}%, recovery=${weeklyData.avgRecovery}%, strain=${weeklyData.avgStrain}, hrv=${weeklyData.avgHRV}ms`);

        // Calculate deltas (percentage points for sleep/recovery, absolute for strain/HRV)
        sleepDelta = weeklyData.avgSleep && monthAgoAvg.avgSleep
          ? Math.round(weeklyData.avgSleep - monthAgoAvg.avgSleep) : undefined;
        recoveryDelta = weeklyData.avgRecovery && monthAgoAvg.avgRecovery
          ? Math.round(weeklyData.avgRecovery - monthAgoAvg.avgRecovery) : undefined;
        strainDelta = weeklyData.avgStrain && monthAgoAvg.avgStrain
          ? Math.round((weeklyData.avgStrain - monthAgoAvg.avgStrain) * 10) / 10 : undefined;
        hrvDelta = weeklyData.avgHRV && monthAgoAvg.avgHRV
          ? Math.round(weeklyData.avgHRV - monthAgoAvg.avgHRV) : undefined;
      } else {
        console.log(`[WHOOP WEEKLY] Not enough data from a month ago (${monthAgoWeekData.length} days) - skipping deltas`);
      }

      // Return structure matching mobile app's WeeklyMetrics type
      // Comparing current week (days 0-6) vs. same week from a month ago (days 28-34)
      const response = {
        start_date: now.minus({ days: 6 }).toISODate(),
        end_date: now.toISODate(),
        averages: {
          sleep_score_percent: weeklyData.avgSleep || 0,
          recovery_score_percent: weeklyData.avgRecovery || 0,
          strain_score: weeklyData.avgStrain || 0,
          hrv_ms: weeklyData.avgHRV || 0
        },
        comparison: {
          vs_last_month: {
            sleep_percent_delta: sleepDelta,
            recovery_percent_delta: recoveryDelta,
            strain_delta: strainDelta,
            hrv_ms_delta: hrvDelta
          }
        }
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error in /api/whoop/weekly:', message);

      const maybeAxiosError = error as {
        response?: { status?: number; data?: unknown };
        config?: { url?: string };
      };

      if (maybeAxiosError.response) {
        console.error('WHOOP API Error Response:', {
          status: maybeAxiosError.response.status,
          data: maybeAxiosError.response.data,
          endpoint: maybeAxiosError.config?.url,
        });
      }
      
      res.status(500).json({
        error: 'Failed to fetch weekly WHOOP averages',
        details: message
      });
    }
  });

  // WHOOP last week endpoint - returns metrics from 8 days ago (for yesterday vs last week comparison)
  app.get('/api/whoop/lastweek', requireJWTAuth, async (req, res) => {
    try {
      console.log('[WHOOP LASTWEEK] Fetching metrics from 8 days ago...');

      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const now = DateTime.now().setZone(tz);
      // Get data from 8 days ago (to compare with yesterday which is 1 day ago)
      const lastWeekDate = now.minus({ days: 8 }).toISODate();

      if (!lastWeekDate) {
        return res.status(500).json({ error: 'Failed to calculate date' });
      }

      // Try cache first
      let data = await storage.getWhoopDataByUserAndDate(userId, lastWeekDate);

      // Re-fetch from WHOOP API if no data at all, OR if cached data has no sleep/recovery
      // (strain-only records get stored during initial sync but are incomplete)
      const isIncomplete = !data || (data.sleepScore === 0 && data.recoveryScore === 0);
      if (isIncomplete) {
        console.log(`[WHOOP LASTWEEK] ${data ? 'Incomplete data (sleep=0, recovery=0)' : 'No cached data'} for ${lastWeekDate}, fetching from API...`);
        try {
          const apiData = await whoopApiService.getDataForDate(userId, lastWeekDate);
          if (apiData && (apiData.recoveryScore || apiData.sleepScore || apiData.strainScore)) {
            // Cache the fetched data
            await storage.upsertWhoopData({
              userId,
              date: lastWeekDate,
              recoveryScore: Math.round(apiData.recoveryScore || 0),
              sleepScore: Math.round(apiData.sleepScore || 0),
              strainScore: apiData.strainScore || 0,
              // Only store HRV if it's a physiologically valid value (>= 10ms)
              hrv: (apiData.hrv && apiData.hrv >= 10) ? apiData.hrv : 0,
              restingHeartRate: Math.round(apiData.restingHeartRate || 0),
            });
            data = await storage.getWhoopDataByUserAndDate(userId, lastWeekDate);
          }
        } catch (fetchError) {
          console.log(`[WHOOP LASTWEEK] Failed to fetch from API:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      }

      if (!data) {
        console.log(`[WHOOP LASTWEEK] No data available for ${lastWeekDate}`);
        return res.json({
          sleep_score: null,
          recovery_score: null,
          strain: null,
          hrv: null
        });
      }

      console.log(`[WHOOP LASTWEEK] Returning data for ${lastWeekDate}`);
      res.json({
        sleep_score: data.sleepScore || null,
        recovery_score: data.recoveryScore || null,
        strain: data.strainScore || null,
        // HRV must be >= 10ms to be physiologically valid — values below this are sensor noise
        hrv: (data.hrv && data.hrv >= 10) ? data.hrv : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP LASTWEEK] Error:', message);
      res.status(500).json({
        error: 'Failed to fetch last week WHOOP data',
        details: message
      });
    }
  });

  // WHOOP historical backfill — fills last 34 days of missing data from WHOOP API
  // Returns coverage immediately, processes missing days in background
  app.post('/api/whoop/backfill', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const now = DateTime.now().setZone(tz);
      const DAYS = 34; // covers both last-week (day 8) and last-month (days 28-34) windows

      // Fast DB scan — find which days are already fully cached vs. missing or incomplete
      let daysWithData = 0;
      const missingDates: string[] = [];

      for (let i = 1; i <= DAYS; i++) {
        const dateStr = now.minus({ days: i }).toISODate()!;
        const existing = await storage.getWhoopDataByUserAndDate(userId, dateStr);

        // Count the day if any metric exists (for coverage display)
        const hasAnyData = existing && (existing.recoveryScore > 0 || existing.sleepScore > 0 || existing.strainScore > 0);
        if (hasAnyData) daysWithData++;

        // Only skip re-fetching if BOTH sleep and recovery are present.
        // Days with only strain (sleep=0, recovery=0) are re-fetched to fill the gaps.
        const hasCompleteData = existing && existing.recoveryScore > 0 && existing.sleepScore > 0;
        if (!hasCompleteData) missingDates.push(dateStr);
      }

      console.log(`[BACKFILL] user=${userId} daysWithData=${daysWithData}/${DAYS}, missing=${missingDates.length}`);

      // Respond immediately with current coverage so the UI can update right away
      res.json({
        daysWithData,
        totalDays: DAYS,
        missingDays: missingDates.length,
        hasFullMonth: daysWithData >= 28,
        status: missingDates.length > 0 ? 'backfill_started' : 'complete',
      });

      // Process missing days in background — don't block the response
      if (missingDates.length > 0) {
        setImmediate(async () => {
          console.log(`[BACKFILL] Starting background sync for ${missingDates.length} days`);
          let synced = 0;
          for (const dateStr of missingDates) {
            try {
              const data = await whoopApiService.getDataForDate(userId, dateStr);
              if (data && (data.recoveryScore || data.sleepScore || data.strainScore)) {
                await storage.upsertWhoopData({
                  userId,
                  date: dateStr,
                  recoveryScore: Math.round(data.recoveryScore || 0),
                  sleepScore: Math.round(data.sleepScore || 0),
                  strainScore: data.strainScore || 0,
                  hrv: (data.hrv && data.hrv >= 10) ? data.hrv : 0,
                  restingHeartRate: Math.round(data.restingHeartRate || 0),
                });
                synced++;
                console.log(`[BACKFILL] ✓ ${dateStr} (${synced}/${missingDates.length})`);
              }
            } catch (e) {
              console.warn(`[BACKFILL] ✗ ${dateStr}:`, e instanceof Error ? e.message : String(e));
            }
            // 300ms delay between days to respect WHOOP API rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          console.log(`[BACKFILL] Complete for user=${userId}: synced=${synced}/${missingDates.length}`);
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[BACKFILL] Error:', message);
      res.status(500).json({ error: 'Backfill failed', details: message });
    }
  });

  // WHOOP monthly-comparison endpoint (current week vs. month ago)
  app.get('/api/whoop/monthly-comparison', requireJWTAuth, async (req, res) => {
    try {
      console.log('[WHOOP MONTHLY-COMPARISON] Fetching current week vs. month ago comparison...');

      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const tz = process.env.USER_TZ || 'Europe/Zurich';

      // Helper function to get or fetch data for a date
      const getOrFetchData = async (dateStr: string) => {
        // Try cache first
        let data = await storage.getWhoopDataByUserAndDate(userId, dateStr);

        if (!data) {
          // Not in cache, try to fetch from WHOOP API
          console.log(`[WHOOP MONTHLY-COMPARISON] No cached data for ${dateStr}, fetching from API...`);
          try {
            const apiData = await whoopApiService.getDataForDate(userId, dateStr);
            if (apiData && (apiData.recoveryScore || apiData.sleepScore || apiData.strainScore)) {
              // Cache the fetched data
              await storage.upsertWhoopData({
                userId,
                date: dateStr,
                recoveryScore: Math.round(apiData.recoveryScore || 0),
                sleepScore: Math.round(apiData.sleepScore || 0),
                strainScore: apiData.strainScore || 0,
                hrv: apiData.hrv || 0,
                restingHeartRate: Math.round(apiData.restingHeartRate || 0),
              });

              // Return the cached data after upserting
              data = await storage.getWhoopDataByUserAndDate(userId, dateStr);
            }
          } catch (fetchError) {
            console.log(`[WHOOP MONTHLY-COMPARISON] Failed to fetch data for ${dateStr}:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
          }
        }

        return data;
      };

      // Calculate averages for current 7 days (days 0-6)
      const currentWeekData = [];
      for (let i = 0; i < 7; i++) {
        const dateIso = DateTime.now().setZone(tz).minus({ days: i }).toISODate();
        if (dateIso) {
          const dayData = await getOrFetchData(dateIso);
          if (dayData) currentWeekData.push(dayData);
        }
      }

      // Calculate averages for ~month ago (days 23-29, ~4 weeks ago)
      const previousMonthData = [];
      for (let i = 23; i <= 29; i++) {
        const dateIso = DateTime.now().setZone(tz).minus({ days: i }).toISODate();
        if (dateIso) {
          const dayData = await getOrFetchData(dateIso);
          if (dayData) previousMonthData.push(dayData);
        }
      }

      // Calculate current week averages
      const currentCount = currentWeekData.length;
      const currentAvg = {
        sleep: currentCount > 0 ? Math.round(currentWeekData.reduce((sum, d) => sum + (d.sleepScore || 0), 0) / currentCount) : null,
        recovery: currentCount > 0 ? Math.round(currentWeekData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / currentCount) : null,
        strain: currentCount > 0 ? Math.round((currentWeekData.reduce((sum, d) => sum + (d.strainScore || 0), 0) / currentCount) * 10) / 10 : null,
        hrv: currentCount > 0 ? Math.round(currentWeekData.reduce((sum, d) => sum + (d.hrv || 0), 0) / currentCount) : null,
      };

      // Calculate previous month averages
      const prevCount = previousMonthData.length;
      const prevAvg = {
        sleep: prevCount > 0 ? Math.round(previousMonthData.reduce((sum, d) => sum + (d.sleepScore || 0), 0) / prevCount) : null,
        recovery: prevCount > 0 ? Math.round(previousMonthData.reduce((sum, d) => sum + (d.recoveryScore || 0), 0) / prevCount) : null,
        strain: prevCount > 0 ? Math.round((previousMonthData.reduce((sum, d) => sum + (d.strainScore || 0), 0) / prevCount) * 10) / 10 : null,
        hrv: prevCount > 0 ? Math.round(previousMonthData.reduce((sum, d) => sum + (d.hrv || 0), 0) / prevCount) : null,
      };

      // Build response with averages and deltas (percentages for sleep/recovery; raw values for strain/HRV)
      const response = {
        avg_sleep: currentAvg.sleep,
        avg_recovery: currentAvg.recovery,
        avg_strain: currentAvg.strain,
        avg_hrv: currentAvg.hrv,
        sleep_delta: (currentAvg.sleep !== null && prevAvg.sleep !== null && prevAvg.sleep !== 0)
          ? Math.round(((currentAvg.sleep - prevAvg.sleep) / prevAvg.sleep) * 100) : null,
        recovery_delta: (currentAvg.recovery !== null && prevAvg.recovery !== null && prevAvg.recovery !== 0)
          ? Math.round(((currentAvg.recovery - prevAvg.recovery) / prevAvg.recovery) * 100) : null,
        strain_delta: (currentAvg.strain !== null && prevAvg.strain !== null)
          ? Number((currentAvg.strain - prevAvg.strain).toFixed(1)) : null,
        hrv_delta: (currentAvg.hrv !== null && prevAvg.hrv !== null)
          ? Math.round(currentAvg.hrv - prevAvg.hrv) : null,
      };

      console.log(`[WHOOP MONTHLY-COMPARISON] user=${userId} currentWeek(${currentCount} days) vs prevMonth(${prevCount} days) deltas: sleep=${response.sleep_delta}, recovery=${response.recovery_delta}, strain=${response.strain_delta}, hrv=${response.hrv_delta}`);
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP MONTHLY-COMPARISON] Error:', message);
      res.status(500).json({ error: 'Failed to fetch monthly comparison data', details: message });
    }
  });

  // WHOOP yesterday endpoint
  app.get('/api/whoop/yesterday', requireJWTAuth, async (req, res) => {
    try {
      console.log('Fetching yesterday WHOOP data...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Token validation using user-specific token
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const tokenData = await whoopTokenStorage.getToken(userId);
      if (!tokenData?.access_token) {
        return res.status(401).json({ error: 'Missing WHOOP access token for user' });
      }

      // Try WHOOP API first, fallback to cache if needed
      let yesterdayData;
      const isTokenValid = whoopTokenStorage.isTokenValid(tokenData);

      if (!isTokenValid) {
        console.warn('WHOOP access token has expired. Using cache fallback only.');
      }

      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const now = DateTime.now().setZone(tz);

      try {
        if (isTokenValid) {
          yesterdayData = await whoopApiService.getYesterdaysData(userId);
        } else {
          throw new Error('Token expired, skip to cache');
        }

        // If API succeeds but returns null values, try cache fallback
        if (!yesterdayData || (yesterdayData.recovery_score == null && yesterdayData.strain == null && yesterdayData.sleep_score == null && yesterdayData.hrv == null)) {
          console.log('WHOOP API returned null values for yesterday, trying cache fallback');
          throw new Error('No data from WHOOP API');
        }

        console.log('Yesterday WHOOP data retrieved successfully from API');
      } catch (apiError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        console.log('Failed to get yesterday data from WHOOP API, trying cache fallback', apiMessage ? `(${apiMessage})` : '');

        // Get yesterday's cached data as fallback using timezone-aware dates
        const yesterday = now.minus({ days: 1 }).toISODate();

        if (yesterday) {
          const dayData = await storage.getWhoopDataByUserAndDate(userId, yesterday);
          if (dayData) {
            yesterdayData = {
              recovery_score: dayData.recoveryScore || null,
              strain: dayData.strainScore || null,
              sleep_score: dayData.sleepScore || null,
              hrv: dayData.hrv || null
            };
            console.log(`[WHOOP YESTERDAY] user=${userId} tz=${tz} used=cache-only data:`, yesterdayData);
          } else {
            yesterdayData = { recovery_score: null, strain: null, sleep_score: null, hrv: null };
          }
        } else {
          yesterdayData = { recovery_score: null, strain: null, sleep_score: null, hrv: null };
        }
      }

      // Get data from 8 days ago for comparison (yesterday vs last week)
      const lastWeekDate = now.minus({ days: 8 }).toISODate();
      let lastWeekData = null;

      if (lastWeekDate) {
        lastWeekData = await storage.getWhoopDataByUserAndDate(userId, lastWeekDate);
      }

      // Calculate deltas (yesterday vs last week)
      let sleepDelta = undefined;
      let recoveryDelta = undefined;
      let strainDelta = undefined;
      let hrvDelta = undefined;

      if (lastWeekData && yesterdayData) {
        if (yesterdayData.sleep_score != null && lastWeekData.sleepScore != null) {
          sleepDelta = Math.round(yesterdayData.sleep_score - lastWeekData.sleepScore);
        }
        if (yesterdayData.recovery_score != null && lastWeekData.recoveryScore != null) {
          recoveryDelta = Math.round(yesterdayData.recovery_score - lastWeekData.recoveryScore);
        }
        if (yesterdayData.strain != null && lastWeekData.strainScore != null) {
          strainDelta = Math.round((yesterdayData.strain - lastWeekData.strainScore) * 10) / 10;
        }
        if (yesterdayData.hrv != null && lastWeekData.hrv != null) {
          hrvDelta = Math.round(yesterdayData.hrv - lastWeekData.hrv);
        }
      }

      console.log(`[WHOOP YESTERDAY] user=${userId} yesterday vs last week deltas: sleep=${sleepDelta}, recovery=${recoveryDelta}, strain=${strainDelta}, hrv=${hrvDelta}`);

      // Return structure matching weekly format
      const response = {
        sleep_score: yesterdayData?.sleep_score || null,
        recovery_score: yesterdayData?.recovery_score || null,
        strain: yesterdayData?.strain || null,
        hrv: yesterdayData?.hrv || null,
        comparison: {
          vs_last_week: {
            sleep_percent_delta: sleepDelta,
            recovery_percent_delta: recoveryDelta,
            strain_delta: strainDelta,
            hrv_ms_delta: hrvDelta
          }
        }
      };

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error in /api/whoop/yesterday:', message);

      const maybeAxiosError = error as {
        response?: { status?: number; data?: unknown };
        config?: { url?: string };
      };

      if (maybeAxiosError.response) {
        res.status(maybeAxiosError.response.status || 500).json({
          error: 'WHOOP API error',
          status: maybeAxiosError.response.status,
          data: maybeAxiosError.response.data,
          endpoint: maybeAxiosError.config?.url,
        });
      }

      res.status(500).json({ 
        error: 'Failed to fetch yesterday WHOOP data',
        details: message
      });
    }
  });

  // WHOOP yesterday-comparison endpoint (yesterday vs. 7 days ago)
  app.get('/api/whoop/yesterday-comparison', requireJWTAuth, async (req, res) => {
    try {
      console.log('[WHOOP YESTERDAY-COMPARISON] Fetching yesterday vs. last week comparison...');

      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Fetch recent cycles directly from WHOOP API (like getWeeklyAverages does)
      // cycles[0] = today (ongoing), cycles[1] = yesterday (completed), cycles[8] = 7 days ago
      const BASE = 'https://api.prod.whoop.com/developer/v1';
      const headers = await whoopApiService.authHeader(userId);
      const cyclesResponse = await axios.get(`${BASE}/cycle?limit=10`, { headers });

      if (!cyclesResponse.data?.records || cyclesResponse.data.records.length < 2) {
        console.log('[WHOOP YESTERDAY-COMPARISON] Not enough cycles available');
        return res.json({
          sleep_score: null,
          recovery_score: null,
          strain: null,
          hrv: null,
          sleep_delta: null,
          recovery_delta: null,
          strain_delta: null,
          hrv_delta: null,
        });
      }

      const cycles = cyclesResponse.data.records;

      // Yesterday's completed cycle is cycles[1]
      const yesterdayCycle = cycles[1];
      // Last week's cycle is cycles[8] if available
      const lastWeekCycle = cycles.length >= 9 ? cycles[8] : null;

      console.log(`[WHOOP YESTERDAY-COMPARISON] Using cycle[1] for yesterday: ${yesterdayCycle.id}, strain=${yesterdayCycle.score?.strain}`);
      if (lastWeekCycle) {
        console.log(`[WHOOP YESTERDAY-COMPARISON] Using cycle[8] for last week: ${lastWeekCycle.id}, strain=${lastWeekCycle.score?.strain}`);
      }

      // Get yesterday's data
      const yesterdayRecovery = await whoopApiService.getRecovery(yesterdayCycle.id, userId);
      let yesterdaySleepScore = null;
      if (yesterdayRecovery?.sleep_id) {
        try {
          const sleepResponse = await axios.get(`${BASE}/activity/sleep/${yesterdayRecovery.sleep_id}`, { headers });
          if (sleepResponse.status === 200 && sleepResponse.data?.score?.sleep_performance_percentage !== undefined) {
            yesterdaySleepScore = Math.min(Math.max(sleepResponse.data.score.sleep_performance_percentage, 0), 100);
          }
        } catch (err) {
          console.warn('[WHOOP YESTERDAY-COMPARISON] Failed to fetch yesterday sleep data');
        }
      }

      // Get last week's data if available
      let lastWeekRecovery = null;
      let lastWeekSleepScore = null;
      if (lastWeekCycle) {
        lastWeekRecovery = await whoopApiService.getRecovery(lastWeekCycle.id, userId);
        if (lastWeekRecovery?.sleep_id) {
          try {
            const sleepResponse = await axios.get(`${BASE}/activity/sleep/${lastWeekRecovery.sleep_id}`, { headers });
            if (sleepResponse.status === 200 && sleepResponse.data?.score?.sleep_performance_percentage !== undefined) {
              lastWeekSleepScore = Math.min(Math.max(sleepResponse.data.score.sleep_performance_percentage, 0), 100);
            }
          } catch (err) {
            console.warn('[WHOOP YESTERDAY-COMPARISON] Failed to fetch last week sleep data');
          }
        }
      }

      // Extract values
      const yesterdaySleep = yesterdaySleepScore;
      const yesterdayRecoveryScore = yesterdayRecovery?.score?.recovery_score || null;
      const yesterdayStrain = yesterdayCycle.score?.strain || null;
      const yesterdayHRV = yesterdayRecovery?.score?.hrv_rmssd_milli || null;

      const lastWeekSleep = lastWeekSleepScore;
      const lastWeekRecoveryScore = lastWeekRecovery?.score?.recovery_score || null;
      const lastWeekStrain = lastWeekCycle?.score?.strain || null;
      const lastWeekHRV = lastWeekRecovery?.score?.hrv_rmssd_milli || null;

      // Build response with deltas
      const response = {
        sleep_score: yesterdaySleep,
        recovery_score: yesterdayRecoveryScore,
        strain: yesterdayStrain,
        hrv: yesterdayHRV,
        sleep_delta: (yesterdaySleep !== null && lastWeekSleep !== null && lastWeekSleep !== 0)
          ? Math.round(((yesterdaySleep - lastWeekSleep) / lastWeekSleep) * 100) : null,
        recovery_delta: (yesterdayRecoveryScore !== null && lastWeekRecoveryScore !== null && lastWeekRecoveryScore !== 0)
          ? Math.round(((yesterdayRecoveryScore - lastWeekRecoveryScore) / lastWeekRecoveryScore) * 100) : null,
        strain_delta: (yesterdayStrain !== null && lastWeekStrain !== null)
          ? Number((yesterdayStrain - lastWeekStrain).toFixed(1)) : null,
        hrv_delta: (yesterdayHRV !== null && lastWeekHRV !== null)
          ? Math.round(yesterdayHRV - lastWeekHRV) : null,
      };

      console.log(`[WHOOP YESTERDAY-COMPARISON] user=${userId} yesterday_strain=${response.strain} lastWeek_strain=${lastWeekStrain} delta=${response.strain_delta}`);
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP YESTERDAY-COMPARISON] Error:', message);
      res.status(500).json({ error: 'Failed to fetch yesterday comparison data', details: message });
    }
  });

  // WHOOP insights endpoint
  app.get('/api/whoop/insights', requireJWTAuth, async (req, res) => {
    try {
      console.log('Fetching WHOOP insights...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      // Token validation using user-specific token
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
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
      
      // Try WHOOP API first, fallback to cache if needed
      let insightsData;
      try {
        insightsData = await whoopApiService.getInsightsData(userId);
        
        // If API succeeds but returns null values, try cache fallback
        if (!insightsData || (insightsData.sleep_hours === null && insightsData.resting_heart_rate === null)) {
          console.log('WHOOP API returned null values for insights, trying cache fallback');
          throw new Error('No data from WHOOP API');
        }
        
        console.log('WHOOP insights retrieved successfully from API');
      } catch (apiError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        console.log('Failed to get insights from WHOOP API, trying cache fallback', apiMessage ? `(${apiMessage})` : '');
        
        // Get today's cached data as fallback for insights
        const tz = process.env.USER_TZ || 'Europe/Zurich';
        const today = DateTime.now().setZone(tz).toISODate();
        
        if (today) {
          const dayData = await storage.getWhoopDataByUserAndDate(userId, today);
          if (dayData) {
            insightsData = {
              sleep_hours: dayData.sleepHours || null,
              resting_heart_rate: dayData.restingHeartRate || null
            };
            console.log(`[WHOOP INSIGHTS] user=${userId} tz=${tz} used=cache-only data:`, insightsData);
          } else {
            insightsData = { sleep_hours: null, resting_heart_rate: null };
          }
        } else {
          insightsData = { sleep_hours: null, resting_heart_rate: null };
        }
      }
      
      res.json(insightsData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error in /api/whoop/insights:', message);

      const maybeAxiosError = error as {
        response?: { status?: number; data?: unknown };
        config?: { url?: string };
      };

      if (maybeAxiosError.response) {
        res.status(maybeAxiosError.response.status || 500).json({
          error: 'WHOOP API error',
          status: maybeAxiosError.response.status,
          data: maybeAxiosError.response.data,
          endpoint: maybeAxiosError.config?.url,
        });
      }

      res.status(500).json({ 
        error: 'Failed to fetch WHOOP insights',
        details: message
      });
    }
  });

  // Cache management endpoints
  app.delete('/api/cache/today', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const todayDate = todayKey(tz);
      
      await storage.deleteWhoopDataByUserAndDate(userId, todayDate);
      
      res.json({
        deleted: true,
        date: todayDate
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error deleting today cache:', message);
      res.status(500).json({ error: 'Failed to delete cache', details: message });
    }
  });

  app.delete('/api/cache/day/:date', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const date = req.params.date;
      
      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      
      await storage.deleteWhoopDataByUserAndDate(userId, date);
      
      res.json({
        deleted: true,
        date: date
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error deleting day cache:', message);
      res.status(500).json({ error: 'Failed to delete cache', details: message });
    }
  });

  // Raw WHOOP data endpoint for verification
  app.get('/api/whoop/today/raw', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const sourceLive = req.query.source === 'live';
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (sourceLive) {
        const tz = process.env.USER_TZ || 'Europe/Zurich';
        const todayDate = todayKey(tz);
        
        // Get raw WHOOP data
        const rawData = await whoopApiService.getTodaysData(userId);
        
        // Extract and structure the response
        const result = {
          raw: {
            cycle: rawData.raw_data?.cycle || null,
            recovery: rawData.raw_data?.recovery || null,
            sleep: rawData.raw_data?.sleep || null
          },
          mapped: {
            recovery_score: rawData.recovery_score,
            sleep_score: rawData.sleep_score,
            sleep_hours: rawData.sleep_hours,
            strain: rawData.strain,
            hrv: rawData.hrv,
            resting_heart_rate: rawData.resting_heart_rate
          },
          date: todayDate
        };
        
        res.json(result);
      } else {
        res.status(400).json({ error: 'source=live parameter required for raw endpoint' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching raw WHOOP data:', message);
      res.status(500).json({ error: 'Failed to fetch raw data', details: message });
    }
  });

  // WHOOP summary analytics endpoint
  app.get('/api/whoop/summary', requireJWTAuth, async (req, res) => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error in /api/whoop/summary:', message);
      res.status(500).json({ 
        error: 'Failed to calculate WHOOP summary',
        details: message
      });
    }
  });

  // Meal upload endpoint - accepts single meal with image, type, and notes
  app.post('/api/meals', (req, res, next) => {
    console.log('[MEAL UPLOAD] Received POST to /api/meals');
    console.log('[MEAL UPLOAD] Content-Type:', req.headers['content-type']);
    next();
  }, upload.single('mealPhoto'), (err: any, req: Request, res: Response, next: Function) => {
    if (err) {
      console.error('[MEAL UPLOAD] Multer error:', err.message);
      console.error('[MEAL UPLOAD] Error code:', err.code);
      return res.status(500).json({
        error: 'File upload failed',
        message: err.message,
        code: err.code
      });
    }
    next();
  }, requireJWTAuth, async (req: Request, res: Response) => {
    try {
      console.log('[MEAL UPLOAD] Processing meal upload...');
      console.log('[MEAL UPLOAD] File:', req.file ? 'Present' : 'Missing');
      console.log('[MEAL UPLOAD] Body:', req.body);

      const file = req.file as Express.Multer.File;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { mealType, mealNotes, date, mealTime } = req.body;

      if (!mealType) {
        return res.status(400).json({ error: 'Meal type is required' });
      }

      const userId = getCurrentUserId(req) || 'default-user';
      const uploadDate = date || getTodayDate();

      const meal = await storage.createMeal({
        userId: userId,
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        date: uploadDate,
        mealType: mealType,
        mealNotes: mealNotes || null,
        analysisResult: null, // Will be populated below
      });

      console.log(`Uploaded meal: ${mealType} for date ${uploadDate}`);

      const baseUrl = req.protocol + '://' + req.get('host');
      const imageUrl = `${baseUrl}/uploads/${meal.filename}`;

      // Fetch user's diet phase for goal-aligned scoring
      let dietPhase: string | undefined;
      try {
        const [ctx] = await db.select().from(userContext).where(eq(userContext.userId, userId)).limit(1);
        dietPhase = ctx?.tier2DietPhase ?? undefined;
      } catch {
        // Non-fatal — proceed without diet phase
      }

      // Analyze meal with AI
      console.log('[MEAL UPLOAD] Analyzing meal with AI...');
      const analysis = await openAIService.analyzeMealImage(
        imageUrl,
        mealType,
        mealNotes || undefined,
        dietPhase
      );

      // Update meal with analysis result (include meal_time for timing signal computation)
      const analysisData = {
        nutrition_subscore: analysis.nutrition_subscore,
        score_raw: analysis.score_raw,
        score_display: analysis.score_display,
        ai_analysis: analysis.ai_analysis,
        meal_quality_flags: analysis.meal_quality_flags ?? null,
        meal_time: (mealTime as string) || null, // HH:MM from mobile time picker
        estimated_calories: analysis.estimatedCalories ?? null,
        estimated_protein: analysis.estimatedProtein ?? null,
      };

      const updatedMeal = await storage.updateMeal(meal.id, {
        analysisResult: JSON.stringify(analysisData)
      });

      console.log(`[MEAL UPLOAD] Analysis complete: score_raw=${analysis.score_raw} display=${analysis.score_display}, goalPhase=${dietPhase || 'none'}`);

      res.json({
        message: 'Meal uploaded successfully',
        meal: {
          id: updatedMeal.id,
          mealType: updatedMeal.mealType,
          mealNotes: updatedMeal.mealNotes,
          imageUri: imageUrl,
          date: updatedMeal.date,
          uploadedAt: updatedMeal.uploadedAt,
          nutritionScore: analysis.score_raw,
          nutritionScoreDisplay: analysis.score_display,
          analysis: analysis.ai_analysis,
          mealQualityFlags: analysis.meal_quality_flags ?? null,
          estimatedCalories: analysis.estimatedCalories ?? null,
          estimatedProtein: analysis.estimatedProtein ?? null,
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error uploading meals:', message);
      res.status(500).json({ error: 'Failed to upload meal images', details: message });
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching meals:', message);
      res.status(500).json({ error: 'Failed to fetch today\'s meals', details: message });
    }
  });

  // Get yesterday's meals endpoint
  app.get('/api/meals/yesterday', async (req, res) => {
    try {
      console.log('Fetching yesterday\'s meals...');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const meals = await storage.getMealsByDate(yesterdayStr);

      // Return full URLs including domain
      const baseUrl = req.protocol + '://' + req.get('host');
      const mealUrls = meals.map(meal => `${baseUrl}/uploads/${meal.filename}`);

      console.log(`Found ${meals.length} meals for yesterday (${yesterdayStr})`);
      res.json(mealUrls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching yesterday\'s meals:', message);
      res.status(500).json({ error: 'Failed to fetch yesterday\'s meals', details: message });
    }
  });

  // Get all meals (for dashboard)
  app.get('/api/meals', async (req, res) => {
    try {
      const meals = await storage.getAllMeals();
      res.json(meals);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching all meals:', message);
      res.status(500).json({ error: 'Failed to fetch meals', details: message });
    }
  });

  // Get meals for specific date
  app.get('/api/meals/date/:date', requireJWTAuth, async (req, res) => {
    try {
      const { date } = req.params;
      const userId = getCurrentUserId(req) || 'default-user';

      const meals = await storage.getMealsByUserAndDate(userId, date);

      const baseUrl = req.protocol + '://' + req.get('host');
      const mealsWithUrls = meals.map(meal => {
        // Parse analysis result if it exists
        let nutritionScore: number | undefined;
        let analysis: string | undefined;
        let estimatedCalories: number | null = null;
        let estimatedProtein: number | null = null;

        if (meal.analysisResult) {
          try {
            const parsed = JSON.parse(meal.analysisResult);
            nutritionScore = parsed.nutrition_subscore;
            analysis = parsed.ai_analysis;
            if (typeof parsed.estimated_calories === 'number') estimatedCalories = parsed.estimated_calories;
            if (typeof parsed.estimated_protein === 'number') estimatedProtein = parsed.estimated_protein;
          } catch (e) {
            console.error(`Failed to parse analysis for meal ${meal.id}:`, e);
          }
        }

        return {
          id: meal.id,
          mealType: meal.mealType,
          mealNotes: meal.mealNotes,
          imageUri: `${baseUrl}/uploads/${meal.filename}`,
          date: meal.date,
          uploadedAt: meal.uploadedAt,
          nutritionScore,
          analysis,
          estimatedCalories,
          estimatedProtein,
        };
      });

      console.log(`Found ${meals.length} meals for user ${userId} on ${date}`);
      res.json(mealsWithUrls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching meals:', message);
      res.status(500).json({ error: 'Failed to fetch meals', details: message });
    }
  });

  // Delete a meal
  app.delete('/api/meals/:id', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req) || 'default-user';
      const mealId = parseInt(req.params.id);

      if (isNaN(mealId)) {
        return res.status(400).json({ error: 'Invalid meal ID' });
      }

      // Verify meal belongs to this user before deleting
      const meal = await storage.getMealById(mealId);
      if (!meal) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      if (meal.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await storage.deleteMeal(mealId);
      console.log(`[MEAL DELETE] Deleted meal ${mealId} for user ${userId}`);
      res.json({ message: 'Meal deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error deleting meal:', message);
      res.status(500).json({ error: 'Failed to delete meal', details: message });
    }
  });

  // ========== Training Data Endpoints ==========

  // Create training data with immediate analysis
  app.post('/api/training', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req) || 'default-user';
      const { date, type, duration, goal, intensity, comment, skipped } = req.body;

      if (!type || duration === undefined) {
        return res.status(400).json({ error: 'Training type and duration are required' });
      }

      const trainingDate = date || getTodayDate();

      // Create training entry first
      const trainingEntry = await storage.createTrainingData({
        userId,
        date: trainingDate,
        type,
        duration: parseInt(duration),
        goal: goal || null,
        intensity: intensity || null,
        comment: comment || null,
        skipped: skipped || false,
      });

      console.log(`[TRAINING] Created: ${type} for ${trainingDate}`);

      // Analyze training session immediately (similar to meal analysis)
      try {
        // Compute Zurich local hour for the early-day strain guard
        const sessionLocalHour = new Date().toLocaleString('en-US', {
          timeZone: 'Europe/Zurich',
          hour: 'numeric',
          hour12: false,
        });
        const sessionHour = parseInt(sessionLocalHour, 10); // 0-23

        // Get WHOOP data and user context in parallel
        const [whoopData, userCtxRows, goals] = await Promise.all([
          whoopApiService.getDataForDate(userId, trainingDate),
          db.select().from(userContext).where(eq(userContext.userId, userId)).limit(1),
          db.select().from(userGoals).where(eq(userGoals.userId, userId)).orderBy(desc(userGoals.createdAt)),
        ]);
        const userCtx = userCtxRows[0] ?? null;

        console.log(`[TRAINING] WHOOP data retrieved for ${trainingDate}:`, JSON.stringify(whoopData, null, 2));
        console.log(`[TRAINING] - Recovery: ${whoopData?.recoveryScore}%`);
        console.log(`[TRAINING] - Strain: ${whoopData?.strainScore}`);
        console.log(`[TRAINING] - Sleep: ${whoopData?.sleepScore}%`);
        console.log(`[TRAINING] - HRV: ${whoopData?.hrv}ms`);

        const fitnessGoal = goals.find(g =>
          g.category && ['fitness', 'training', 'health', 'strength', 'endurance'].some(
            cat => g.category.toLowerCase().includes(cat)
          )
        )?.title || goals[0]?.title;

        console.log(`[TRAINING] User fitness goal: ${fitnessGoal || 'none'}`);
        console.log(`[TRAINING] User context: rehabStage=${userCtx?.rehabStage || 'none'}, primaryGoal=${userCtx?.tier1Goal || 'none'}, weeklyLoad=${userCtx?.tier3WeekLoad || 'none'}, injuryType=${userCtx?.injuryType || 'none'}`);
        console.log(`[TRAINING] Session local hour (Zurich): ${sessionHour}`);

        // Extract strain and recovery values explicitly
        const strainValue = whoopData?.strainScore !== undefined && whoopData?.strainScore !== null
          ? whoopData.strainScore
          : undefined;
        const recoveryValue = whoopData?.recoveryScore !== undefined && whoopData?.recoveryScore !== null
          ? whoopData.recoveryScore
          : undefined;

        console.log(`[TRAINING] Extracted values for score calculation:`);
        console.log(`[TRAINING] - strainValue: ${strainValue} (raw: ${whoopData?.strainScore})`);
        console.log(`[TRAINING] - recoveryValue: ${recoveryValue} (raw: ${whoopData?.recoveryScore})`);

        // Calculate training score
        const scoreResult = trainingScoreService.calculateTrainingScore({
          type,
          duration: parseInt(duration),
          intensity: intensity || undefined,
          goal: goal || undefined,
          comment: comment || undefined,
          skipped: skipped || false,
          recoveryScore: recoveryValue,
          strainScore: strainValue,
          fitnessGoal: fitnessGoal || undefined,
          rehabStage:  userCtx?.rehabStage  || undefined,
          primaryGoal: userCtx?.tier1Goal   || undefined,
          weeklyLoad:  userCtx?.tier3WeekLoad || undefined,
          injuryType:  (userCtx?.injuryType && userCtx.injuryType !== 'None') ? userCtx.injuryType : undefined,
          sessionLocalHour: sessionHour,
        });

        console.log(`[TRAINING] Score calculated: ${scoreResult.score}/10`);
        console.log(`[TRAINING] Score breakdown:`);
        console.log(`[TRAINING] - Strain Appropriateness: ${scoreResult.breakdown.strainAppropriatenessScore.toFixed(1)}/4.0 (strain=${strainValue}, recovery=${recoveryValue})`);
        console.log(`[TRAINING] - Session Quality: ${scoreResult.breakdown.sessionQualityScore.toFixed(1)}/3.0`);
        console.log(`[TRAINING] - Goal Alignment: ${scoreResult.breakdown.goalAlignmentScore.toFixed(1)}/2.0`);
        console.log(`[TRAINING] - Injury Safety: ${scoreResult.breakdown.injurySafetyModifier.toFixed(1)}/1.0`);
        console.log(`[TRAINING] - rehabActive: ${scoreResult.rehabActive}`);
        console.log(`[TRAINING] - strainGuardApplied: ${scoreResult.strainGuardApplied}`);

        // Get GPT analysis - use same extracted values
        const sleepValue = whoopData?.sleepScore !== undefined && whoopData?.sleepScore !== null
          ? whoopData.sleepScore
          : undefined;

        const gptAnalysis = await openAIService.analyzeTrainingSession({
          trainingType: type,
          duration: parseInt(duration),
          intensity: intensity || undefined,
          goal: goal || undefined,
          comment: comment || undefined,
          score: scoreResult.score,
          breakdown: scoreResult.breakdown,
          recoveryScore: recoveryValue,
          strainScore: strainValue,
          sleepScore: sleepValue,
          recoveryZone: scoreResult.recoveryZone,
          userGoal: fitnessGoal || undefined,
          whoopDataMissing: !whoopData,
          rehabActive: scoreResult.rehabActive,
          rehabStage: userCtx?.rehabStage || undefined,
          injuryType: (userCtx?.injuryType && userCtx.injuryType !== 'None') ? userCtx.injuryType : undefined,
          injuryLocation: userCtx?.injuryLocation || undefined,
          strainGuardApplied: scoreResult.strainGuardApplied,
        });

        console.log(`[TRAINING] GPT analysis complete`);
        console.log(`[TRAINING] GPT analysis text: ${gptAnalysis.training_analysis.substring(0, 100)}...`);

        // When WHOOP data is absent, report zone as 'unknown' — internal scoring still used
        // 'yellow' as a conservative band default, but we don't expose that as a real zone.
        const reportedZone = whoopData ? scoreResult.recoveryZone : 'unknown';

        // Store analysis result with extracted values
        const analysisData = {
          score: scoreResult.score,
          breakdown: scoreResult.breakdown,
          analysis: gptAnalysis.training_analysis,
          recoveryZone: reportedZone,
          whoopDataMissing: !whoopData,
          whoopData: {
            recoveryScore: recoveryValue,
            strainScore: strainValue,
            sleepScore: sleepValue,
          },
        };

        console.log(`[TRAINING] Storing analysis data:`, {
          score: analysisData.score,
          breakdown: analysisData.breakdown,
          recoveryZone: analysisData.recoveryZone,
          whoopDataMissing: analysisData.whoopDataMissing,
          hasAnalysis: !!analysisData.analysis,
        });

        // Update training entry with analysis
        const updatedTraining = await storage.updateTrainingData(trainingEntry.id, {
          analysisResult: JSON.stringify(analysisData),
          trainingScore: scoreResult.score,
        });

        console.log(`[TRAINING] Analysis stored for training ${trainingEntry.id}`);

        // Return training with parsed analysis
        res.json({
          message: 'Training data saved and analyzed successfully',
          training: {
            ...updatedTraining,
            score: scoreResult.score,
            analysis: gptAnalysis.training_analysis,
            breakdown: scoreResult.breakdown,
            recoveryZone: reportedZone,
          },
        });

      } catch (analysisError) {
        // If analysis fails, still return the training entry
        console.error('[TRAINING] Analysis failed:', analysisError);
        res.json({
          message: 'Training data saved successfully (analysis pending)',
          training: trainingEntry,
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error creating training data:', message);
      res.status(500).json({ error: 'Failed to save training data', details: message });
    }
  });

  // Get training data for specific date with parsed analysis
  app.get('/api/training/date/:date', requireJWTAuth, async (req, res) => {
    try {
      const { date } = req.params;
      const userId = getCurrentUserId(req) || 'default-user';

      const trainingData = await storage.getTrainingDataByUserAndDate(userId, date);

      // Parse analysis results for each training session
      const trainingSessions = trainingData.map(training => {
        let score: number | undefined;
        let analysis: string | undefined;
        let breakdown: any | undefined;
        let recoveryZone: 'green' | 'yellow' | 'red' | undefined;

        if (training.analysisResult) {
          try {
            const parsed = JSON.parse(training.analysisResult);
            score = parsed.score;
            analysis = parsed.analysis;
            breakdown = parsed.breakdown;
            recoveryZone = parsed.recoveryZone;
            console.log(`[TRAINING FETCH] Parsed training ${training.id}:`, {
              hasScore: !!score,
              hasAnalysis: !!analysis,
              hasBreakdown: !!breakdown,
              breakdown: breakdown,
              recoveryZone,
            });
          } catch (e) {
            console.error(`Failed to parse analysis for training ${training.id}:`, e);
          }
        } else {
          console.log(`[TRAINING FETCH] Training ${training.id} has no analysisResult`);
        }

        return {
          ...training,
          score,
          analysis,
          breakdown,
          recoveryZone,
        };
      });

      console.log(`Found ${trainingSessions.length} training sessions for user ${userId} on ${date}`);
      res.json(trainingSessions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching training data:', message);
      res.status(500).json({ error: 'Failed to fetch training data', details: message });
    }
  });

  // Update training data
  app.put('/api/training/:id', requireJWTAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { type, duration, goal, intensity, comment, skipped } = req.body;

      const updates: any = {};
      if (type !== undefined) updates.type = type;
      if (duration !== undefined) updates.duration = parseInt(duration);
      if (goal !== undefined) updates.goal = goal;
      if (intensity !== undefined) updates.intensity = intensity;
      if (comment !== undefined) updates.comment = comment;
      if (skipped !== undefined) updates.skipped = skipped;

      const updated = await storage.updateTrainingData(parseInt(id), updates);

      console.log(`Updated training ${id}`);
      res.json({
        message: 'Training data updated successfully',
        training: updated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error updating training data:', message);
      res.status(500).json({ error: 'Failed to update training data', details: message });
    }
  });

  // Delete training data
  app.delete('/api/training/:id', requireJWTAuth, async (req, res) => {
    try {
      const { id } = req.params;

      await storage.deleteTrainingData(parseInt(id));

      console.log(`Deleted training ${id}`);
      res.json({ message: 'Training data deleted successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error deleting training data:', message);
      res.status(500).json({ error: 'Failed to delete training data', details: message });
    }
  });

  // Analyze training sessions for a specific date
  app.post('/api/training/analyze/:date', requireJWTAuth, async (req, res) => {
    try {
      const { date } = req.params;
      const userId = getCurrentUserId(req) || 'default-user';

      console.log(`[TRAINING ANALYSIS] Starting analysis for user ${userId} on ${date}`);

      // Get training data for the date
      const trainingData = await storage.getTrainingDataByUserAndDate(userId, date);

      if (trainingData.length === 0) {
        return res.status(404).json({
          error: 'No training data found for this date',
          message: 'Please log your training session first'
        });
      }

      // Get WHOOP data for the date
      const whoopData = await whoopApiService.getDataForDate(userId, date);
      console.log(`[TRAINING ANALYSIS] WHOOP data:`, whoopData);

      // Get user goals for goal alignment
      const goals = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .orderBy(desc(userGoals.createdAt));

      // Get primary fitness goal (most recent goal with fitness-related category)
      const fitnessGoal = goals.find(g =>
        g.category && ['fitness', 'training', 'health', 'strength', 'endurance'].some(
          cat => g.category.toLowerCase().includes(cat)
        )
      )?.title || goals[0]?.title;

      console.log(`[TRAINING ANALYSIS] User fitness goal: ${fitnessGoal || 'none'}`);

      // Calculate training score for each session
      const analyzedSessions = trainingData.map(session => {
        const scoreResult = trainingScoreService.calculateTrainingScore({
          type: session.type,
          duration: session.duration,
          intensity: session.intensity || undefined,
          goal: session.goal || undefined,
          comment: session.comment || undefined,
          skipped: session.skipped,
          recoveryScore: whoopData?.recoveryScore || undefined,
          strainScore: whoopData?.strainScore || undefined,
          fitnessGoal: fitnessGoal || undefined,
        });

        return {
          sessionId: session.id,
          type: session.type,
          duration: session.duration,
          intensity: session.intensity,
          goal: session.goal,
          comment: session.comment,
          skipped: session.skipped,
          score: scoreResult.score,
          breakdown: scoreResult.breakdown,
          analysis: scoreResult.analysis,
          recoveryZone: scoreResult.recoveryZone,
        };
      });

      // Calculate average training score for the day
      const averageScore = analyzedSessions.reduce((sum, s) => sum + s.score, 0) / analyzedSessions.length;

      console.log(`[TRAINING ANALYSIS] Completed analysis: average score ${averageScore.toFixed(1)}/10`);

      res.json({
        date,
        sessions: analyzedSessions,
        averageScore: Math.round(averageScore * 10) / 10,
        whoopData: {
          recoveryScore: whoopData?.recoveryScore,
          strainScore: whoopData?.strainScore,
          sleepScore: whoopData?.sleepScore,
          hrv: whoopData?.hrv,
        },
        userGoal: fitnessGoal,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TRAINING ANALYSIS] Error:', message);
      res.status(500).json({
        error: 'Failed to analyze training data',
        details: message
      });
    }
  });

  // ========== FitScore Calculation Endpoint ==========
  // Calculates the overall FitScore by combining Recovery, Training, and Nutrition scores
  app.post('/api/fitscore/calculate', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { date, waterIntakeBand } = req.body;
      const tz = process.env.USER_TZ || 'Europe/Zurich';
      const targetDate = date || todayKey(tz);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to calculate FitScore'
        });
      }

      console.log(`[FITSCORE] Calculating FitScore for user: ${userId}, date: ${targetDate}`);

      // Import the recovery score service
      const { recoveryScoreService } = await import('./services/recoveryScoreService');

      // 1. Get WHOOP data for the target date
      // For today: use getTodaysData (has reliable sleep_hours from live API)
      // For historical dates (yesterday, etc.): use getDataForDate
      let whoopData = null;
      const todayStr = DateTime.now().setZone(tz).toISODate()!;
      const isTargetToday = targetDate === todayStr;
      try {
        if (isTargetToday) {
          const todayData = await whoopApiService.getTodaysData(userId);
          console.log(`[FITSCORE] todayData.sleep_hours: ${todayData?.sleep_hours}`);
          if (todayData) {
            whoopData = {
              recoveryScore: todayData.recovery_score,
              sleepScore: todayData.sleep_score,
              sleepHours: todayData.sleep_hours ?? todayData.sleepHours,
              strainScore: todayData.strain,
              hrv: todayData.hrv,
              restingHeartRate: todayData.resting_heart_rate,
              // Advanced signals
              respiratoryRate: todayData.respiratory_rate,
              skinTemperature: todayData.skin_temperature,
              spo2Percentage: todayData.spo2_percentage,
              sleepEfficiencyPct: todayData.sleep_efficiency_pct,
              sleepStages: todayData.sleep_stages,
              cycleAvgHR: todayData.average_heart_rate,
              sleepNeededMinutes: todayData.sleep_needed_minutes,
            };
          }
        } else {
          // Historical date — fetch from WHOOP API or DB cache
          const histData = await whoopApiService.getDataForDate(userId, targetDate);
          console.log(`[FITSCORE] Historical WHOOP data for ${targetDate}:`, histData);
          if (histData) {
            whoopData = {
              recoveryScore: histData.recoveryScore,
              sleepScore: histData.sleepScore,
              sleepHours: histData.sleepHours,
              strainScore: histData.strainScore,
              hrv: histData.hrv,
              restingHeartRate: histData.restingHeartRate,
              respiratoryRate: (histData as any).respiratoryRate,
              skinTemperature: (histData as any).skinTempCelsius,
              spo2Percentage: (histData as any).spo2Percentage,
            };
          }
        }
        console.log(`[FITSCORE] WHOOP data retrieved - sleepHours: ${whoopData?.sleepHours}`);
      } catch (whoopError) {
        console.log(`[FITSCORE] Failed to get WHOOP data: ${whoopError}`);
      }

      // 1b. Get the day-before's WHOOP data for comparison
      // (the day before targetDate, so if targetDate=yesterday, this is two days ago)
      let yesterdayData = null;
      try {
        const dayBeforeDate = DateTime.fromISO(targetDate).minus({ days: 1 }).toISODate()!;
        yesterdayData = await whoopApiService.getDataForDate(userId, dayBeforeDate);
        console.log(`[FITSCORE] Day-before (${dayBeforeDate}) WHOOP data retrieved:`, yesterdayData);
      } catch (yesterdayError) {
        console.log(`[FITSCORE] Failed to get day-before WHOOP data: ${yesterdayError}`);
      }

      // 2. Get HRV baseline (7-day average)
      let hrvBaseline = null;
      try {
        const weeklyAverages = await whoopApiService.getWeeklyAverages(userId);
        hrvBaseline = weeklyAverages.avgHRV;
        console.log(`[FITSCORE] HRV baseline: ${hrvBaseline}ms`);
      } catch (hrvError) {
        console.log(`[FITSCORE] Failed to get HRV baseline: ${hrvError}`);
      }

      // 2b. Build advanced recovery signals with 7-day baselines for resp rate + skin temp
      let advancedRecoverySignals: {
        respiratoryRate?: number;
        respiratoryRateDelta?: number;
        skinTempDelta?: number;
        spo2?: number;
        sleepEfficiency?: number;
        sleepStages?: { rem: number; deep: number; light: number };
        cycleAvgHR?: number;
      } | undefined;

      try {
        const sevenDaysAgo = DateTime.fromISO(targetDate).minus({ days: 7 }).toISODate()!;
        const recentRows = await db.select({
          respiratoryRate: whoopDataTable.respiratoryRate,
          skinTempCelsius: whoopDataTable.skinTempCelsius,
        }).from(whoopDataTable).where(
          and(eq(whoopDataTable.userId, userId), gte(whoopDataTable.date, sevenDaysAgo), lt(whoopDataTable.date, targetDate))
        );

        const rrValues = recentRows.map(r => r.respiratoryRate).filter((v): v is number => v != null);
        const stValues = recentRows.map(r => r.skinTempCelsius).filter((v): v is number => v != null);
        const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;
        const avgST = stValues.length > 0 ? stValues.reduce((a, b) => a + b, 0) / stValues.length : null;

        const wd = whoopData as any; // typed locally above, cast to access advanced fields
        const signals: typeof advancedRecoverySignals = {};
        if (wd?.respiratoryRate != null) signals.respiratoryRate = wd.respiratoryRate;
        if (wd?.respiratoryRate != null && avgRR != null) signals.respiratoryRateDelta = Math.round((wd.respiratoryRate - avgRR) * 10) / 10;
        if (wd?.skinTemperature != null && avgST != null) signals.skinTempDelta = Math.round((wd.skinTemperature - avgST) * 10) / 10;
        if (wd?.spo2Percentage != null) signals.spo2 = Math.round(wd.spo2Percentage);
        if (wd?.sleepEfficiencyPct != null) signals.sleepEfficiency = wd.sleepEfficiencyPct;
        if (wd?.sleepStages) signals.sleepStages = {
          rem:   wd.sleepStages.rem_sleep_minutes   ?? 0,
          deep:  wd.sleepStages.deep_sleep_minutes  ?? 0,
          light: wd.sleepStages.light_sleep_minutes ?? 0,
        };
        if (wd?.cycleAvgHR != null) signals.cycleAvgHR = wd.cycleAvgHR;
        if (Object.keys(signals).length > 0) advancedRecoverySignals = signals;
      } catch { /* graceful — never block FitScore calculation */ }

      // 2c. Compute sleep debt
      const sleepNeededMinutes = (whoopData as any)?.sleepNeededMinutes ?? undefined;
      const actualSleepMinutes = whoopData?.sleepHours != null ? Math.round(whoopData.sleepHours * 60) : undefined;
      const sleepDebtMinutes = sleepNeededMinutes != null && actualSleepMinutes != null
        ? Math.max(0, sleepNeededMinutes - actualSleepMinutes)
        : undefined;

      // 3. Calculate Recovery Score
      const recoveryResult = recoveryScoreService.calculateRecoveryScore({
        recoveryPercent: whoopData?.recoveryScore ?? undefined,
        sleepHours: whoopData?.sleepHours ?? undefined,
        sleepScorePercent: whoopData?.sleepScore ?? undefined,
        hrv: whoopData?.hrv ?? undefined,
        hrvBaseline: hrvBaseline ?? undefined,
      });

      console.log(`[FITSCORE] Recovery score: ${recoveryResult.score}/10`);

      // 4. Get Training Sessions and calculate average training score
      const trainingSessions = await storage.getTrainingDataByUserAndDate(userId, targetDate);

      // Fetch user context (rehab stage, goal, weekly load) once — used for both default and session scoring
      const [userGoal] = await db.select().from(userGoals).where(eq(userGoals.userId, userId)).limit(1);
      const [userCtx]  = await db.select().from(userContext).where(eq(userContext.userId, userId)).limit(1);
      const fitnessGoal  = userGoal?.title || undefined;
      const rehabStage   = userCtx?.rehabStage   || undefined;
      const primaryGoal  = userCtx?.tier1Goal    || undefined;
      const weeklyLoad   = userCtx?.tier3WeekLoad || undefined;

      let trainingScore: number;

      if (trainingSessions && trainingSessions.length > 0) {
        // Calculate scores for each training session with full context
        const sessionScores = trainingSessions.map((session: any) => {
          const result = trainingScoreService.calculateTrainingScore({
            type: session.type,
            duration: session.duration,
            intensity: session.intensity,
            goal: session.goal,
            comment: session.comment,
            skipped: session.skipped,
            recoveryScore: whoopData?.recoveryScore,
            strainScore: whoopData?.strainScore,
            fitnessGoal,
            rehabStage,
            primaryGoal,
            weeklyLoad,
          });
          return result.score;
        });

        trainingScore = sessionScores.reduce((a: number, b: number) => a + b, 0) / sessionScores.length;
        console.log(`[FITSCORE] Training score: ${trainingScore.toFixed(1)}/10 (${trainingSessions.length} sessions)`);
      } else {
        // No training logged — default score depends on context, capped when body is in red zone
        const rehab = (rehabStage || '').toLowerCase();
        const load  = (weeklyLoad || '').toLowerCase();
        const pg    = (primaryGoal || '').toLowerCase();
        const noSessionRecoveryZone = recoveryResult.recoveryZone;

        if (rehab.includes('acute')) {
          // Rest is correct execution — but red zone caps it (day is still constrained)
          trainingScore = noSessionRecoveryZone === 'red' ? 6.5 : 7.5;
        } else if (rehab.includes('sub') || rehab.includes('rehab') || rehab.includes('return') || pg.includes('rehab')) {
          // Rehab phase — some activity expected but rest is ok
          trainingScore = noSessionRecoveryZone === 'red' ? 5.5 : 6.0;
        } else if (load === 'light') {
          // Light week / deload — scheduled rest is fine
          trainingScore = noSessionRecoveryZone === 'red' ? 5.5 : 6.5;
        } else if (load === 'heavy' || load === 'competition' || pg.includes('performance')) {
          // Build/performance phase — missing a session matters a lot
          trainingScore = 4.0;
        } else {
          // General default
          trainingScore = noSessionRecoveryZone === 'red' ? 4.5 : 5.0;
        }
        console.log(`[FITSCORE] No training sessions — context-aware default: ${trainingScore}/10 (rehabStage=${rehabStage}, weeklyLoad=${weeklyLoad}, recoveryZone=${noSessionRecoveryZone})`);
      }

      // 5. Get Meals, compute daily nutrition score with day-level penalties, and build day context
      const meals = await storage.getMealsByUserAndDate(userId, targetDate);
      let nutritionScore = 1; // Default if no meals
      let mealScores: number[] = [];

      // Day-level nutrition context — single source of truth for zone, weak link, and FitCoach prompt
      let nutritionDayContext: {
        mealsLogged: number;
        firstMealTime: string | null;
        lastMealTime: string | null;
        longestGapHours: number | null;
        lateMealFlag: boolean;
        onlyMealIsPureJunk: boolean;
      } = {
        mealsLogged: 0,
        firstMealTime: null,
        lastMealTime: null,
        longestGapHours: null,
        lateMealFlag: false,
        onlyMealIsPureJunk: false,
      };

      // Timing signals (kept for backward compat with FitCoach endpoint)
      let timingSignals: {
        timing_flag_long_gap: boolean;
        timing_flag_late_meal: boolean;
        longest_gap_hours?: number;
        long_gap_window?: string;
        late_meal_time?: string;
      } = {
        timing_flag_long_gap: false,
        timing_flag_late_meal: false,
      };

      if (meals && meals.length > 0) {
        // Parse each meal once: score + isPureJunk + meal_time
        interface ParsedMeal { score: number; isPureJunk: boolean; meal_time: string | null; mealType: string }
        const parsedMeals: ParsedMeal[] = meals.map((meal: any) => {
          let score = 5;
          let isPureJunk = false;
          let meal_time: string | null = null;
          if (meal.analysisResult) {
            try {
              const p = JSON.parse(meal.analysisResult);
              score = p.nutrition_subscore || 5;
              isPureJunk = p.meal_quality_flags?.isPureJunk === true;
              meal_time = p.meal_time || null;
            } catch {}
          }
          return { score, isPureJunk, meal_time, mealType: meal.mealType || 'Meal' };
        });

        mealScores = parsedMeals.map(m => m.score).filter(s => s > 0);
        if (mealScores.length > 0) {
          nutritionScore = mealScores.reduce((a, b) => a + b, 0) / mealScores.length;
        }

        // ── Day-level completeness penalty ──────────────────────────────────────
        const mealsLogged = meals.length;
        if (mealsLogged === 1) nutritionScore -= 2.0;
        else if (mealsLogged === 2) nutritionScore -= 0.75;
        // 3+ meals: no completeness penalty

        // Late meal penalty (≥22:00)
        const lateMealFlag = parsedMeals.some(
          m => m.meal_time !== null && parseInt(m.meal_time.split(':')[0], 10) >= 22
        );
        if (lateMealFlag) nutritionScore -= 0.5;

        // Clamp [1, 10]
        nutritionScore = Math.max(1, Math.min(10, nutritionScore));

        const hasPureJunk = parsedMeals.some(m => m.isPureJunk);
        const onlyMealIsPureJunk = mealsLogged === 1 && hasPureJunk;

        // If only meal is pure junk, cap score at 4.5 (forces RED zone)
        if (onlyMealIsPureJunk) {
          nutritionScore = Math.min(nutritionScore, 4.5);
        }

        // ── Timing signals ──────────────────────────────────────────────────────
        const timed = parsedMeals
          .filter(m => m.meal_time !== null)
          .sort((a, b) => a.meal_time!.localeCompare(b.meal_time!));

        let timing_flag_long_gap = false;
        let longest_gap_hours: number | undefined;
        let long_gap_window: string | undefined;
        let late_meal_time: string | undefined;

        for (let i = 1; i < timed.length; i++) {
          const [ph, pm] = timed[i-1].meal_time!.split(':').map(Number);
          const [ch, cm] = timed[i].meal_time!.split(':').map(Number);
          const gapH = (ch * 60 + cm - (ph * 60 + pm)) / 60;
          if (gapH >= 5 && (!longest_gap_hours || gapH > longest_gap_hours)) {
            timing_flag_long_gap = true;
            longest_gap_hours = Math.round(gapH * 10) / 10;
            long_gap_window = `${timed[i-1].mealType} → ${timed[i].mealType}`;
          }
        }
        for (const m of timed) {
          if (parseInt(m.meal_time!.split(':')[0], 10) >= 22) late_meal_time = m.meal_time!;
        }

        // Longest gap for day context (all gaps, not just ≥5h)
        let longestGapHours: number | null = null;
        for (let i = 1; i < timed.length; i++) {
          const [ph, pm] = timed[i-1].meal_time!.split(':').map(Number);
          const [ch, cm] = timed[i].meal_time!.split(':').map(Number);
          const gapH = (ch * 60 + cm - (ph * 60 + pm)) / 60;
          if (longestGapHours === null || gapH > longestGapHours) longestGapHours = Math.round(gapH * 10) / 10;
        }

        timingSignals = { timing_flag_long_gap, timing_flag_late_meal: lateMealFlag, longest_gap_hours, long_gap_window, late_meal_time };
        nutritionDayContext = {
          mealsLogged,
          firstMealTime: timed[0]?.meal_time ?? null,
          lastMealTime: timed[timed.length - 1]?.meal_time ?? null,
          longestGapHours: timed.length >= 2 ? longestGapHours : null,
          lateMealFlag,
          onlyMealIsPureJunk,
        };

        console.log(`[FITSCORE] Nutrition score: ${nutritionScore.toFixed(1)}/10 (${mealsLogged} meals, onlyJunk=${onlyMealIsPureJunk}, late=${lateMealFlag})`);
      } else {
        console.log(`[FITSCORE] No meals found, using default score: ${nutritionScore}/10`);
      }

      // 6. Calculate final FitScore (average of all three)
      const fitScore = (recoveryResult.score + trainingScore + nutritionScore) / 3;
      const roundedFitScore = Math.round(fitScore * 10) / 10;

      console.log(`[FITSCORE] Final FitScore: ${roundedFitScore}/10`);
      console.log(`[FITSCORE] Breakdown: Recovery=${recoveryResult.score}, Training=${trainingScore.toFixed(1)}, Nutrition=${nutritionScore.toFixed(1)}`);

      // Zone helpers — single source of truth
      const getScoreZone = (score: number): 'green' | 'yellow' | 'red' => {
        if (score >= 7) return 'green';
        if (score >= 4) return 'yellow';
        return 'red';
      };
      // Nutrition uses tighter thresholds: RED <5, YELLOW 5–6.9, GREEN ≥7
      const getNutritionZone = (score: number): 'green' | 'yellow' | 'red' => {
        if (nutritionDayContext.onlyMealIsPureJunk) return 'red';
        if (score >= 7.0) return 'green';
        if (score >= 5.0) return 'yellow';
        return 'red';
      };

      const response = {
        date: targetDate,
        fitScore: roundedFitScore,
        fitScoreZone: getScoreZone(roundedFitScore),
        breakdown: {
          recovery: {
            score: recoveryResult.score,
            zone: recoveryResult.recoveryZone,
            details: recoveryResult.breakdown,
            analysis: recoveryResult.analysis,
          },
          training: {
            score: Math.round(trainingScore * 10) / 10,
            zone: getScoreZone(trainingScore),
            sessionsCount: trainingSessions?.length || 0,
          },
          nutrition: {
            score: Math.round(nutritionScore * 10) / 10,
            zone: getNutritionZone(nutritionScore),
            mealsCount: meals?.length || 0,
            mealScores,
          },
        },
        whoopData: {
          recoveryScore: whoopData?.recoveryScore,
          strainScore: whoopData?.strainScore,
          sleepScore: whoopData?.sleepScore,
          sleepHours: whoopData?.sleepHours,
          hrv: whoopData?.hrv,
          hrvBaseline,
        },
        advancedRecoverySignals,
        sleepDebtMinutes,
        yesterdayData: {
          recoveryScore: yesterdayData?.recoveryScore ?? null,
          sleepScore: yesterdayData?.sleepScore ?? null,
          sleepHours: yesterdayData?.sleepHours ?? null,
          hrv: yesterdayData?.hrv ?? null,
        },
        allGreen: recoveryResult.recoveryZone === 'green' &&
                  getScoreZone(trainingScore) === 'green' &&
                  getNutritionZone(nutritionScore) === 'green',
        timingSignals,
        nutritionDayContext,
        waterIntakeBand: (waterIntakeBand as string) || null,
        timestamp: new Date().toISOString(),
      };

      // Persist score + pillar breakdown to DB (upsert by user+date)
      try {
        await db.insert(fitScores)
          .values({
            userId,
            date: targetDate,
            score: roundedFitScore,
            nutritionScore: Math.round(nutritionScore * 10) / 10,
            trainingScore: Math.round(trainingScore * 10) / 10,
            recoveryScore: Math.round(recoveryResult.score * 10) / 10,
          })
          .onConflictDoUpdate({
            target: [fitScores.userId, fitScores.date],
            set: {
              score: roundedFitScore,
              nutritionScore: Math.round(nutritionScore * 10) / 10,
              trainingScore: Math.round(trainingScore * 10) / 10,
              recoveryScore: Math.round(recoveryResult.score * 10) / 10,
              calculatedAt: new Date(),
            },
          });
        console.log(`[FITSCORE] Saved to DB: user=${userId} date=${targetDate} score=${roundedFitScore}`);
      } catch (dbErr) {
        // Non-fatal — score still returned to client
        console.error('[FITSCORE] Failed to save to DB:', dbErr);
      }

      res.json(response);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITSCORE] Error calculating FitScore:', message);
      res.status(500).json({
        error: 'Failed to calculate FitScore',
        details: message
      });
    }
  });

  // ========== FitCoach Daily Summary Endpoint ==========
  // Generates warm, supportive summary without raw numbers
  app.post('/api/fitscore/coach-summary', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please authenticate to get coach summary'
        });
      }

      const {
        fitScore,
        recoveryZone,
        trainingZone,
        nutritionZone,
        fitScoreZone,
        hadTraining,
        hadMeals,
        mealsCount,
        sessionsCount,
        recoveryScore,
        sleepHours,
        sleepScore,
        hrv,
        hrvBaseline,
        strainScore,
        recoveryBreakdownScore,
        trainingBreakdownScore,
        nutritionBreakdownScore,
        dateLabel, // e.g. "today", "yesterday", "Feb 21"
        timingSignals,
        waterIntakeBand,
        dailyHabits, // { total, completed, completedList, missingList }
        advancedRecoverySignals,
        sleepDebtMinutes,
      } = req.body;

      console.log(`[COACH SUMMARY] Generating summary for user: ${userId}, fitScore: ${fitScore}`);

      // Get user's fitness goal
      const [userGoal] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .limit(1);

      // Get today's self-assessment feeling (if available)
      const todayLocal = DateTime.now().setZone('Europe/Zurich').toISODate()!;
      let todayFeeling: string | undefined;
      try {
        const checkin = await storage.getCheckinByUserAndDate(userId, todayLocal);
        if (checkin) todayFeeling = checkin.feeling;
      } catch { /* graceful */ }

      // Get user context for AI personalisation
      let coachContextSummary: string | undefined;
      try {
        const ctx = await storage.getUserContext(userId);
        if (ctx) {
          const parts = [
            `User profile: goal=${ctx.tier1Goal}, priority=${ctx.tier1Priority}, phase=${ctx.tier2Phase}, emphasis=${ctx.tier2Emphasis}`,
            `This week: load=${ctx.tier3WeekLoad}, stress=${ctx.tier3Stress}, sleep expectation=${ctx.tier3SleepExpectation}`,
          ];
          if (ctx.workHoursPerWeek) parts.push(`Work hours/week: ${ctx.workHoursPerWeek}`);
          if (ctx.trainingSessionsPerWeek) parts.push(`Training sessions/week: ${ctx.trainingSessionsPerWeek}`);
          if (ctx.injuryType && ctx.injuryType !== 'None') {
            let injuryLine = `Active injury: ${ctx.injuryType}${ctx.injuryLocation ? ` (${ctx.injuryLocation})` : ''}`;
            if (ctx.rehabStage) {
              const stageExpectation: Record<string, string> = {
                'Acute (rest & protection)':  'Complete rest is correct. Do NOT suggest more activity. Praise any rest taken.',
                'Sub-acute (light movement)': 'Light movement is appropriate. WHOOP strain 2–6 is correct. Gently encourage gradual progression.',
                'Rehab (guided exercises)':   'Guided rehab exercises are the goal. WHOOP strain 4–10 is appropriate. Push user to stay consistent with their sessions and track progression.',
                'Return to training':         'Progressive loading is the goal. WHOOP strain 8–15 is the target range. Encourage increasing intensity week by week within safe limits.',
              };
              const expectation = stageExpectation[ctx.rehabStage];
              injuryLine += `. Rehab stage: ${ctx.rehabStage}${expectation ? `. Training slide context: ${expectation}` : ''}`;
            }
            parts.push(injuryLine);
          }
          coachContextSummary = parts.join('\n');
        }
      } catch { /* graceful */ }

      // Inject plan habits accountability line
      try {
        const activePlan = await storage.getActivePlan(userId);
        if (activePlan) {
          const habits = await storage.getPlanHabits(activePlan.id);
          if (habits.length > 0) {
            const todayForCheckin = DateTime.now().setZone(process.env.USER_TZ || 'Europe/Zurich').toFormat('yyyy-MM-dd');
            const checkins = await storage.getHabitCheckinsByDate(userId, todayForCheckin);
            const checkedCount = checkins.filter(c => c.checked && habits.some(h => h.habitKey === c.habitKey)).length;
            coachContextSummary = (coachContextSummary || '') +
              `\nPlan habits: ${checkedCount}/${habits.length} ${activePlan.pillar} habits completed today.`;
          }
        }
      } catch { /* graceful */ }

      // Aggregate estimated meal macros from today's logged meals
      let mealMacros: { totalCalories: number | null; totalProtein: number | null; calorieTarget?: number | null; proteinTarget?: number | null } | undefined;
      try {
        const todayForMeals = DateTime.now().setZone(process.env.USER_TZ || 'Europe/Zurich').toFormat('yyyy-MM-dd');
        const todayMeals = await storage.getMealsByUserAndDate(userId, todayForMeals);
        let totalCal = 0, totalProt = 0, hasCalorie = false, hasProtein = false;
        for (const m of todayMeals) {
          if (m.analysisResult) {
            try {
              const p = JSON.parse(m.analysisResult);
              if (typeof p.estimated_calories === 'number') { totalCal += p.estimated_calories; hasCalorie = true; }
              if (typeof p.estimated_protein === 'number') { totalProt += p.estimated_protein; hasProtein = true; }
            } catch { /* skip */ }
          }
        }
        if (hasCalorie || hasProtein) {
          const ctx = await storage.getUserContext(userId);
          mealMacros = {
            totalCalories: hasCalorie ? totalCal : null,
            totalProtein: hasProtein ? totalProt : null,
            calorieTarget: ctx?.calorieTarget ?? null,
            proteinTarget: ctx?.proteinTarget ?? null,
          };
        }
      } catch { /* graceful */ }

      // Fetch recent training context (last 3 days before today)
      let recentTrainingHistory: string | undefined;
      try {
        const recentRows = await db.select({
          date: fitScores.date,
          trainingScore: fitScores.trainingScore,
          score: fitScores.score,
        })
        .from(fitScores)
        .where(and(
          eq(fitScores.userId, userId),
          sql`${fitScores.date} < ${todayLocal}`,
          sql`${fitScores.trainingScore} IS NOT NULL`,
        ))
        .orderBy(desc(fitScores.date))
        .limit(3);

        if (recentRows.length > 0) {
          recentTrainingHistory = recentRows
            .map(r => `${r.date}: trainingScore=${r.trainingScore}, fitScore=${r.score}`)
            .join('; ');
        }
      } catch { /* non-fatal */ }

      const summary = await openAIService.generateDailySummary({
        fitScore: fitScore || 5.0,
        recoveryZone: recoveryZone || 'yellow',
        trainingZone: trainingZone || 'yellow',
        nutritionZone: nutritionZone || 'yellow',
        fitScoreZone: fitScoreZone || 'yellow',
        hadTraining: hadTraining ?? false,
        hadMeals: hadMeals ?? false,
        mealsCount,
        sessionsCount,
        recoveryScore,
        sleepHours,
        sleepScore,
        hrv,
        hrvBaseline,
        strainScore,
        userGoal: userGoal?.title || undefined,
        recoveryBreakdownScore,
        trainingBreakdownScore,
        nutritionBreakdownScore,
        todayFeeling,
        userContextSummary: coachContextSummary,
        dateLabel: dateLabel || 'today',
        timingSignals: timingSignals || undefined,
        waterIntakeBand: waterIntakeBand || undefined,
        dailyHabits: dailyHabits || undefined,
        advancedRecoverySignals: advancedRecoverySignals || undefined,
        sleepDebtMinutes: sleepDebtMinutes ?? undefined,
        mealMacros,
        recentTrainingHistory,
      });

      console.log(`[COACH SUMMARY] Summary generated successfully`);

      res.json({
        preview: summary.preview,
        slides: summary.slides,
        fitCoachTake: summary.fitCoachTake,
        tomorrowsOutlook: summary.tomorrowsOutlook,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[COACH SUMMARY] Error:', message);
      res.status(500).json({
        error: 'Failed to generate coach summary',
        details: message
      });
    }
  });

  // ==========================================
  // FitLook Endpoints
  // ==========================================

  // ──── Daily Check-in ────

  // GET /api/checkin/today — Fetch today's check-in if exists
  app.get('/api/checkin/today', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const todayLocal = DateTime.now().setZone('Europe/Zurich').toISODate()!;
      const checkin = await storage.getCheckinByUserAndDate(userId, todayLocal);

      if (checkin) {
        return res.json({ feeling: checkin.feeling, date_local: checkin.dateLocal, exists: true });
      }
      return res.json({ exists: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CHECKIN] GET error:', message);
      res.status(500).json({ error: 'Failed to fetch check-in' });
    }
  });

  // POST /api/checkin/today — Save today's check-in
  app.post('/api/checkin/today', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { feeling } = req.body;
      if (!feeling || !['energized', 'steady', 'tired', 'stressed'].includes(feeling)) {
        return res.status(400).json({ error: 'Invalid feeling. Must be: energized, steady, tired, stressed' });
      }

      const todayLocal = DateTime.now().setZone('Europe/Zurich').toISODate()!;

      // Check if already exists
      const existing = await storage.getCheckinByUserAndDate(userId, todayLocal);
      if (existing) {
        return res.json({ feeling: existing.feeling, date_local: existing.dateLocal, exists: true });
      }

      const checkin = await storage.createCheckin({
        userId,
        dateLocal: todayLocal,
        feeling,
      });

      console.log(`[CHECKIN] Saved for user=${userId} date=${todayLocal} feeling=${feeling}`);
      res.json({ feeling: checkin.feeling, date_local: checkin.dateLocal, exists: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CHECKIN] POST error:', message);
      res.status(500).json({ error: 'Failed to save check-in' });
    }
  });

  // ──── FitLook ────

  // GET /api/fitlook/today — Fetch or auto-generate today's FitLook
  app.get('/api/fitlook/today', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const todayLocal = DateTime.now().setZone('Europe/Zurich').toISODate()!;

      // Check cache first
      const existing = await storage.getFitlookByUserAndDate(userId, todayLocal);
      if (existing) {
        console.log(`[FITLOOK] Serving cached FitLook for ${userId} date=${todayLocal}`);
        return res.json({
          ...JSON.parse(existing.payloadJson),
          cached: true,
          created_at: existing.createdAt,
        });
      }

      // Check if self-assessment exists for today
      const checkin = await storage.getCheckinByUserAndDate(userId, todayLocal);
      if (!checkin) {
        return res.status(400).json({ error: 'Check-in required', needs_checkin: true });
      }

      console.log(`[FITLOOK] Generating FitLook for user=${userId} date=${todayLocal} feeling=${checkin.feeling}`);

      // Gather inputs (all gracefully optional)
      let recoveryPercent: number | undefined;
      let sleepHours: number | undefined;
      let hrv: number | undefined;
      let strainScore: number | undefined;
      let fitlookAdvancedSignals: Parameters<typeof openAIService.generateFitLook>[0]['advancedRecoverySignals'];
      let fitlookSleepDebtMinutes: number | undefined;

      try {
        const whoopToday = await whoopApiService.getTodaysData(userId);
        recoveryPercent = whoopToday?.recovery_score ?? undefined;
        sleepHours = whoopToday?.sleep_hours ?? whoopToday?.sleepHours ?? undefined;
        hrv = whoopToday?.hrv ?? undefined;
        strainScore = whoopToday?.strain ?? undefined;

        // Advanced signals: compute 7-day baselines for respiratory rate + skin temp
        try {
          const sevenDaysAgo = DateTime.fromISO(todayLocal).minus({ days: 7 }).toISODate()!;
          const baselineRows = await db.select({
            respiratoryRate: whoopDataTable.respiratoryRate,
            skinTempCelsius: whoopDataTable.skinTempCelsius,
          }).from(whoopDataTable).where(
            and(eq(whoopDataTable.userId, userId), gte(whoopDataTable.date, sevenDaysAgo), lt(whoopDataTable.date, todayLocal))
          );
          const rrVals = baselineRows.map(r => r.respiratoryRate).filter((v): v is number => v != null);
          const stVals = baselineRows.map(r => r.skinTempCelsius).filter((v): v is number => v != null);
          const avgRR = rrVals.length > 0 ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : null;
          const avgST = stVals.length > 0 ? stVals.reduce((a, b) => a + b, 0) / stVals.length : null;

          const wt = whoopToday as any;
          const sigs: NonNullable<typeof fitlookAdvancedSignals> = {};
          if (wt?.respiratory_rate != null) sigs.respiratoryRate = wt.respiratory_rate;
          if (wt?.respiratory_rate != null && avgRR != null) sigs.respiratoryRateDelta = Math.round((wt.respiratory_rate - avgRR) * 10) / 10;
          if (wt?.skin_temperature != null && avgST != null) sigs.skinTempDelta = Math.round((wt.skin_temperature - avgST) * 10) / 10;
          if (wt?.spo2_percentage != null) sigs.spo2 = Math.round(wt.spo2_percentage);
          if (wt?.sleep_efficiency_pct != null) sigs.sleepEfficiency = wt.sleep_efficiency_pct;
          if (wt?.sleep_stages) sigs.sleepStages = {
            rem: wt.sleep_stages.rem_sleep_minutes ?? 0,
            deep: wt.sleep_stages.deep_sleep_minutes ?? 0,
            light: wt.sleep_stages.light_sleep_minutes ?? 0,
          };
          if (wt?.average_heart_rate != null) sigs.cycleAvgHR = wt.average_heart_rate;
          if (Object.keys(sigs).length > 0) fitlookAdvancedSignals = sigs;
        } catch { /* graceful */ }

        // Sleep debt
        const sleepNeededMins = (whoopToday as any)?.sleep_needed_minutes ?? undefined;
        const actualSleepMins = sleepHours != null ? Math.round(sleepHours * 60) : undefined;
        if (sleepNeededMins != null && actualSleepMins != null) {
          fitlookSleepDebtMinutes = Math.max(0, sleepNeededMins - actualSleepMins);
        }
      } catch (e) {
        console.log('[FITLOOK] WHOOP data not available:', (e as Error).message);
      }

      // Yesterday's FitScore
      const yesterday = DateTime.now().setZone('Europe/Zurich').minus({ days: 1 }).toISODate()!;
      let yesterdayFitScore: number | undefined;
      let yesterdayBreakdown: { recovery?: number; training?: number; nutrition?: number } | undefined;
      try {
        const [ys] = await db.select().from(fitScores)
          .where(and(eq(fitScores.userId, userId), eq(fitScores.date, yesterday)))
          .limit(1);
        if (ys) yesterdayFitScore = ys.score;
      } catch { /* graceful */ }

      // 3-day FitScore trend
      let fitScoreTrend3d: number[] | undefined;
      try {
        const recentScores = await db.select({ score: fitScores.score })
          .from(fitScores)
          .where(eq(fitScores.userId, userId))
          .orderBy(desc(fitScores.date))
          .limit(3);
        if (recentScores.length >= 2) {
          fitScoreTrend3d = recentScores.map(r => r.score);
        }
      } catch { /* graceful */ }

      // Today's planned training from calendar
      let plannedTraining: string | undefined;
      try {
        const calendars = await storage.getUserCalendars(userId);
        const activeUrls = calendars.filter(c => c.isActive).map(c => c.calendarUrl);
        const zurichNow = DateTime.now().setZone('Europe/Zurich');
        const todayStart = zurichNow.startOf('day');
        const todayEnd = zurichNow.endOf('day');

        for (const url of activeUrls) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const icsData = await resp.text();
            const parsedCal = ical.parseICS(icsData);
            Object.keys(parsedCal).forEach(key => {
              const event = parsedCal[key];
              if (event.type === 'VEVENT' && event.start && event.summary) {
                const eventStart = DateTime.fromJSDate(new Date(event.start)).setZone('Europe/Zurich');
                if (eventStart >= todayStart && eventStart <= todayEnd) {
                  // Check if training-related
                  const title = event.summary.toLowerCase();
                  if (/train|gym|run|workout|swim|yoga|sport|floorball|strength|cardio|session/i.test(title)) {
                    plannedTraining = event.summary;
                  }
                }
              }
            });
          } catch { /* skip failed calendar */ }
        }
      } catch { /* graceful */ }

      // User goal
      let userGoalTitle: string | undefined;
      try {
        const [goal] = await db.select().from(userGoals)
          .where(eq(userGoals.userId, userId))
          .limit(1);
        if (goal) userGoalTitle = goal.title;
      } catch { /* graceful */ }

      // Injury notes from recent training comments
      let injuryNotes: string | undefined;
      try {
        const recentTraining = await storage.getTrainingDataByUserAndDate(userId, yesterday);
        const notes = recentTraining
          .filter(t => t.comment && /injur|pain|sore|strain|hurt/i.test(t.comment!))
          .map(t => t.comment)
          .join('; ');
        if (notes) injuryNotes = notes;
      } catch { /* graceful */ }

      // User context for AI personalisation
      let fitlookContextSummary: string | undefined;
      try {
        const ctx = await storage.getUserContext(userId);
        if (ctx) {
          const parts = [
            `User profile: goal=${ctx.tier1Goal}, priority=${ctx.tier1Priority}, phase=${ctx.tier2Phase}, emphasis=${ctx.tier2Emphasis}`,
            `This week: load=${ctx.tier3WeekLoad}, stress=${ctx.tier3Stress}, sleep expectation=${ctx.tier3SleepExpectation}`,
          ];
          if (ctx.workHoursPerWeek) parts.push(`Work hours/week: ${ctx.workHoursPerWeek}`);
          if (ctx.trainingSessionsPerWeek) parts.push(`Training sessions/week: ${ctx.trainingSessionsPerWeek}`);
          if (ctx.injuryType && ctx.injuryType !== 'None') {
            parts.push(`Active injury: ${ctx.injuryType}${ctx.injuryLocation ? ` (${ctx.injuryLocation})` : ''}${ctx.rehabStage ? `, stage: ${ctx.rehabStage}` : ''}`);
          }
          fitlookContextSummary = parts.join('\n');
        }
      } catch { /* graceful */ }

      // Generate via AI
      const payload = await openAIService.generateFitLook({
        dateLocal: todayLocal,
        feeling: checkin.feeling,
        recoveryPercent,
        sleepHours,
        hrv,
        strainScore,
        yesterdayFitScore,
        yesterdayBreakdown,
        fitScoreTrend3d,
        plannedTraining,
        userGoalTitle,
        injuryNotes,
        userContextSummary: fitlookContextSummary,
        advancedRecoverySignals: fitlookAdvancedSignals,
        sleepDebtMinutes: fitlookSleepDebtMinutes,
      });

      // Store immutably
      const record = await storage.createFitlook({
        userId,
        dateLocal: todayLocal,
        payloadJson: JSON.stringify(payload),
      });

      console.log(`[FITLOOK] Generated and stored for user=${userId} date=${todayLocal}`);
      res.json({ ...payload, cached: false, created_at: record.createdAt, sleepDebtMinutes: fitlookSleepDebtMinutes ?? null });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITLOOK] Error:', message);
      res.status(500).json({ error: 'Failed to generate FitLook', details: message });
    }
  });

  // POST /api/fitlook/generate — Force regenerate (admin/debug)
  app.post('/api/fitlook/generate', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const todayLocal = DateTime.now().setZone('Europe/Zurich').toISODate()!;

      // Delete existing for today
      await storage.deleteFitlookByUserAndDate(userId, todayLocal);
      console.log(`[FITLOOK] Force-regenerating for user=${userId} date=${todayLocal}`);

      // Forward to GET handler logic by making internal request
      // Simpler: just redirect
      res.redirect(307, '/api/fitlook/today');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITLOOK] Force-generate error:', message);
      res.status(500).json({ error: 'Failed to regenerate FitLook', details: message });
    }
  });

  // ──── FitRoast ────

  // GET /api/fitroast/current — Fetch the most recent weekly roast (or generate if missing)
  app.get('/api/fitroast/current', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const zurichNow = DateTime.now().setZone('Europe/Zurich');
      // Week: Monday–Sunday
      const weekEnd = zurichNow.startOf('week').plus({ days: 6 }).toISODate()!;
      const weekStart = zurichNow.startOf('week').toISODate()!;

      // Check cache for this week first — always serve if present
      const existing = await storage.getFitroastByUserAndWeek(userId, weekEnd);
      if (existing) {
        console.log(`[FITROAST] Serving cached roast for user=${userId} week=${weekEnd}`);
        return res.json({
          ...JSON.parse(existing.payloadJson),
          cached: true,
          created_at: existing.createdAt,
        });
      }

      // No roast for this week yet — if it's not Sunday, serve last week's roast so
      // users can still read it Mon–Sat while the new week builds up
      if (zurichNow.weekday !== 7) {
        const latest = await storage.getLatestFitroast(userId);
        if (latest) {
          console.log(`[FITROAST] Serving previous roast (${latest.weekEnd}) for user=${userId} on weekday=${zurichNow.weekday}`);
          return res.json({
            ...JSON.parse(latest.payloadJson),
            cached: true,
            created_at: latest.createdAt,
            previous_week: true,
          });
        }
      }

      // No roast yet — eligibility is Sunday only (no active-day requirement for now)
      const isSunday = zurichNow.weekday === 7; // Luxon: 1=Mon … 7=Sun
      const eligible = isSunday;

      console.log(`[FITROAST] No roast yet for user=${userId}: isSunday=${isSunday}, eligible=${eligible}`);

      return res.status(404).json({
        error: 'No roast for this week yet',
        needs_generate: eligible,
        eligible,
        is_sunday: isSunday,
        active_days: 7, // not used for gating anymore — report full week so mobile shows unlocked pips
        week_start: weekStart,
        week_end: weekEnd,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITROAST] GET error:', message);
      res.status(500).json({ error: 'Failed to fetch FitRoast', details: message });
    }
  });

  // POST /api/fitroast/generate — Generate (or regenerate) this week's roast
  app.post('/api/fitroast/generate', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const zurichNow = DateTime.now().setZone('Europe/Zurich');
      const weekEnd = zurichNow.startOf('week').plus({ days: 6 }).toISODate()!;
      const weekStart = zurichNow.startOf('week').toISODate()!;

      // Eligibility check: Sunday only
      const isSunday = zurichNow.weekday === 7;

      if (!isSunday) {
        console.log(`[FITROAST] Not eligible for user=${userId}: not Sunday (weekday=${zurichNow.weekday})`);
        return res.status(403).json({
          error: 'FitRoast is generated every Sunday based on your weekly performance.',
          is_sunday: false,
          eligible: false,
        });
      }

      // Delete existing roast for this week (allow regeneration on Sunday)
      await storage.deleteFitroastByUserAndWeek(userId, weekEnd);

      console.log(`[FITROAST] Generating roast for user=${userId} week=${weekStart}–${weekEnd}`);

      // Gather weekly data (all graceful)
      let avgFitScore: number | undefined;
      let bestDayScore: number | undefined;
      let worstDayScore: number | undefined;
      let bestDay: string | undefined;
      let worstDay: string | undefined;
      let avgRecovery: number | undefined;

      try {
        const weekScores = await db.select()
          .from(fitScores)
          .where(and(eq(fitScores.userId, userId), sql`date >= ${weekStart} AND date <= ${weekEnd}`))
          .orderBy(desc(fitScores.score));

        if (weekScores.length > 0) {
          avgFitScore = Math.round((weekScores.reduce((s, r) => s + r.score, 0) / weekScores.length) * 10) / 10;
          bestDayScore = weekScores[0].score;
          bestDay = weekScores[0].date;
          worstDayScore = weekScores[weekScores.length - 1].score;
          worstDay = weekScores[weekScores.length - 1].date;
        }
      } catch { /* graceful */ }

      // Recovery trend from WHOOP
      let recoveryTrend: string | undefined;
      try {
        const whoopToday = await whoopApiService.getTodaysData(userId);
        if (whoopToday?.recovery_score) {
          avgRecovery = whoopToday.recovery_score;
        }
      } catch { /* graceful */ }

      // Training count this week
      let trainingCount: number | undefined;
      try {
        const days: string[] = [];
        for (let i = 0; i < 7; i++) {
          days.push(DateTime.fromISO(weekStart).plus({ days: i }).toISODate()!);
        }
        let count = 0;
        for (const day of days) {
          const sessions = await storage.getTrainingDataByUserAndDate(userId, day);
          count += sessions.length;
        }
        trainingCount = count;
      } catch { /* graceful */ }

      // Nutrition log days this week
      let nutritionLogDays: number | undefined;
      try {
        const days: string[] = [];
        for (let i = 0; i < 7; i++) {
          days.push(DateTime.fromISO(weekStart).plus({ days: i }).toISODate()!);
        }
        let loggedDays = 0;
        for (const day of days) {
          const meals = await storage.getMealsByUserAndDate(userId, day);
          if (meals.length > 0) loggedDays++;
        }
        nutritionLogDays = loggedDays;
      } catch { /* graceful */ }

      // Feelings this week from daily checkins
      let feelingsThisWeek: string[] | undefined;
      try {
        const days: string[] = [];
        for (let i = 0; i < 7; i++) {
          days.push(DateTime.fromISO(weekStart).plus({ days: i }).toISODate()!);
        }
        const feelings: string[] = [];
        for (const day of days) {
          const checkin = await storage.getCheckinByUserAndDate(userId, day);
          if (checkin) feelings.push(checkin.feeling);
        }
        if (feelings.length > 0) feelingsThisWeek = feelings;
      } catch { /* graceful */ }

      // User goal
      let userGoalTitle: string | undefined;
      try {
        const [goal] = await db.select().from(userGoals).where(eq(userGoals.userId, userId)).limit(1);
        if (goal) userGoalTitle = goal.title;
      } catch { /* graceful */ }

      // Injury notes from this week's training
      let injuryNotes: string | undefined;
      try {
        const days: string[] = [];
        for (let i = 0; i < 7; i++) {
          days.push(DateTime.fromISO(weekStart).plus({ days: i }).toISODate()!);
        }
        const notes: string[] = [];
        for (const day of days) {
          const sessions = await storage.getTrainingDataByUserAndDate(userId, day);
          for (const s of sessions) {
            if (s.comment && /injur|pain|sore|strain|hurt/i.test(s.comment)) {
              notes.push(s.comment);
            }
          }
        }
        if (notes.length > 0) injuryNotes = notes.join('; ');
      } catch { /* graceful */ }

      // User context for AI personalisation
      let roastContextSummary: string | undefined;
      try {
        const ctx = await storage.getUserContext(userId);
        if (ctx) {
          const parts = [
            `User profile: goal=${ctx.tier1Goal}, priority=${ctx.tier1Priority}, phase=${ctx.tier2Phase}, emphasis=${ctx.tier2Emphasis}`,
            `This week: load=${ctx.tier3WeekLoad}, stress=${ctx.tier3Stress}, sleep expectation=${ctx.tier3SleepExpectation}`,
          ];
          if (ctx.injuryType && ctx.injuryType !== 'None') {
            parts.push(`Active injury: ${ctx.injuryType}${ctx.injuryLocation ? ` (${ctx.injuryLocation})` : ''}${ctx.rehabStage ? `, stage: ${ctx.rehabStage}` : ''}`);
          }
          roastContextSummary = parts.join('\n');
        }
      } catch { /* graceful */ }

      // Fetch last week's roast to extract theme_used (avoid repeating same theme)
      let lastRoastTheme: string | undefined;
      try {
        const prevWeekEnd = DateTime.fromISO(weekEnd).minus({ weeks: 1 }).toISODate()!;
        const prevRoast = await storage.getFitroastByUserAndWeek(userId, prevWeekEnd);
        if (prevRoast) {
          const prevPayload = JSON.parse(prevRoast.payloadJson);
          lastRoastTheme = prevPayload.theme_used as string | undefined;
        }
      } catch { /* graceful — theme diversity is best-effort */ }

      // Generate
      const roastIntensity = req.body?.intensity as 'Light' | 'Spicy' | 'Savage' | undefined;
      const payload = await openAIService.generateFitRoast({
        weekStart,
        weekEnd,
        avgFitScore,
        bestDayScore,
        worstDayScore,
        bestDay,
        worstDay,
        recoveryTrend,
        avgRecovery,
        trainingCount,
        nutritionLogDays,
        totalDays: 7,
        feelingsThisWeek,
        userGoal: userGoalTitle,
        injuryNotes,
        userContextSummary: roastContextSummary,
        intensity: roastIntensity,
        lastTheme: lastRoastTheme,
      });

      // Store
      const record = await storage.createFitroast({
        userId,
        weekStart,
        weekEnd,
        payloadJson: JSON.stringify(payload),
      });

      console.log(`[FITROAST] Generated and stored for user=${userId} week=${weekEnd}`);
      res.json({ ...payload, cached: false, created_at: record.createdAt });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITROAST] Generate error:', message);
      res.status(500).json({ error: 'Failed to generate FitRoast', details: message });
    }
  });

  // ──── User Context ────
  app.get('/api/context', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const ctx = await storage.getUserContext(userId);

      // Return existing or defaults
      res.json(ctx ?? {
        tier1Goal: 'Holistic balance',
        tier1Priority: 'Balanced with life',
        tier2Phase: 'Maintenance',
        tier2Emphasis: 'General health',
        injuryType: null,
        injuryLocation: null,
        rehabStage: null,
        tier3WeekLoad: 'Normal',
        tier3Stress: 'Medium',
        tier3SleepExpectation: 'Uncertain',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CONTEXT] GET error:', message);
      res.status(500).json({ error: 'Failed to fetch user context' });
    }
  });

  app.post('/api/context', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const body = req.body as Record<string, string | null>;

      // Enforce clearing logic for dependent fields
      const injuryType = body.injuryType ?? null;
      const hasInjury = !!injuryType && injuryType !== 'None';

      // If injury cleared, nullify all injury sub-fields
      const injuryDescription = (hasInjury && injuryType === 'Other') ? (body.injuryDescription ?? null) : null;
      const bodyRegion = hasInjury ? (body.bodyRegion ?? null) : null;
      const injuryLocation = hasInjury ? (body.injuryLocation ?? null) : null;
      const rehabStage = hasInjury ? (body.rehabStage ?? null) : null;

      // If emphasis ≠ Sport-Specific, clear sportSpecific
      const tier2Emphasis = body.tier2Emphasis ?? undefined;
      const sportSpecific = tier2Emphasis === 'Sport-Specific' ? (body.sportSpecific ?? null) : null;

      // Numeric body fields
      const weightKg = body.weightKg != null ? parseFloat(body.weightKg as string) : undefined;
      const heightCm = body.heightCm != null ? parseFloat(body.heightCm as string) : undefined;
      const proteinTargetOverride = body.proteinTarget != null ? parseInt(body.proteinTarget as string, 10) : undefined;
      const calorieTargetOverride = body.calorieTarget != null ? parseInt(body.calorieTarget as string, 10) : undefined;
      const macroTargetOverridden = body.macroTargetOverridden != null
        ? body.macroTargetOverridden === 'true' || (body.macroTargetOverridden as any) === true
        : undefined;

      const data: Record<string, any> = {
        ...(body.tier1Goal !== undefined && { tier1Goal: body.tier1Goal }),
        ...(body.tier1Priority !== undefined && { tier1Priority: body.tier1Priority }),
        ...(body.tier2Phase !== undefined && { tier2Phase: body.tier2Phase }),
        ...(tier2Emphasis !== undefined && { tier2Emphasis }),
        sportSpecific,
        injuryType,
        injuryDescription,
        bodyRegion,
        injuryLocation,
        rehabStage,
        ...(body.tier3WeekLoad !== undefined && { tier3WeekLoad: body.tier3WeekLoad }),
        ...(body.tier3Stress !== undefined && { tier3Stress: body.tier3Stress }),
        ...(body.tier3SleepExpectation !== undefined && { tier3SleepExpectation: body.tier3SleepExpectation }),
        ...(body.workHoursPerWeek !== undefined && { workHoursPerWeek: body.workHoursPerWeek }),
        ...(body.trainingSessionsPerWeek !== undefined && { trainingSessionsPerWeek: body.trainingSessionsPerWeek }),
        ...(weightKg != null && !isNaN(weightKg) && { weightKg }),
        ...(heightCm != null && !isNaN(heightCm) && { heightCm }),
        ...(macroTargetOverridden !== undefined && { macroTargetOverridden }),
        // Manual overrides: store directly and mark as overridden.
        // Skip when macroTargetOverridden is being reset to false — values will be recalculated.
        ...(macroTargetOverridden !== false && proteinTargetOverride != null && !isNaN(proteinTargetOverride) && { proteinTarget: proteinTargetOverride, macroTargetOverridden: true }),
        ...(macroTargetOverridden !== false && calorieTargetOverride != null && !isNaN(calorieTargetOverride) && { calorieTarget: calorieTargetOverride, macroTargetOverridden: true }),
      };

      // Auto-recalculate targets when weight/goal changes and not manually overridden.
      // Also recalculate when macroTargetOverridden is explicitly reset to false.
      let ctx = await storage.upsertUserContext(userId, data);
      const shouldRecalc = ctx.weightKg && (!ctx.macroTargetOverridden || macroTargetOverridden === false);
      if (shouldRecalc) {
        const targets = calculateMacroTargets({
          weightKg: ctx.weightKg!,
          tier1Goal: ctx.tier1Goal,
          tier2DietPhase: ctx.tier2DietPhase,
          trainingSessionsPerWeek: ctx.trainingSessionsPerWeek,
        });
        ctx = await storage.upsertUserContext(userId, targets);
      }
      res.json(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CONTEXT] POST error:', message);
      res.status(500).json({ error: 'Failed to save user context' });
    }
  });

  // User-specific calendar today's events endpoint
  app.get('/api/calendar/today', requireJWTAuth, async (req, res) => {
    try {
      console.log('Fetching today\'s calendar events...');
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
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
  app.get('/api/calendar/events', requireJWTAuth, async (req, res) => {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end date parameters are required' });
      }

      console.log(`Fetching calendar events from ${start} to ${end}...`);
      
      // Get current user ID from session
      const userId = getCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
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
  app.get('/api/calendars', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const calendars = await storage.getUserCalendars(userId);

      // Transform to match mobile app expectations (name instead of calendarName)
      const transformedCalendars = calendars.map(cal => ({
        id: cal.id,
        calendar_url: cal.calendarUrl,
        name: cal.calendarName, // Map calendarName to name
        is_active: cal.isActive
      }));

      res.json(transformedCalendars);
    } catch (error) {
      console.error('Error fetching calendars:', error);
      res.status(500).json({ error: 'Failed to fetch calendars' });
    }
  });

  // Add new calendar
  app.post('/api/calendars', requireJWTAuth, async (req, res) => {
    try {
      const { calendarUrl, calendarName } = req.body;
      const userId = getCurrentUserId(req);
      
      console.log('[CALENDAR] Add request - URL:', calendarUrl, 'Name:', calendarName, 'UserId:', userId);
      
      if (!calendarUrl || !calendarName) {
        console.log('[CALENDAR] Missing required fields');
        return res.status(400).json({ error: 'Calendar URL and name are required' });
      }
      
      if (!userId) {
        console.log('[CALENDAR] User ID not found in JWT');
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Validate the calendar URL format
      if (!calendarUrl.includes('calendar.google.com') && !calendarUrl.includes('.ics')) {
        console.log('[CALENDAR] Invalid URL format');
        return res.status(400).json({ error: 'Please provide a valid Google Calendar ICS URL' });
      }
      
      const calendar = await storage.createUserCalendar({
        userId: userId,
        calendarUrl,
        calendarName,
        isActive: true
      });
      
      console.log('[CALENDAR] Calendar created successfully:', calendar);
      res.json(calendar);
    } catch (error) {
      console.error('Error creating calendar:', error);
      res.status(500).json({ error: 'Failed to create calendar' });
    }
  });

  // Delete calendar
  app.delete('/api/calendars/:id', requireJWTAuth, async (req, res) => {
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
  app.patch('/api/calendars/:id', requireJWTAuth, async (req, res) => {
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

  // Chat summarization endpoints
  console.log('[ROUTE] POST /api/chat/summarize');
  app.post('/api/chat/summarize', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[CHAT SUMMARIZE] Summarizing conversation for user: ${userId}`);

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await chatSummarizationService.summarizeUserConversation(userId);

      res.json({
        message: 'Conversation summarized successfully',
        userId
      });
    } catch (error) {
      console.error('[CHAT SUMMARIZE] Error:', error);
      res.status(500).json({
        error: 'Failed to summarize conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Admin endpoint to trigger summarization for all users (for cron jobs)
  console.log('[ROUTE] POST /api/chat/summarize-all');
  app.post('/api/chat/summarize-all', async (req, res) => {
    try {
      // Optional: Add admin authentication or API key check here
      const authHeader = req.headers.authorization;
      const adminKey = process.env.ADMIN_API_KEY || 'default-admin-key-change-me';

      if (authHeader !== `Bearer ${adminKey}`) {
        return res.status(401).json({ error: 'Unauthorized - admin key required' });
      }

      console.log('[CHAT SUMMARIZE ALL] Starting batch summarization');

      await chatSummarizationService.summarizeAllUsers();

      res.json({
        message: 'Successfully summarized conversations for all active users'
      });
    } catch (error) {
      console.error('[CHAT SUMMARIZE ALL] Error:', error);
      res.status(500).json({
        error: 'Failed to summarize all conversations',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Delete all chat history for user
  console.log('[ROUTE] DELETE /api/chat/history');
  app.delete('/api/chat/history', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      console.log(`[CHAT DELETE] Deleting all chat history for user: ${userId}`);

      // Delete chat history
      await db.delete(chatHistory).where(eq(chatHistory.userId, userId));

      // Delete chat summaries
      await db.delete(chatSummaries).where(eq(chatSummaries.userId, userId));

      console.log(`[CHAT DELETE] Successfully deleted all chat history for user: ${userId}`);
      res.json({ success: true, message: 'All chat history deleted' });
    } catch (error) {
      console.error('[CHAT DELETE] Error:', error);
      res.status(500).json({
        error: 'Failed to delete chat history',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Onboarding routes
  console.log('[ROUTE] Importing onboarding routes');
  const onboardingRoutes = (await import('./routes/onboarding')).default;
  app.use('/api/onboarding', onboardingRoutes);
  console.log('[ROUTE] GET /api/onboarding');
  console.log('[ROUTE] POST /api/onboarding');
  console.log('[ROUTE] GET /api/onboarding/questions');
  console.log('[ROUTE] GET /api/onboarding/status');
  console.log('[ROUTE] POST /api/onboarding/reset');

  // Serve ai-plugin.json for Custom GPT integration
  app.get('/ai-plugin.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const pluginManifest = {
      "schema_version": "v1",
      "name_for_human": "FitScore Health Dashboard",
      "name_for_model": "fitscore_health",
      "description_for_human": "Access your WHOOP fitness data, meal tracking, and calendar integration through a comprehensive health dashboard.",
      "description_for_model": "FitScore Health Dashboard provides access to WHOOP fitness metrics (recovery, sleep, strain, HRV), meal photo uploads, and Google Calendar integration. Use this to retrieve health data, track meals, and manage calendar events for health and productivity insights.",
      "auth": {
        "type": "user_http",
        "authorization_type": "bearer",
        "verification_tokens": {}
      },
      "api": {
        "type": "openapi",
        "url": `${req.protocol}://${req.get('host')}/openapi.yaml`
      },
      "logo_url": `${req.protocol}://${req.get('host')}/generated-icon.png`,
      "contact_email": "support@fitscore.local",
      "legal_info_url": `${req.protocol}://${req.get('host')}`
    };
    res.json(pluginManifest);
  });

  // Serve OpenAPI specification for Custom GPT integration
  app.get('/openapi.yaml', (req, res) => {
    res.setHeader('Content-Type', 'text/yaml');
    res.sendFile(path.join(process.cwd(), 'openapi.yaml'));
  });

  // ========== Improvement Plan Endpoints ==========

  interface PlanHabitDef { id: string; label: string; description?: string; frequency: 'daily'; }
  interface PersonalizedPlanContent {
    title: string;
    triggerLine: string;
    evidence: string[];
    targets: string[];
    rules: string[];
    exitCondition: string;
    planHabits: PlanHabitDef[];
    trainingDirection?: { direction: string; explanation: string };
  }

  const STATIC_PLAN_HABITS: Record<string, PlanHabitDef[]> = {
    nutrition: [
      { id: 'nutrition_gap_le_5h',     label: 'No meal gap > 5h today',     frequency: 'daily' },
      { id: 'nutrition_log_2meals',    label: 'Log ≥2 meals today',          frequency: 'daily' },
      { id: 'nutrition_protein_early', label: 'Protein before 11:00',        frequency: 'daily' },
      { id: 'nutrition_hydration',     label: 'Reach 2L+ water',             frequency: 'daily' },
      { id: 'nutrition_no_junk',       label: 'Avoid junk-only day',         frequency: 'daily' },
    ],
    training: [
      { id: 'training_consistency_session',  label: 'Complete a training session',      frequency: 'daily' },
      { id: 'training_consistency_movement', label: '≥30 min of movement today',        frequency: 'daily' },
      { id: 'training_consistency_warmup',   label: 'Warm up before training',          frequency: 'daily' },
      { id: 'training_consistency_log',      label: 'Log your session in the app',      frequency: 'daily' },
      { id: 'training_consistency_mobility', label: 'Include light mobility or rehab',  frequency: 'daily' },
    ],
    training_consistency: [
      { id: 'training_consistency_session',  label: 'Complete a training session',      frequency: 'daily' },
      { id: 'training_consistency_movement', label: '≥30 min of movement today',        frequency: 'daily' },
      { id: 'training_consistency_warmup',   label: 'Warm up before training',          frequency: 'daily' },
      { id: 'training_consistency_log',      label: 'Log your session in the app',      frequency: 'daily' },
      { id: 'training_consistency_mobility', label: 'Include light mobility or rehab',  frequency: 'daily' },
    ],
    training_load_management: [
      { id: 'training_load_strain_zone',   label: 'Train within recovery strain zone',  frequency: 'daily' },
      { id: 'training_load_low_intensity', label: 'Include one low-intensity session',  frequency: 'daily' },
      { id: 'training_load_pain_check',    label: 'Stop training if pain appears',      frequency: 'daily' },
      { id: 'training_load_cooldown',      label: 'Cooldown after every session',       frequency: 'daily' },
      { id: 'training_load_effort_log',    label: 'Log perceived effort after session', frequency: 'daily' },
    ],
    training_alignment: [
      { id: 'training_align_planned_type', label: 'Follow the planned training type',  frequency: 'daily' },
      { id: 'training_align_main_block',   label: 'Complete the main workout block',   frequency: 'daily' },
      { id: 'training_align_log_focus',    label: 'Log session focus in the app',      frequency: 'daily' },
      { id: 'training_align_warmup',       label: 'Warm up properly before session',   frequency: 'daily' },
      { id: 'training_align_no_skip',      label: 'Avoid skipping main training block', frequency: 'daily' },
    ],
    recovery: [
      { id: 'recovery_sleep_7h',       label: 'Sleep ≥7h tonight',                    frequency: 'daily' },
      { id: 'recovery_bedtime_window', label: 'In bed by your target bedtime',         frequency: 'daily' },
      { id: 'recovery_wake_window',    label: 'Wake within your target wake window',   frequency: 'daily' },
      { id: 'recovery_hydration_2l',   label: 'Drink ≥2L water today',                frequency: 'daily' },
      { id: 'recovery_no_screens',     label: 'No screens 30 min before bed',          frequency: 'daily' },
    ],
  };

  /** Generate personalized plan content from last 7 days of data */
  async function generatePersonalizedPlanContent(userId: string, pillar: string): Promise<PersonalizedPlanContent> {
    const exitConditionMap: Record<string, string> = {
      nutrition: 'Log at least 5 days with an average Nutrition score ≥ 7.0',
      training:  'Log at least 5 days with an average Training score ≥ 7.0',
      recovery:  'Log at least 5 days with an average Recovery score ≥ 7.0',
    };
    const titleMap: Record<string, string> = {
      nutrition: 'Fuel Consistency Plan',
      training:  'Training Consistency Plan',
      recovery:  'Recovery Consistency Plan',
    };

    const fallback = (triggerLine: string): PersonalizedPlanContent => {
      const baseRules: Record<string, string[]> = {
        nutrition: ['No meal gap longer than 5 hours', 'Protein within 2 hours of waking', 'Minimum 2 full meals logged daily', 'Aim for 2L+ hydration', 'Avoid pure junk-food-only days'],
        training:  ['Log every training session — no untracked days', 'Match intensity to your recovery zone', 'Minimum 3 sessions this week', 'Include at least one mobility or recovery session', 'Do not skip sessions on green recovery days'],
        recovery:  ['Sleep ≥7 hours each night', 'Keep a consistent bedtime', 'Keep a consistent wake time', 'Drink ≥2L water every day', 'No screens 30 min before bed'],
      };
      return { title: titleMap[pillar] ?? pillar, triggerLine, evidence: [], targets: [], rules: baseRules[pillar] ?? [], exitCondition: exitConditionMap[pillar] ?? '', planHabits: STATIC_PLAN_HABITS[pillar] ?? [] };
    };

    try {
      // --- Fetch last 7 days of fit_scores for weakness context ---
      const pillarRows = await db.select({ date: fitScores.date, nutritionScore: fitScores.nutritionScore, trainingScore: fitScores.trainingScore, recoveryScore: fitScores.recoveryScore })
        .from(fitScores)
        .where(and(eq(fitScores.userId, userId), sql`nutrition_score IS NOT NULL`))
        .orderBy(desc(fitScores.date)).limit(7);

      if (pillarRows.length < 1) return fallback(`${pillar.charAt(0).toUpperCase() + pillar.slice(1)} has been your lowest pillar this week.`);

      // --- User context for archetype ---
      let archetype: 'athlete' | 'general' = 'general';
      try {
        const [ctx] = await db.select().from(userContext).where(eq(userContext.userId, userId)).limit(1);
        const emph = (ctx?.tier2Emphasis ?? '').toLowerCase();
        const phase = (ctx?.tier2Phase ?? '').toLowerCase();
        if (emph.includes('sport') || emph.includes('compet') || phase.includes('peak') || phase.includes('build')) {
          archetype = 'athlete';
        }
      } catch { /* graceful */ }

      // ---- NUTRITION pillar ----
      if (pillar === 'nutrition') {
        const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dates = pillarRows.map(r => r.date);

        // Count meals per date
        const mealRows = await db.select({ date: mealsTable.date, analysisResult: mealsTable.analysisResult })
          .from(mealsTable).where(and(eq(mealsTable.userId, userId), sql`date >= ${dates[dates.length - 1]}`));

        const mealsByDate: Record<string, number> = {};
        let junkDays = 0;
        let longestGapH = 0;
        const timedMealsByDate: Record<string, string[]> = {};

        for (const m of mealRows) {
          mealsByDate[m.date] = (mealsByDate[m.date] ?? 0) + 1;
          try {
            const p = JSON.parse(m.analysisResult ?? '{}');
            if (p.meal_quality_flags?.isPureJunk) junkDays++;
            if (p.meal_time) {
              if (!timedMealsByDate[m.date]) timedMealsByDate[m.date] = [];
              timedMealsByDate[m.date].push(p.meal_time);
            }
          } catch { /* skip */ }
        }

        // Compute junk days (per day not per meal)
        const junkDaysSet = new Set<string>();
        for (const m of mealRows) {
          try { const p = JSON.parse(m.analysisResult ?? '{}'); if (p.meal_quality_flags?.isPureJunk) junkDaysSet.add(m.date); } catch { /* skip */ }
        }
        const actualJunkDays = junkDaysSet.size;

        // Compute longest gap across all days
        let longestGapDays = 0;
        for (const [, times] of Object.entries(timedMealsByDate)) {
          const sorted = times.sort();
          for (let i = 1; i < sorted.length; i++) {
            const [ph, pm] = sorted[i-1].split(':').map(Number);
            const [ch, cm] = sorted[i].split(':').map(Number);
            const gapH = (ch * 60 + cm - (ph * 60 + pm)) / 60;
            if (gapH > longestGapH) { longestGapH = Math.round(gapH * 10) / 10; longestGapDays = 1; }
            else if (Math.abs(gapH - longestGapH) < 0.5) longestGapDays++;
          }
        }

        const totalDays = dates.length || 1;
        const avgMealsPerDay = Math.round((Object.values(mealsByDate).reduce((a, b) => a + b, 0) / totalDays) * 10) / 10;

        const triggerLine = `Nutrition was your lowest pillar this week${longestGapH >= 5 ? ' — mainly due to long meal gaps' : avgMealsPerDay < 2 ? ' — mainly due to low logging consistency' : ''}.`;

        const evidence: string[] = [];
        if (longestGapH > 0) evidence.push(`Longest meal gap: ${longestGapH}h${longestGapDays > 1 ? ` (${longestGapDays} days)` : ''}`);
        if (avgMealsPerDay > 0) evidence.push(`Meals logged/day: ${avgMealsPerDay} avg`);
        if (actualJunkDays > 0) evidence.push(`Junk-only days: ${actualJunkDays}/7`);

        const targets: string[] = [];
        if (longestGapH >= 5) targets.push(`Keep meal gaps ≤5h (down from ${longestGapH}h)`);
        if (avgMealsPerDay < 2) targets.push(`Log ≥2 meals/day (up from ${avgMealsPerDay})`);
        if (archetype === 'athlete') {
          targets.push('Fuel within 30 min of every session');
        } else {
          targets.push('Protein before 11:00 on 5/7 days');
        }

        const rules = archetype === 'athlete'
          ? ['Fuel within 30 min before and after every session', 'No meal gap longer than 5 hours', 'Log every meal — consistency is data', 'Aim for 2L+ hydration on training days', 'Avoid pure junk-food-only days']
          : ['No meal gap longer than 5 hours', 'Protein within 2 hours of waking', 'Minimum 2 full meals logged daily', 'Aim for 2L+ hydration', 'Avoid pure junk-food-only days'];

        return { title: 'Fuel Consistency Plan', triggerLine, evidence: evidence.slice(0, 3), targets: targets.slice(0, 3), rules, exitCondition: exitConditionMap.nutrition, planHabits: STATIC_PLAN_HABITS.nutrition };
      }

      // ---- TRAINING pillar ----
      if (pillar === 'training') {
        const dates = pillarRows.map(r => r.date);
        const trainingSessions = await db.select({ date: trainingDataTable.date, type: trainingDataTable.type, skipped: trainingDataTable.skipped })
          .from(trainingDataTable).where(and(eq(trainingDataTable.userId, userId), sql`date >= ${dates[dates.length - 1]}`));

        const activeSessions = trainingSessions.filter(s => !s.skipped);
        const sessionDays = new Set(activeSessions.map(s => s.date)).size;
        const skippedCount = trainingSessions.filter(s => s.skipped).length;

        // Count green recovery days with no training
        const greenNoSession = pillarRows.filter(r => {
          const hasSession = activeSessions.some(s => s.date === r.date);
          return (r.recoveryScore ?? 0) >= 7 && !hasSession;
        }).length;

        // Load management signal: trained on low-recovery days (score < 4 out of 10)
        const redDayTraining = pillarRows.filter(r => {
          const hasSession = activeSessions.some(s => s.date === r.date);
          return (r.recoveryScore ?? 10) < 4 && hasSession;
        }).length;

        // Alignment signal: logged session types don't match stated sport/goal
        let alignmentMismatch = false;
        let sportLabel = '';
        if (archetype === 'athlete' && activeSessions.length >= 2) {
          try {
            const [ctx] = await db.select({ sportSpecific: userContext.sportSpecific })
              .from(userContext).where(eq(userContext.userId, userId)).limit(1);
            const sport = ctx?.sportSpecific ?? '';
            if (sport) {
              sportLabel = sport;
              const sportKeyword = sport.toLowerCase().split(/[\s-]+/)[0];
              const matchingTypes = activeSessions.filter(s =>
                (s.type ?? '').toLowerCase().includes(sportKeyword)
              ).length;
              if (matchingTypes / activeSessions.length < 0.25) alignmentMismatch = true;
            }
          } catch { /* graceful */ }
        }

        // ---- Determine plan type ----
        type TrainingPlanType = 'consistency' | 'load_management' | 'alignment';
        let planType: TrainingPlanType = 'consistency';
        const lowRecoveryDays = pillarRows.filter(r => (r.recoveryScore ?? 10) < 5).length;
        if (redDayTraining >= 2 || (sessionDays >= 5 && lowRecoveryDays >= 3)) {
          planType = 'load_management';
        } else if (alignmentMismatch) {
          planType = 'alignment';
        }

        // ---- Today's Training Direction ----
        // Uses the most recent recovery score (0–10 scale from fit_scores) + plan type + sportLabel
        const latestRecovery = pillarRows[0]?.recoveryScore ?? null;
        let tdLabel: string;
        let tdExplanation: string;

        if (planType === 'load_management') {
          if (latestRecovery !== null && latestRecovery >= 7) {
            tdLabel = 'Light Movement';
            tdExplanation = 'Recovery looks good today, but your plan calls for controlled load. Keep intensity moderate and prioritise quality over volume.';
          } else if (latestRecovery !== null && latestRecovery >= 4) {
            tdLabel = 'Recovery Mobility';
            tdExplanation = 'Recovery is moderate today. Focus on movement quality and mobility rather than intensity.';
          } else {
            tdLabel = 'Rest + Mobility';
            tdExplanation = 'Recovery is low today. A rest day with light mobility work is the right call.';
          }
        } else if (planType === 'alignment') {
          if (latestRecovery !== null && latestRecovery < 4) {
            tdLabel = 'Recovery Mobility';
            tdExplanation = 'Recovery is low today. Prioritise rest and return to your main training focus tomorrow.';
          } else if (sportLabel) {
            const sportCap = sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1);
            tdLabel = `${sportCap} Focus`;
            tdExplanation = latestRecovery !== null && latestRecovery >= 7
              ? `Recovery is strong today — a great opportunity to put in quality work in your ${sportLabel} focus.`
              : `Recovery is moderate. Stick to your ${sportLabel} focus with controlled effort.`;
          } else {
            tdLabel = latestRecovery !== null && latestRecovery >= 7 ? 'Strength Focus' : 'Endurance Session';
            tdExplanation = latestRecovery !== null && latestRecovery >= 7
              ? 'Recovery is strong today. Lean into a strength session to align with your training goal.'
              : 'Recovery is moderate. A steady endurance session keeps things on track.';
          }
        } else {
          // Consistency plan
          if (latestRecovery !== null && latestRecovery >= 7) {
            tdLabel = 'Strength Focus';
            tdExplanation = 'Recovery is strong today. A strength-focused session is a great way to build your consistency streak.';
          } else if (latestRecovery !== null && latestRecovery >= 4) {
            tdLabel = 'Endurance Session';
            tdExplanation = 'Recovery is moderate today. A steady endurance session fits well — stay within your limits and get the session done.';
          } else {
            tdLabel = 'Light Movement';
            tdExplanation = 'Recovery is lower today. Light movement still counts — showing up is what matters most for building consistency.';
          }
        }
        const trainingDirection = { direction: tdLabel, explanation: tdExplanation };

        // ---- Load Management Plan ----
        if (planType === 'load_management') {
          const triggerLine = `Training was your lowest pillar this week — you trained hard on low-recovery days.`;
          const evidence: string[] = [`Sessions on low-recovery days: ${redDayTraining}`];
          if (sessionDays > 0) evidence.push(`Total sessions this week: ${sessionDays}`);
          if (lowRecoveryDays > 0) evidence.push(`Low-recovery days this week: ${lowRecoveryDays}`);
          const targets: string[] = [
            'Stay within your recovery strain zone this week',
            'Include at least one low-intensity session',
            redDayTraining > 0 ? 'Avoid training on red recovery days (score < 4)' : 'Match session intensity to your daily recovery score',
          ];
          const rules = [
            'Train within your recovery strain target',
            'Include at least one low-intensity session this week',
            'Stop training if pain or fatigue appears',
            'Always include a cooldown after training',
            'Log perceived effort after each session',
          ];
          return { title: 'Load Management Plan', triggerLine, evidence: evidence.slice(0, 3), targets: targets.slice(0, 3), rules, exitCondition: exitConditionMap.training, planHabits: STATIC_PLAN_HABITS.training_load_management, trainingDirection };
        }

        // ---- Alignment Plan ----
        if (planType === 'alignment') {
          const triggerLine = `Training was your lowest pillar this week — sessions don't match your goal${sportLabel ? ` (${sportLabel})` : ''}.`;
          const evidence: string[] = [`Active sessions this week: ${sessionDays}`];
          if (sportLabel) evidence.push(`Stated sport/focus: ${sportLabel}`);
          evidence.push('Session types logged don\'t align with your stated goal');
          const targets: string[] = [
            sportLabel ? `Include sessions focused on ${sportLabel}` : 'Align sessions with your main training goal',
            'Avoid unrelated training types this week',
            'Log session type with every entry',
          ];
          const rules = [
            'Follow the planned training type each session',
            'Complete the main workout block before accessories',
            'Log the session focus with each entry',
            'Warm up properly before each session',
            'Avoid skipping the main training block',
          ];
          return { title: 'Training Alignment Plan', triggerLine, evidence: evidence.slice(0, 3), targets: targets.slice(0, 3), rules, exitCondition: exitConditionMap.training, planHabits: STATIC_PLAN_HABITS.training_alignment, trainingDirection };
        }

        // ---- Consistency Plan (default) ----
        const triggerLine = `Training was your lowest pillar this week${skippedCount > 0 ? ` — ${skippedCount} session${skippedCount > 1 ? 's' : ''} skipped` : sessionDays < 2 ? ' — low session count' : ''}.`;

        const evidence: string[] = [];
        evidence.push(`Sessions logged in 7 days: ${sessionDays}`);
        if (skippedCount > 0) evidence.push(`Skipped sessions: ${skippedCount}`);
        if (greenNoSession > 0) evidence.push(`Green days with no training: ${greenNoSession}`);

        const targets: string[] = [];
        if (sessionDays < 3) targets.push(`Reach ${archetype === 'athlete' ? 4 : 3} sessions this week (currently ${sessionDays})`);
        if (skippedCount > 0) targets.push('Zero skipped sessions this week');
        if (greenNoSession > 1) targets.push('Train on all green recovery days');
        if (targets.length < 2) targets.push(archetype === 'athlete' ? 'Complete at least one structured session' : 'Include ≥30 minutes of movement per session');

        const rules = archetype === 'athlete'
          ? ['Log every session — no untracked training days', 'Match intensity to your recovery zone', 'Minimum 4 sessions per week', 'Include one dedicated recovery or mobility day', 'Push harder on green days, back off on red']
          : ['Complete a training session today', 'Include ≥30 minutes of movement', 'Warm up before training', 'Log your session in the app', 'Include light mobility or rehab work'];

        return { title: 'Training Consistency Plan', triggerLine, evidence: evidence.slice(0, 3), targets: targets.slice(0, 3), rules, exitCondition: exitConditionMap.training, planHabits: STATIC_PLAN_HABITS.training_consistency, trainingDirection };
      }

      // ---- RECOVERY pillar ----
      {
        const whoopRows = await db.select({ date: whoopDataTable.date, sleepHours: whoopDataTable.sleepHours, recoveryScore: whoopDataTable.recoveryScore })
          .from(whoopDataTable).where(and(eq(whoopDataTable.userId, userId), sql`date >= ${pillarRows[pillarRows.length - 1]?.date ?? ''}`))
          .orderBy(desc(whoopDataTable.date)).limit(7);

        const avgSleep = whoopRows.length > 0
          ? Math.round((whoopRows.reduce((s, r) => s + (r.sleepHours ?? 7), 0) / whoopRows.length) * 10) / 10
          : null;
        const redDays = whoopRows.filter(r => (r.recoveryScore ?? 100) < 34).length;
        const yellowDays = whoopRows.filter(r => { const s = r.recoveryScore ?? 100; return s >= 34 && s < 67; }).length;

        const triggerLine = `Recovery was your lowest pillar this week${redDays > 1 ? ` — ${redDays} red recovery days` : avgSleep !== null && avgSleep < 7 ? ` — avg sleep ${avgSleep}h` : ''}.`;

        const evidence: string[] = [];
        if (avgSleep !== null) evidence.push(`Avg sleep: ${avgSleep}h/night`);
        if (redDays > 0) evidence.push(`Red recovery days: ${redDays}/7`);
        if (yellowDays > 0) evidence.push(`Yellow recovery days: ${yellowDays}/7`);

        const targets: string[] = [];
        if (avgSleep !== null && avgSleep < 7) targets.push(`Increase avg sleep to 7h+ (currently ${avgSleep}h)`);
        if (redDays > 1) targets.push(`Reduce red days to ≤1 this week (currently ${redDays})`);
        targets.push('Consistent bed/wake time within your sleep window');

        // Fetch stored sleep window for personalization
        let sleepBedtime: string | null = null;
        let sleepWakeTime: string | null = null;
        try {
          const [ctx] = await db.select({ sleepBedtime: userContext.sleepBedtime, sleepWakeTime: userContext.sleepWakeTime })
            .from(userContext).where(eq(userContext.userId, userId)).limit(1);
          sleepBedtime = ctx?.sleepBedtime ?? null;
          sleepWakeTime = ctx?.sleepWakeTime ?? null;
        } catch { /* graceful */ }

        const recoveryHabits: PlanHabitDef[] = [
          { id: 'recovery_sleep_7h',       label: 'Sleep ≥7h tonight',                                                                        frequency: 'daily' },
          { id: 'recovery_bedtime_window', label: sleepBedtime  ? `In bed by ${sleepBedtime}`                : 'In bed by your target bedtime',        frequency: 'daily' },
          { id: 'recovery_wake_window',    label: sleepWakeTime ? `Wake by ${sleepWakeTime}`                 : 'Wake within your target wake window',   frequency: 'daily' },
          { id: 'recovery_hydration_2l',   label: 'Drink ≥2L water today',                                                                    frequency: 'daily' },
          { id: 'recovery_no_screens',     label: sleepBedtime  ? `No screens 30 min before ${sleepBedtime}` : 'No screens 30 min before bed',          frequency: 'daily' },
        ];

        const rules = [
          'Sleep ≥7 hours each night',
          sleepBedtime  ? `In bed by ${sleepBedtime} every night`         : 'Keep a consistent bedtime',
          sleepWakeTime ? `Wake by ${sleepWakeTime} every morning`         : 'Keep a consistent wake time',
          'Drink ≥2L water every day',
          sleepBedtime  ? `No screens or stimulants 30 min before ${sleepBedtime}` : 'No screens 30 min before bed',
        ];

        return { title: 'Recovery Consistency Plan', triggerLine, evidence: evidence.slice(0, 3), targets: targets.slice(0, 3), rules, exitCondition: exitConditionMap.recovery, planHabits: recoveryHabits };
      }
    } catch (err) {
      console.error('[PLAN CONTENT] Personalization error, falling back to static:', err);
      return fallback(`${pillar.charAt(0).toUpperCase() + pillar.slice(1)} has been your lowest pillar this week.`);
    }
  }

  /** Compute weakness state from last 7 days of pillar scores */
  async function computePillarWeakness(userId: string, excludePillars?: Set<string>): Promise<{ pillar: string; weaknessCount: number } | null> {
    // Admin bypass: always return a visible pending plan for testing
    const adminWhoopId = process.env.ADMIN_WHOOP_ID || '25283528';
    if (userId === `whoop_${adminWhoopId}`) {
      // Use real data if available, otherwise return a stub so the UI is always visible
      const rows = await db.select({
        nutritionScore: fitScores.nutritionScore,
        trainingScore: fitScores.trainingScore,
        recoveryScore: fitScores.recoveryScore,
      })
        .from(fitScores)
        .where(and(
          eq(fitScores.userId, userId),
          sql`nutrition_score IS NOT NULL AND training_score IS NOT NULL AND recovery_score IS NOT NULL`,
        ))
        .orderBy(desc(fitScores.date))
        .limit(7);

      const counts: Record<string, number> = { nutrition: 0, training: 0, recovery: 0 };
      if (rows.length > 0) {
        for (const row of rows) {
          const n = row.nutritionScore!; const t = row.trainingScore!; const r = row.recoveryScore!;
          const min = Math.min(n, t, r);
          if (n === min) counts.nutrition++;
          else if (t === min) counts.training++;
          else counts.recovery++;
        }
      } else {
        // Stub: spread across all pillars so any non-excluded one is visible
        counts.nutrition = 5; counts.training = 3; counts.recovery = 2;
      }
      // Pick highest-count pillar not already active
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const candidate = sorted.find(([p]) => !excludePillars?.has(p));
      if (!candidate) return null;
      return { pillar: candidate[0], weaknessCount: Math.max(candidate[1], 5) };
    }

    const rows = await db.select({
      nutritionScore: fitScores.nutritionScore,
      trainingScore: fitScores.trainingScore,
      recoveryScore: fitScores.recoveryScore,
    })
      .from(fitScores)
      .where(and(
        eq(fitScores.userId, userId),
        sql`nutrition_score IS NOT NULL AND training_score IS NOT NULL AND recovery_score IS NOT NULL`,
      ))
      .orderBy(desc(fitScores.date))
      .limit(7);

    if (rows.length === 0) return null;

    const counts: Record<string, number> = { nutrition: 0, training: 0, recovery: 0 };
    for (const row of rows) {
      const n = row.nutritionScore!;
      const t = row.trainingScore!;
      const r = row.recoveryScore!;
      const min = Math.min(n, t, r);
      // Tiebreak: nutrition > training > recovery (most commonly culprit first)
      if (n === min) counts.nutrition++;
      else if (t === min) counts.training++;
      else counts.recovery++;
    }

    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (dominant[1] < 3) return null;
    return { pillar: dominant[0], weaknessCount: dominant[1] };
  }

  /** Compute 7-day rolling average for a specific pillar, optionally since a specific date */
  async function computePillarRollingAvg(userId: string, pillar: string, sinceDate?: string): Promise<number | null> {
    const col = pillar === 'nutrition' ? fitScores.nutritionScore
               : pillar === 'training' ? fitScores.trainingScore
               : fitScores.recoveryScore;

    const rows = await db.select({ score: col })
      .from(fitScores)
      .where(and(
        eq(fitScores.userId, userId),
        sql`${col} IS NOT NULL`,
        ...(sinceDate ? [gte(fitScores.date, sinceDate)] : []),
      ))
      .orderBy(desc(fitScores.date))
      .limit(7);

    if (rows.length === 0) return null;
    const avg = rows.reduce((sum, r) => sum + (r.score ?? 0), 0) / rows.length;
    return Math.round(avg * 10) / 10;
  }

  // GET /api/improvement-plan — current plan status
  app.get('/api/improvement-plan', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      // Fetch active plan (single plan per user)
      const single = await storage.getActivePlan(userId);
      const rawActivePlans = single ? [single] : [];

      // Compute stats + auto-complete for each active plan
      const builtActivePlans: Array<{ id: number; pillar: string; activatedAt: Date | string; currentRollingAvg: number | null; daysCount: number }> = [];
      for (const plan of rawActivePlans) {
        if (!plan) continue;
        const col = plan.pillar === 'nutrition' ? fitScores.nutritionScore
                   : plan.pillar === 'training' ? fitScores.trainingScore
                   : fitScores.recoveryScore;

        const activatedDate = plan.activatedAt instanceof Date
          ? plan.activatedAt.toISOString().slice(0, 10)
          : String(plan.activatedAt).slice(0, 10);

        const [daysResult] = await db.select({ count: sql<number>`count(*)` })
          .from(fitScores)
          .where(and(eq(fitScores.userId, userId), sql`${col} IS NOT NULL`, gte(fitScores.date, activatedDate)));
        const daysCount = Math.min(Number(daysResult?.count ?? 0), 7);

        const avg = await computePillarRollingAvg(userId, plan.pillar, activatedDate);
        if (avg !== null && avg >= 7.0 && daysCount >= 5) {
          await storage.completePlan(plan.id, avg);
          console.log(`[IMPROVEMENT PLAN] Auto-completed ${plan.pillar} plan for ${userId}, avg=${avg}, days=${daysCount}`);
        } else if (daysCount >= 7) {
          // Logged 7 days but didn't reach avg ≥ 7.0 — window expired
          await storage.expirePlan(plan.id, avg);
          console.log(`[IMPROVEMENT PLAN] Expired ${plan.pillar} plan for ${userId}, avg=${avg}, days=${daysCount}`);
        } else {
          builtActivePlans.push({ id: plan.id, pillar: plan.pillar, activatedAt: plan.activatedAt, currentRollingAvg: avg, daysCount });
        }
      }

      const completedPlans = await storage.getCompletedPlans(userId);

      const activePillarSet = new Set(builtActivePlans.map(p => p.pillar));
      const allPillars = ['nutrition', 'training', 'recovery'];

      let pendingPlan = null;
      let pendingPlans: Array<{ pillar: string; weaknessCount: number; unlocked: boolean }> = [];

      if (builtActivePlans.length === 0) {
        const weakness = await computePillarWeakness(userId, activePillarSet);
        if (weakness) {
          pendingPlan = { pillar: weakness.pillar, weaknessCount: weakness.weaknessCount, unlocked: weakness.weaknessCount >= 5 };
          pendingPlans = [pendingPlan];
        }
      }

      // activePlan = first plan (backward compat); activePlans = full list for admin
      const activePlan = builtActivePlans[0] ?? undefined;
      res.json({
        activePlan,
        activePlans: builtActivePlans,
        pendingPlan,
        pendingPlans,
        completedPlans: completedPlans.map(p => ({
          id: p.id,
          pillar: p.pillar,
          completedAt: p.completedAt,
          rollingAvgAtCompletion: p.rollingAvgAtCompletion,
          status: p.status, // 'completed' | 'expired'
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[IMPROVEMENT PLAN] GET error:', message);
      res.status(500).json({ error: 'Failed to fetch improvement plan', details: message });
    }
  });

  // POST /api/improvement-plan/activate — activate the unlocked pending plan
  app.post('/api/improvement-plan/activate', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { pillar: requestedPillar, bedtime, wakeTime } = req.body ?? {};

      // Determine which pillar to activate
      let targetPillar: string;
      if (requestedPillar) {
        targetPillar = requestedPillar;
      } else {
        const weakness = await computePillarWeakness(userId);
        if (!weakness || weakness.weaknessCount < 5) {
          return res.status(400).json({ error: 'Plan not yet unlocked (need 5 weakness days)' });
        }
        targetPillar = weakness.pillar;
      }

      // Check if this pillar is already active
      const allActive = await storage.getAllActivePlans(userId);
      const alreadyActive = allActive.some(p => p.pillar === targetPillar);
      if (alreadyActive) {
        return res.status(409).json({ error: `${targetPillar} plan is already active` });
      }
      if (allActive.length > 0) {
        return res.status(409).json({ error: 'A plan is already active' });
      }

      // weakness is no longer needed — use targetPillar directly
      const weakness = { pillar: targetPillar, weaknessCount: 5 };

      // Store sleep window before generating content (so personalization picks it up)
      if (weakness.pillar === 'recovery' && (bedtime || wakeTime)) {
        try {
          await storage.upsertUserContext(userId, {
            ...(bedtime  ? { sleepBedtime: bedtime }   : {}),
            ...(wakeTime ? { sleepWakeTime: wakeTime } : {}),
          });
          console.log(`[IMPROVEMENT PLAN] Stored sleep window for ${userId}: bed=${bedtime}, wake=${wakeTime}`);
        } catch (e) {
          console.error('[IMPROVEMENT PLAN] Failed to store sleep window:', e);
        }
      }

      const plan = await storage.createActivePlan(userId, weakness.pillar);
      console.log(`[IMPROVEMENT PLAN] Activated ${weakness.pillar} plan for ${userId}`);

      // Auto-create plan habits
      try {
        const content = await generatePersonalizedPlanContent(userId, weakness.pillar);
        await storage.savePlanHabits(userId, plan.id, content.planHabits.map(h => ({ habitKey: h.id, label: h.label, description: h.description })));
        console.log(`[IMPROVEMENT PLAN] Saved ${content.planHabits.length} habits for plan ${plan.id}`);
      } catch (e) {
        console.error('[IMPROVEMENT PLAN] Failed to save plan habits:', e);
      }

      res.json({
        id: plan.id,
        pillar: plan.pillar,
        activatedAt: plan.activatedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[IMPROVEMENT PLAN] Activate error:', message);
      res.status(500).json({ error: 'Failed to activate plan', details: message });
    }
  });

  // POST /api/improvement-plan/abandon — delete an active plan (no history recorded)
  app.post('/api/improvement-plan/abandon', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { pillar } = req.body ?? {};
      if (!pillar || !['nutrition', 'training', 'recovery'].includes(pillar)) {
        return res.status(400).json({ error: 'Invalid pillar' });
      }
      await db.delete(improvementPlans)
        .where(and(eq(improvementPlans.userId, userId), eq(improvementPlans.pillar, pillar), eq(improvementPlans.status, 'active')));
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to abandon plan', details: message });
    }
  });

  // POST /api/improvement-plan/dev-complete — admin only, force-completes a plan for animation testing
  app.post('/api/improvement-plan/dev-complete', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Auth required' });
      const adminId = process.env.ADMIN_WHOOP_ID || '25283528';
      if (userId !== `whoop_${adminId}`) return res.status(403).json({ error: 'Admin only' });
      const { pillar } = req.body ?? {};
      if (!pillar) return res.status(400).json({ error: 'pillar required' });
      const active = await storage.getAllActivePlans(userId);
      const plan = active.find((p: any) => p.pillar === pillar);
      if (!plan) return res.status(404).json({ error: `No active ${pillar} plan` });
      await storage.completePlan(plan.id, 8.5);
      res.json({ ok: true, completedPlanId: plan.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to dev-complete plan', details: message });
    }
  });

  // POST /api/improvement-plan/dev-expire — admin only, force-expires a plan for expiry flow testing
  app.post('/api/improvement-plan/dev-expire', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Auth required' });
      const adminId = process.env.ADMIN_WHOOP_ID || '25283528';
      if (userId !== `whoop_${adminId}`) return res.status(403).json({ error: 'Admin only' });
      const { pillar } = req.body ?? {};
      if (!pillar) return res.status(400).json({ error: 'pillar required' });
      const active = await storage.getAllActivePlans(userId);
      const plan = active.find((p: any) => p.pillar === pillar);
      if (!plan) return res.status(404).json({ error: `No active ${pillar} plan` });
      await storage.expirePlan(plan.id, 6.4); // test avg
      res.json({ ok: true, expiredPlanId: plan.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to dev-expire plan', details: message });
    }
  });

  // GET /api/improvement-plan/content?pillar=nutrition — personalized plan content
  app.get('/api/improvement-plan/content', requireJWTAuth, async (req, res) => {
    const { pillar } = req.query;
    if (!pillar || typeof pillar !== 'string' || !['nutrition', 'training', 'recovery'].includes(pillar)) {
      return res.status(400).json({ error: 'Invalid pillar. Use: nutrition | training | recovery' });
    }
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const content = await generatePersonalizedPlanContent(userId, pillar);
      res.json(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to generate plan content', details: message });
    }
  });

  // GET /api/plan-habits/today?date=YYYY-MM-DD — plan habits + check-in state for today
  app.get('/api/plan-habits/today', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { date } = req.query;
      if (!date || typeof date !== 'string') return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

      const activePlan = await storage.getActivePlan(userId);
      if (!activePlan) return res.json({ planHabits: [] });

      let [habits, checkins] = await Promise.all([
        storage.getPlanHabits(activePlan.id),
        storage.getHabitCheckinsByDate(userId, date),
      ]);

      // Re-seed if habits are missing or don't match the expected static set
      // For training plans, accept any of the three plan-type habit sets
      let staticHabitsForReseed = STATIC_PLAN_HABITS[activePlan.pillar] ?? [];
      const currentKeys = new Set(habits.map(h => h.habitKey));
      let needsReseed: boolean;
      if (activePlan.pillar === 'training' && habits.length > 0) {
        // Accept habits from any training plan type — don't overwrite specialised sets
        const allTrainingIds = new Set([
          ...STATIC_PLAN_HABITS.training_consistency.map(h => h.id),
          ...STATIC_PLAN_HABITS.training_load_management.map(h => h.id),
          ...STATIC_PLAN_HABITS.training_alignment.map(h => h.id),
        ]);
        needsReseed = !habits.every(h => allTrainingIds.has(h.habitKey));
      } else {
        needsReseed = staticHabitsForReseed.length > 0 && (habits.length === 0 || !staticHabitsForReseed.every(h => currentKeys.has(h.id)));
      }
      if (needsReseed) {
        // Remove any stale habits and insert the canonical static set
        await db.delete(planHabitsTable).where(eq(planHabitsTable.planId, activePlan.id));
        await storage.savePlanHabits(userId, activePlan.id, staticHabitsForReseed.map(h => ({ habitKey: h.id, label: h.label, description: h.description })));
        habits = await storage.getPlanHabits(activePlan.id);
        // Refresh checkins since habit keys may have changed
        checkins = await storage.getHabitCheckinsByDate(userId, date);
      }

      const checkinMap = new Map(checkins.map(c => [c.habitKey, c.checked]));
      res.json({
        planHabits: habits.map(h => ({
          habit_key: h.habitKey,
          label: h.label,
          description: h.description ?? undefined,
          checked: checkinMap.get(h.habitKey) ?? false,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to fetch plan habits', details: message });
    }
  });

  // POST /api/plan-habits/checkin — toggle a plan habit check-in
  app.post('/api/plan-habits/checkin', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { date, habit_key, checked } = req.body;
      if (!date || !habit_key || typeof checked !== 'boolean') {
        return res.status(400).json({ error: 'date, habit_key, and checked (boolean) are required' });
      }
      await storage.upsertHabitCheckin(userId, habit_key, date, checked);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'Failed to save habit check-in', details: message });
    }
  });

  // POST /api/improvement-plan/meal-plan — FitCook meal plan generator
  app.post('/api/improvement-plan/meal-plan', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { times, preferences, allergies, previousPlan } = req.body;

      // Get active nutrition plan + its habits
      const activePlan = await storage.getActivePlan(userId);
      if (!activePlan) return res.status(400).json({ error: 'No active improvement plan' });

      let habits = await storage.getPlanHabits(activePlan.id);
      // Auto-seed if plan was activated before habits were persisted
      if (habits.length === 0) {
        const staticHabits = STATIC_PLAN_HABITS[activePlan.pillar] ?? [];
        if (staticHabits.length > 0) {
          await storage.savePlanHabits(userId, activePlan.id, staticHabits.map(h => ({ habitKey: h.id, label: h.label, description: h.description })));
          habits = await storage.getPlanHabits(activePlan.id);
        }
      }
      const planHabits = habits.map(h => h.label);

      // Get user context for personalization
      const ctx = await storage.getUserContext(userId).catch(() => undefined);

      const mealPlan = await openAIService.generateFitCookMealPlan({
        planHabits,
        times: times || undefined,
        preferences: preferences || undefined,
        allergies: allergies || undefined,
        previousPlan: previousPlan || undefined,
        proteinTarget: ctx?.proteinTarget ?? undefined,
        calorieTarget: ctx?.calorieTarget ?? undefined,
        userContext: ctx ? {
          dietPhase: ctx.tier2DietPhase,
          trainingPhase: ctx.tier2Phase,
          tier1Goal: ctx.tier1Goal,
          workHours: ctx.workHoursPerWeek || undefined,
          trainingSessions: ctx.trainingSessionsPerWeek || undefined,
        } : undefined,
      });

      res.json({ mealPlan });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITCOOK] Meal plan error:', message);
      res.status(500).json({ error: 'Failed to generate meal plan', details: message });
    }
  });

  // POST /api/improvement-plan/meal-plan/single — regenerate one meal slot
  app.post('/api/improvement-plan/meal-plan/single', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { mealType, existingMeal, timing, preferences, allergies } = req.body;
      if (!mealType || !['Breakfast', 'Lunch', 'Snack', 'Dinner'].includes(mealType)) {
        return res.status(400).json({ error: 'mealType must be Breakfast, Lunch, Snack, or Dinner' });
      }

      const ctx = await storage.getUserContext(userId).catch(() => undefined);

      const meal = await openAIService.generateSingleFitCookMeal({
        mealType,
        existingMeal: existingMeal || '',
        timing: timing || '12:00',
        preferences: preferences || undefined,
        allergies: allergies || undefined,
        proteinTarget: ctx?.proteinTarget ?? undefined,
      });

      res.json({ meal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITCOOK SINGLE] error:', message);
      res.status(500).json({ error: 'Failed to regenerate meal', details: message });
    }
  });

  // POST /api/improvement-plan/meal-plan/groceries — generate grocery list from current meals
  app.post('/api/improvement-plan/meal-plan/groceries', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { meals } = req.body;
      if (!Array.isArray(meals) || meals.length === 0) {
        return res.status(400).json({ error: 'meals array required' });
      }

      const groceries = await openAIService.generateGroceriesFromMeals(meals);
      res.json({ groceries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[FITCOOK GROCERIES] error:', message);
      res.status(500).json({ error: 'Failed to generate grocery list', details: message });
    }
  });

  // POST /api/improvement-plan/routines — generate a morning or wind-down recovery routine
  app.post('/api/improvement-plan/routines', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { type, bedtime, wakeTime, variant } = req.body ?? {};
      if (!type || !['morning', 'winddown'].includes(type)) {
        return res.status(400).json({ error: 'type must be "morning" or "winddown"' });
      }
      if (!bedtime || !wakeTime) {
        return res.status(400).json({ error: 'bedtime and wakeTime are required' });
      }

      const routine = await openAIService.generateRecoveryRoutine({ type, bedtime, wakeTime, variant });
      res.json({ routine });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[RECOVERY ROUTINES] error:', message);
      res.status(500).json({ error: 'Failed to generate routine', details: message });
    }
  });

  // POST /api/improvement-plan/training-session — generate a single training session
  app.post('/api/improvement-plan/training-session', requireJWTAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { goal, direction, variant } = req.body ?? {};
      const validGoals = ['Upper body strength', 'Lower body strength', 'Upper body explosiveness', 'Lower body explosiveness', 'Endurance', 'Core / mobility', 'Recovery / Light Movement'];
      if (!goal || !validGoals.includes(goal)) {
        return res.status(400).json({ error: `goal must be one of: ${validGoals.join(', ')}` });
      }

      // Pull user context for personalisation (injury, experience, sport)
      const ctx = await storage.getUserContext(userId).catch(() => undefined);
      let injuryContext: string | undefined;
      if (ctx?.injuryType) {
        const parts = [ctx.injuryType];
        if (ctx.bodyRegion) parts.push(ctx.bodyRegion);
        if (ctx.rehabStage) parts.push(`rehab: ${ctx.rehabStage}`);
        injuryContext = parts.join(', ');
      }

      const session = await openAIService.generateTrainingSession({
        goal,
        direction: direction || undefined,
        variant: variant || 'A',
        injuryContext,
        sessionsPerWeek: ctx?.trainingSessionsPerWeek || undefined,
        sportSpecific: ctx?.sportSpecific || undefined,
        tier2Phase: ctx?.tier2Phase || undefined,
      });

      res.json({ session });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TRAINING SESSION] error:', message);
      res.status(500).json({ error: 'Failed to generate training session', details: message });
    }
  });

  // Static file serving
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}
