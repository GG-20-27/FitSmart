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
  analysisResult?: string;
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
}

export interface UploadMealResponse {
  message: string;
  meal: MealData;
}

export interface SaveTrainingResponse {
  message: string;
  training: TrainingDataEntry;
}

/**
 * Upload a meal with image, type, and optional notes
 */
export async function uploadMeal(params: {
  imageUri: string;
  mealType: string;
  mealNotes?: string;
  date?: string;
}): Promise<MealData> {
  const { imageUri, mealType, mealNotes, date } = params;

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
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
