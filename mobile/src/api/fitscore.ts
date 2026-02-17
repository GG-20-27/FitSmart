/**
 * FitScore API - Meals and Training Data
 */

import { apiRequest, API_BASE_URL, getAuthToken } from './client';

export interface MealData {
  id: number;
  mealType: string;
  mealNotes?: string;
  imageUri: string;
  date: string;
  uploadedAt: string;
  nutritionScore?: number;
  analysis?: string;
}

export interface TrainingDataEntry {
  id: number;
  userId: string;
  date: string;
  type: string;
  duration: number;
  goal?: string;
  intensity?: string;
  comment?: string;
  skipped: boolean;
  createdAt: string;
  score?: number;
  analysis?: string;
  breakdown?: TrainingAnalysisBreakdown;
  recoveryZone?: 'green' | 'yellow' | 'red';
}

export interface UploadMealResponse {
  message: string;
  meal: MealData;
}

export interface SaveTrainingResponse {
  message: string;
  training: TrainingDataEntry;
}

export interface TrainingAnalysisBreakdown {
  strainAppropriatenessScore: number;
  sessionQualityScore: number;
  goalAlignmentScore: number;
  injurySafetyModifier: number;
}

export interface AnalyzedTrainingSession {
  sessionId: number;
  type: string;
  duration: number;
  intensity?: string;
  goal?: string;
  comment?: string;
  skipped: boolean;
  score: number;
  breakdown: TrainingAnalysisBreakdown;
  analysis: string;
  recoveryZone: 'green' | 'yellow' | 'red';
}

export interface TrainingAnalysisResponse {
  date: string;
  sessions: AnalyzedTrainingSession[];
  averageScore: number;
  whoopData: {
    recoveryScore?: number;
    strainScore?: number;
    sleepScore?: number;
    hrv?: number;
  };
  userGoal?: string;
}

// FitScore Calculation Types
export interface RecoveryBreakdown {
  recoveryScaled: number;
  sleepQuality: number;
  hrvScaled: number;
}

export interface FitScoreBreakdown {
  recovery: {
    score: number;
    zone: 'green' | 'yellow' | 'red';
    details: RecoveryBreakdown;
    analysis: string;
  };
  training: {
    score: number;
    zone: 'green' | 'yellow' | 'red';
    sessionsCount: number;
  };
  nutrition: {
    score: number;
    zone: 'green' | 'yellow' | 'red';
    mealsCount: number;
    mealScores: number[];
  };
}

export interface FitScoreResponse {
  date: string;
  fitScore: number;
  fitScoreZone: 'green' | 'yellow' | 'red';
  breakdown: FitScoreBreakdown;
  whoopData: {
    recoveryScore?: number;
    strainScore?: number;
    sleepScore?: number;
    sleepHours?: number;
    hrv?: number;
    hrvBaseline?: number;
  };
  yesterdayData?: {
    recoveryScore?: number | null;
    sleepScore?: number | null;
    sleepHours?: number | null;
    hrv?: number | null;
  };
  allGreen: boolean;
  timestamp: string;
}

/**
 * Upload a meal with image, type, and optional notes
 */
export async function uploadMeal(params: {
  imageUri: string;
  mealType: string;
  mealNotes?: string;
  date?: string;
  mealTime?: string; // HH:MM format
}): Promise<MealData> {
  const { imageUri, mealType, mealNotes, date, mealTime } = params;

  // Create form data for multipart upload
  const formData = new FormData();

  // Handle the image file
  const uriParts = imageUri.split('.');
  const fileType = uriParts[uriParts.length - 1];

  // React Native FormData file format
  const file = {
    uri: imageUri,
    name: `meal_${Date.now()}.${fileType}`,
    type: `image/${fileType}`,
  };

  // @ts-ignore - React Native FormData accepts this format
  formData.append('mealPhoto', file);

  formData.append('mealType', mealType);
  if (mealNotes) {
    formData.append('mealNotes', mealNotes);
  }
  if (date) {
    formData.append('date', date);
  }
  if (mealTime) {
    formData.append('mealTime', mealTime);
  }

  // Get auth token
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/api/meals`;

  console.log(`[API] Uploading meal to: ${url}`);
  console.log(`[API] Meal type: ${mealType}`);
  console.log(`[API] Has notes: ${!!mealNotes}`);
  console.log(`[API] Date: ${date}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  console.log(`[API] Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[API] Error response: ${errorText}`);
    throw new Error(`Failed to upload meal: ${response.status} ${errorText}`);
  }

  const result: UploadMealResponse = await response.json();
  console.log('[API] Meal uploaded successfully');

  return result.meal;
}

/**
 * Get meals for a specific date
 */
export async function getMealsByDate(date: string): Promise<MealData[]> {
  return apiRequest<MealData[]>(`/api/meals/date/${date}`);
}

/**
 * Save training data
 */
export async function saveTrainingData(params: {
  date: string;
  type: string;
  duration: number;
  goal?: string;
  intensity?: string;
  comment?: string;
  skipped?: boolean;
}): Promise<TrainingDataEntry> {
  const response = await apiRequest<SaveTrainingResponse>('/api/training', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  return response.training;
}

/**
 * Get training data for a specific date
 */
export async function getTrainingDataByDate(date: string): Promise<TrainingDataEntry[]> {
  return apiRequest<TrainingDataEntry[]>(`/api/training/date/${date}`);
}

/**
 * Update training data
 */
export async function updateTrainingData(
  id: number,
  params: {
    type?: string;
    duration?: number;
    goal?: string;
    intensity?: string;
    comment?: string;
    skipped?: boolean;
  }
): Promise<TrainingDataEntry> {
  const response = await apiRequest<SaveTrainingResponse>(`/api/training/${id}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });

  return response.training;
}

/**
 * Delete training data
 */
export async function deleteTrainingData(id: number): Promise<void> {
  await apiRequest(`/api/training/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Analyze training sessions for a specific date
 * Returns training scores with breakdown and analysis
 */
export async function analyzeTraining(date: string): Promise<TrainingAnalysisResponse> {
  console.log(`[API] Analyzing training for date: ${date}`);

  const response = await apiRequest<TrainingAnalysisResponse>(
    `/api/training/analyze/${date}`,
    {
      method: 'POST',
    }
  );

  console.log(`[API] Training analysis complete: average score ${response.averageScore}/10`);
  return response;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate FitScore for a specific date
 * Combines Recovery, Training, and Nutrition scores
 */
export async function calculateFitScore(date?: string): Promise<FitScoreResponse> {
  console.log(`[API] Calculating FitScore for date: ${date || 'today'}`);

  const response = await apiRequest<FitScoreResponse>(
    '/api/fitscore/calculate',
    {
      method: 'POST',
      body: JSON.stringify({ date }),
    }
  );

  console.log(`[API] FitScore calculated: ${response.fitScore}/10`);
  return response;
}

// Coach Summary Types
export interface CoachSlide {
  title: string;
  chips: string[];
  content: string;
  coach_call: string;
  context_strip?: string; // slide 1 only
}

export interface CoachSummaryResponse {
  preview: string;
  slides: CoachSlide[];
  fitCoachTake: string;
  tomorrowsOutlook: string;
  timestamp: string;
}

/**
 * Get FitCoach daily summary
 * Returns warm, supportive summary without raw numbers
 */
export async function getCoachSummary(params: {
  fitScore: number;
  recoveryZone: 'green' | 'yellow' | 'red';
  trainingZone: 'green' | 'yellow' | 'red';
  nutritionZone: 'green' | 'yellow' | 'red';
  fitScoreZone: 'green' | 'yellow' | 'red';
  hadTraining: boolean;
  hadMeals: boolean;
  mealsCount?: number;
  sessionsCount?: number;
  recoveryScore?: number;
  sleepScore?: number;
  sleepHours?: number;
  hrv?: number;
  hrvBaseline?: number;
  strainScore?: number;
  recoveryBreakdownScore?: number;
  trainingBreakdownScore?: number;
  nutritionBreakdownScore?: number;
}): Promise<CoachSummaryResponse> {
  console.log(`[API] Getting coach summary`);

  const response = await apiRequest<CoachSummaryResponse>(
    '/api/fitscore/coach-summary',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );

  console.log(`[API] Coach summary received`);
  return response;
}
