/**
 * FitRoast API — Weekly roast
 */

import { apiRequest, API_BASE_URL, getAuthToken } from './client';

export interface FitRoastSegment {
  topic: string;
  text: string;
}

export interface FitRoastResponse {
  week_start: string;
  week_end: string;
  headline: string;
  segments: FitRoastSegment[];
  cached: boolean;
  created_at: string;
}

export interface FitRoastEligibilityError extends Error {
  status: number;
  needs_generate: boolean;
  eligible: boolean;
  is_sunday: boolean;
  active_days: number;
  week_start: string;
  week_end: string;
}

/**
 * Fetch this week's FitRoast.
 * On 404 the server returns eligibility data — we attach it to the thrown error
 * so the screen can show the right lock/empty state without a second request.
 */
export async function getFitRoastCurrent(): Promise<FitRoastResponse> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/api/fitroast/current`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.error || 'No roast for this week') as FitRoastEligibilityError;
    err.status = response.status;
    err.needs_generate = data.needs_generate ?? false;
    err.eligible = data.eligible ?? false;
    err.is_sunday = data.is_sunday ?? false;
    err.active_days = data.active_days ?? 0;
    err.week_start = data.week_start ?? '';
    err.week_end = data.week_end ?? '';
    throw err;
  }

  return data as FitRoastResponse;
}

/** Generate (or regenerate) this week's FitRoast — only succeeds on Sunday with ≥5 active days */
export async function generateFitRoast(intensity?: 'Light' | 'Spicy' | 'Savage'): Promise<FitRoastResponse> {
  return apiRequest<FitRoastResponse>('/api/fitroast/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intensity }),
  });
}
