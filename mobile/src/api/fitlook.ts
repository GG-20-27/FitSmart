/**
 * FitLook API - Morning Outlook
 */

import { apiRequest } from './client';

export interface FitLookPayload {
  date_local: string;
  hero_text: string;
  readiness_tag: 'Green' | 'Yellow' | 'Red';
  readiness_line: string;
  todays_focus: string;
  momentum_line: string;
  cta_primary: string;
  cta_secondary: string;
}

export interface FitLookResponse extends FitLookPayload {
  cached: boolean;
  created_at: string;
}

/**
 * Fetch today's FitLook (auto-generates if not cached)
 */
export async function getFitLookToday(): Promise<FitLookResponse> {
  console.log('[API] Fetching FitLook for today');
  const response = await apiRequest<FitLookResponse>('/api/fitlook/today');
  console.log(`[API] FitLook received, cached=${response.cached}, tag=${response.readiness_tag}`);
  return response;
}

/**
 * Force-regenerate today's FitLook
 */
export async function regenerateFitLook(): Promise<FitLookResponse> {
  console.log('[API] Force-regenerating FitLook');
  const response = await apiRequest<FitLookResponse>('/api/fitlook/generate', {
    method: 'POST',
  });
  return response;
}
