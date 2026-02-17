/**
 * FitLook API - Morning Outlook + Daily Check-in
 */

import { apiRequest } from './client';

// ──── Check-in ────

export type Feeling = 'energized' | 'steady' | 'tired' | 'stressed';

export interface CheckinResponse {
  feeling?: Feeling;
  date_local?: string;
  exists: boolean;
}

/** Fetch today's check-in (if exists) */
export async function getCheckinToday(): Promise<CheckinResponse> {
  return apiRequest<CheckinResponse>('/api/checkin/today');
}

/** Save today's check-in feeling */
export async function saveCheckin(feeling: Feeling): Promise<CheckinResponse> {
  return apiRequest<CheckinResponse>('/api/checkin/today', {
    method: 'POST',
    body: JSON.stringify({ feeling }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ──── FitLook ────

export interface FitLookSlide {
  title: string;
  chips: string[];
  body: string;
  focus_line: string;
}

export interface FitLookResponse {
  date_local: string;
  feeling: string;
  slides: FitLookSlide[];
  cached: boolean;
  created_at: string;
  needs_checkin?: boolean;
}

/** Fetch today's FitLook (auto-generates if cached or check-in exists) */
export async function getFitLookToday(): Promise<FitLookResponse> {
  console.log('[API] Fetching FitLook for today');
  const response = await apiRequest<FitLookResponse>('/api/fitlook/today');
  console.log(`[API] FitLook received, cached=${response.cached}, slides=${response.slides?.length}`);
  return response;
}

/** Force-regenerate today's FitLook */
export async function regenerateFitLook(): Promise<FitLookResponse> {
  console.log('[API] Force-regenerating FitLook');
  return apiRequest<FitLookResponse>('/api/fitlook/generate', {
    method: 'POST',
  });
}
