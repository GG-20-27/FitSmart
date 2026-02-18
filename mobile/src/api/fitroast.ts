/**
 * FitRoast API — Weekly roast
 */

import { apiRequest } from './client';

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
  needs_generate?: boolean;
}

/** Fetch this week's FitRoast (returns 404 with needs_generate=true if not yet created) */
export async function getFitRoastCurrent(): Promise<FitRoastResponse> {
  return apiRequest<FitRoastResponse>('/api/fitroast/current');
}

/** Generate (or regenerate) this week's FitRoast */
export async function generateFitRoast(): Promise<FitRoastResponse> {
  return apiRequest<FitRoastResponse>('/api/fitroast/generate', {
    method: 'POST',
  });
}
