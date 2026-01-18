import axios, { AxiosError } from 'axios';
import { whoopTokenStorage } from './whoopTokenStorage';

const BASE = 'https://api.prod.whoop.com/developer/v2';
const WHOOP_OAUTH_BASE = 'https://api.prod.whoop.com/oauth';

// Error types for better error handling
export enum WhoopErrorType {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  API_ERROR = 'API_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface WhoopError {
  type: WhoopErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  details?: any;
}

class WhoopApiError extends Error {
  public readonly type: WhoopErrorType;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: any;

  constructor(error: WhoopError) {
    super(error.message);
    this.name = 'WhoopApiError';
    this.type = error.type;
    this.statusCode = error.statusCode;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}

export interface WhoopRecoveryData {
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage: number;
  skin_temp_celsius: number;
}

export interface WhoopSleepData {
  sleep_score: number;
  stage_summary: {
    total_in_bed_time_milli: number;
    total_awake_time_milli: number;
    total_no_data_time_milli: number;
    total_light_sleep_time_milli: number;
    total_slow_wave_sleep_time_milli: number;
    total_rem_sleep_time_milli: number;
  };
}

export interface WhoopStrainData {
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}

export interface WhoopTodayData {
  cycle_id?: string;
  strain?: number;
  recovery_score?: number;
  sleep_score?: number;
  sleep_hours?: number;
  sleepHours?: number; // temporary camelCase alias for frontend compatibility
  sleep_stages?: {
    light_sleep_minutes?: number;
    deep_sleep_minutes?: number;
    rem_sleep_minutes?: number;
    awake_minutes?: number;
  } | null;
  time_in_bed_hours?: number | null;
  sleep_efficiency_pct?: number | null;
  hrv?: number;
  resting_heart_rate?: number;
  average_heart_rate?: number;
  stress_score?: number;
  skin_temperature?: number;
  spo2_percentage?: number;
  respiratory_rate?: number;
  calories_burned?: number;
  activity_log?: any[];
  raw_data?: any;
  raw?: {
    cycle?: any;
    recovery?: any;
    sleep?: any;
    workout?: any;
    body_measurements?: any;
  };
  error?: {
    type: string;
    message: string;
    retryable: boolean;
  };
}

export class WhoopApiService {
  private async authHeader(userId: string) {
    if (!userId) {
      throw new Error('User ID is required for authentication');
    }
    const tokenData = await this.getValidWhoopToken(userId);
    return { Authorization: `Bearer ${tokenData.access_token}` };
  }

  private async refreshToken(refreshToken: string, userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required for token refresh');
    }
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP client credentials');
    }

    console.log('[TOKEN REFRESH] Starting WHOOP token refresh...');

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'offline'
      });

      const response = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = expires_in ? Date.now() + (expires_in * 1000) : undefined;

      console.log('[TOKEN REFRESH] Token refreshed successfully, expires in:', expires_in, 'seconds');

      return {
        access_token,
        refresh_token: refresh_token || refreshToken,
        expires_at: expiresAt ? Math.floor(expiresAt / 1000) : undefined,
        user_id: userId
      };
    } catch (error: any) {
      console.error('[TOKEN REFRESH] Token refresh failed:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // New function to ensure we always have a valid token
  async getValidWhoopToken(userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get WHOOP token');
    }
    
    let tokenData = await whoopTokenStorage.getToken(userId);
    
    if (!tokenData?.access_token) {
      console.log('[TOKEN VALIDATION] No WHOOP access token found for user:', userId);
      throw new WhoopApiError({
        type: WhoopErrorType.AUTHENTICATION_ERROR,
        message: 'Missing WHOOP access token',
        retryable: false
      });
    }

    // Check if token is expired or expiring soon (within 10 minutes) and needs refresh
    const currentTime = Math.floor(Date.now() / 1000);
    const refreshBufferSeconds = 10 * 60; // Refresh 10 minutes before expiration

    const expiresAtSeconds = typeof tokenData.expires_at === 'number'
      ? tokenData.expires_at
      : tokenData.expires_at instanceof Date
        ? Math.floor(tokenData.expires_at.getTime() / 1000)
        : null;

    // Check if token is expired or will expire within the buffer time
    const needsRefresh = expiresAtSeconds && expiresAtSeconds < (currentTime + refreshBufferSeconds);

    if (needsRefresh) {
      const isAlreadyExpired = expiresAtSeconds < currentTime;
      const timeUntilExpiry = expiresAtSeconds ? expiresAtSeconds - currentTime : 0;

      if (isAlreadyExpired) {
        console.log('[TOKEN VALIDATION] Token expired for user:', userId, 'expired at:', new Date(expiresAtSeconds * 1000));
      } else {
        console.log(`[TOKEN VALIDATION] Token expiring soon for user: ${userId} (${Math.floor(timeUntilExpiry / 60)} minutes remaining)`);
      }

      if (!tokenData.refresh_token) {
        console.log('[TOKEN VALIDATION] No refresh token available for user:', userId);
        throw new WhoopApiError({
          type: WhoopErrorType.AUTHENTICATION_ERROR,
          message: 'WHOOP access token expired and no refresh token available',
          retryable: false
        });
      }

      try {
        console.log('[TOKEN VALIDATION] Refreshing token for user:', userId);
        const refreshedTokenData = await this.refreshToken(tokenData.refresh_token, userId);

        // Store the refreshed token
        await whoopTokenStorage.setToken(userId, refreshedTokenData);
        console.log('[TOKEN VALIDATION] Token refreshed and stored for user:', userId);

        return refreshedTokenData;
      } catch (refreshError: any) {
        console.error('[TOKEN VALIDATION] Token refresh failed for user:', userId, refreshError.message);

        // If refresh failed but token is still technically valid, continue with existing token
        if (!isAlreadyExpired) {
          console.log('[TOKEN VALIDATION] Refresh failed but token still valid, continuing with existing token');
          return tokenData;
        }

        throw new WhoopApiError({
          type: WhoopErrorType.AUTHENTICATION_ERROR,
          message: 'Failed to refresh expired WHOOP token',
          retryable: false
        });
      }
    }

    console.log('[TOKEN VALIDATION] Using valid existing token for user:', userId);
    return tokenData;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP client credentials');
    }

    const { redirectUri } = this.resolveRedirectUri();
    console.log('[WHOOP AUTH] Using redirect URI for token exchange:', redirectUri);

    console.log('Starting WHOOP token exchange...');

    const requestData = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    };

    try {
      const formBody = Object.entries(requestData)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

      const response = await fetch(`${WHOOP_OAUTH_BASE}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'FitScore-GPT-API/1.0'
        },
        body: formBody
      });

      const responseText = await response.text();
      console.log('[WHOOP OAUTH] Response status:', response.status);
      console.log('[WHOOP OAUTH] Raw response body:', responseText);
      console.log('[WHOOP OAUTH] Request data sent:', JSON.stringify(requestData, null, 2));

      if (!response.ok) {
        // Parse error response for detailed debugging
        let errorDetails = responseText;
        try {
          const errorData = JSON.parse(responseText);
          errorDetails = JSON.stringify(errorData, null, 2);
          console.error('[WHOOP OAUTH] Detailed error response:', errorData);
        } catch (parseError) {
          console.error('[WHOOP OAUTH] Could not parse error response as JSON');
        }
        
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      const data = JSON.parse(responseText);
      console.log('WHOOP token exchange successful');
      return data;
    } catch (error: any) {
      console.error('WHOOP token exchange failed:', error.message);
      throw new Error(`Failed to exchange code for access token: ${error.message}`);
    }
  }

  async getUserProfile(accessToken: string): Promise<any> {
    try {
      console.log('[WHOOP API] Fetching user profile...');
      
      const response = await fetch(`${BASE}/user/profile/basic`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'FitScore-GPT-API/1.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const profileData = await response.json();
      console.log('[WHOOP API] User profile retrieved successfully:', profileData);
      return profileData;
    } catch (error: any) {
      console.error('[WHOOP API] Failed to fetch user profile:', error.message);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }
  }

  async getLatestCycle(userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get latest cycle');
    }
    try {
      const headers = await this.authHeader(userId);
      console.log('Fetching latest cycle from WHOOP API...');
      
      const response = await axios.get(`${BASE}/cycle?limit=1`, { headers });
      
      if (response.status === 200 && response.data.records && response.data.records.length > 0) {
        console.log('Latest cycle found:', response.data.records[0].id);
        return response.data.records[0];
      } else {
        console.log('No cycles found in response');
        return null;
      }
    } catch (error: any) {
      console.error('Failed to fetch latest cycle:', error.response?.status, error.response?.data);
      if (error.response?.status === 404) {
        console.log('Cycle endpoint returned 404 - no cycles available');
        return null;
      }
      throw error;
    }
  }

  async getRecovery(cycleId: string, userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get recovery data');
    }
    try {
      const headers = await this.authHeader(userId);
      console.log(`Fetching recovery for cycle ${cycleId}...`);

      // Use WHOOP API v2 endpoint to get recovery for specific cycle
      const response = await axios.get(`${BASE}/cycle/${cycleId}/recovery`, { headers });

      if (response.status === 200 && response.data) {
        console.log('Recovery data found:', JSON.stringify(response.data.score, null, 2));
        return response.data;
      }
      console.log('No recovery data found');
      return null;
    } catch (error: any) {
      console.error(`Failed to fetch recovery:`, error.response?.status, error.response?.data);
      if (error.response?.status === 404) {
        console.log(`No recovery data available for cycle ${cycleId}`);
        return null;
      }
      throw error;
    }
  }

  async getSleep(cycleId: string, userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get sleep data');
    }
    try {
      const headers = await this.authHeader(userId);
      console.log(`Fetching sleep for cycle ${cycleId}...`);
      
      const response = await axios.get(`${BASE}/activity/sleep/${cycleId}`, { headers });
      
      if (response.status === 200) {
        console.log('Sleep data found for cycle:', cycleId);
        console.log('Sleep data structure:', JSON.stringify(response.data, null, 2));
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error(`Failed to fetch sleep for cycle ${cycleId}:`, error.response?.status, error.response?.data);
      if (error.response?.status === 404) {
        console.log(`No sleep data available for cycle ${cycleId}, trying previous cycle...`);
        
        // Try to get previous cycle's sleep data
        try {
          const headers = await this.authHeader(userId);
          const cycleResponse = await axios.get(`${BASE}/cycle?limit=10`, { headers });
          
          if (cycleResponse.data.records && cycleResponse.data.records.length > 0) {
            // Find the current cycle index and get the previous one
            const cycles = cycleResponse.data.records;
            const currentCycleIndex = cycles.findIndex((cycle: any) => cycle.id === cycleId);
            
            if (currentCycleIndex !== -1 && currentCycleIndex < cycles.length - 1) {
              const previousCycleId = cycles[currentCycleIndex + 1].id;
              console.log(`Trying to fetch sleep data from previous cycle: ${previousCycleId}`);
              
              const previousSleepResponse = await axios.get(`${BASE}/activity/sleep/${previousCycleId}`, { headers });
              
              if (previousSleepResponse.status === 200) {
                console.log('Sleep data found in previous cycle:', previousCycleId);
                console.log('Previous cycle sleep data structure:', JSON.stringify(previousSleepResponse.data, null, 2));
                return previousSleepResponse.data;
              }
            }
          }
        } catch (previousError: any) {
          console.log(`Could not fetch sleep data from previous cycle:`, previousError.response?.status);
        }
        
        return null;
      }
      throw error;
    }
  }

  async getLatestSleepData(userId: string): Promise<{ sleep_score: number | null; cycleDate: string | null }> {
    if (!userId) {
      throw new Error('User ID is required to get latest sleep data');
    }
    try {
      const headers = await this.authHeader(userId);
      const response = await axios.get(`${BASE}/cycle?limit=3`, { headers });
      
      if (!response.data.records || response.data.records.length === 0) {
        return { sleep_score: null, cycleDate: null };
      }

      const cycles = response.data.records;

      // Check today's cycle first
      const todayCycle = cycles[0];
      if (todayCycle?.id) {
        const todaySleep = await this.getSleep(todayCycle.id, userId);
        if (todaySleep?.score?.sleep_score) {
          return { 
            sleep_score: todaySleep.score.sleep_score, 
            cycleDate: todayCycle.start 
          };
        }
      }

      // If today's sleep is null, check yesterday's cycle
      if (cycles.length > 1) {
        const yesterdayCycle = cycles[1];
        if (yesterdayCycle?.id) {
          const yesterdaySleep = await this.getSleep(yesterdayCycle.id, userId);
          if (yesterdaySleep?.score?.sleep_score) {
            return { 
              sleep_score: yesterdaySleep.score.sleep_score, 
              cycleDate: yesterdayCycle.start 
            };
          }
        }
      }

      return { sleep_score: null, cycleDate: null };
    } catch (error) {
      console.error('Error fetching latest sleep data:', error);
      return { sleep_score: null, cycleDate: null };
    }
  }

  async getLatestSleepSession(userId: string): Promise<number | null> {
    if (!userId) {
      throw new Error('User ID is required to get latest sleep session');
    }
    try {
      console.log('Fetching latest sleep session data...');
      
      // Get today and yesterday dates for sleep data range
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const todayStr = today.toISOString().split('T')[0];
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Try direct sleep endpoint with date range first
      try {
        const headers = await this.authHeader(userId);
        const response = await axios.get(`${BASE}/activity/sleep?start=${yesterdayStr}&end=${todayStr}`, { 
          headers,
          timeout: 10000
        });
        
        if (response.data && response.data.records && response.data.records.length > 0) {
          // Derive "time asleep" from stages when available; otherwise, try time-in-bed; skip naps.
          const toHours = (ms: number) => Math.round((ms / 3600000) * 10) / 10;

          const sessions = response.data.records
            .filter((s: any) => s.nap === false)
            .map((s: any) => {
              const ss = s?.score?.stage_summary;
              // Prefer true time asleep from stages
              const asleepMs = (ss?.total_light_sleep_time_milli ?? 0)
                             + (ss?.total_slow_wave_sleep_time_milli ?? 0)
                             + (ss?.total_rem_sleep_time_milli ?? 0);
              let asleepHours: number | null = null;
              if (ss && (ss.total_light_sleep_time_milli != null
                      || ss.total_slow_wave_sleep_time_milli != null
                      || ss.total_rem_sleep_time_milli != null)) {
                asleepHours = toHours(asleepMs);
              } else if (s.start && s.end) {
                // fallback to time in bed if stages are missing
                const tibMs = new Date(s.end).getTime() - new Date(s.start).getTime();
                asleepHours = toHours(tibMs);
              }
              return { start: s.start, asleepHours };
            })
            .filter((x: any) => x.asleepHours != null)
            .sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime());

          if (sessions.length > 0) {
            console.log(`Derived latest sleep hours from list: ${sessions[0].asleepHours} h`);
            return sessions[0].asleepHours;
          }
        }
        
        console.log('No valid sleep sessions in date range, trying broader search...');
      } catch (directError) {
        console.log('Direct sleep endpoint failed, trying cycle-based approach...');
      }
      
      // Fallback to cycle-based approach with broader range
      try {
        const headers = await this.authHeader(userId);
        const cycleResponse = await axios.get(`${BASE}/cycle?limit=7`, { // Increased to 7 days
          headers,
          timeout: 10000
        });
        
        if (!cycleResponse.data.records || cycleResponse.data.records.length === 0) {
          console.log('No cycle data available');
          return null;
        }
        
        // Start from most recent cycle and work backwards
        for (let i = 0; i < Math.min(cycleResponse.data.records.length, 5); i++) {
          const cycle = cycleResponse.data.records[i];
          
          try {
            // Add small delay between requests to avoid rate limiting
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const sleepData = await this.getSleep(cycle.id, userId);
            
            // Check for valid sleep data
            if (sleepData && sleepData.nap === false && sleepData.sleep_hours != null && sleepData.sleep_hours > 0) {
              console.log(`Found valid sleep data for cycle ${cycle.id}: ${sleepData.sleep_hours} hours`);
              return Math.round(sleepData.sleep_hours * 10) / 10;
            } else {
              console.log(`Skipping cycle ${cycle.id}: nap=${sleepData?.nap}, sleep_hours=${sleepData?.sleep_hours}`);
            }
          } catch (cycleError) {
            console.log(`No sleep data for cycle ${cycle.id}, continuing to next cycle`);
            continue;
          }
        }
        
        console.log('No valid sleep data found in recent cycles');
        return null;
        
      } catch (cycleError) {
        console.error('Cycle-based sleep data retrieval failed:', cycleError);
        return null;
      }
    } catch (error) {
      console.error('Error in getLatestSleepSession:', error);
      return null;
    }
  }

  async getWorkoutData(userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get workout data');
    }
    try {
      console.log('Fetching recent workout data...');
      
      // Get today and yesterday dates for workout data range
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const todayStr = today.toISOString().split('T')[0];
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const headers = await this.authHeader(userId);
      const response = await axios.get(`${BASE}/activity/workout?start=${yesterdayStr}&end=${todayStr}`, { 
        headers,
        timeout: 10000
      });
      
      if (response.data && response.data.records && response.data.records.length > 0) {
        // Return the most recent workout
        const workouts = response.data.records
          .sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime());
        
        console.log(`Found ${workouts.length} workouts from today`);
        return workouts[0] || null;
      }
      
      console.log('No recent workouts found');
      return null;
    } catch (error) {
      // 404 errors are expected - these endpoints may not be available for all users
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log('Workout data endpoint not available (404) - skipping');
      } else {
        console.error('Error fetching workout data:', error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }

  async getBodyMeasurements(userId: string): Promise<any> {
    if (!userId) {
      throw new Error('User ID is required to get body measurements');
    }
    try {
      console.log('Fetching body measurements...');

      const headers = await this.authHeader(userId);
      const response = await axios.get(`${BASE}/body_measurement`, {
        headers,
        timeout: 10000
      });

      if (response.data) {
        console.log('Body measurements retrieved successfully');
        return response.data;
      }

      console.log('No body measurements found');
      return null;
    } catch (error) {
      // 404 errors are expected - these endpoints may not be available for all users
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log('Body measurements endpoint not available (404) - skipping');
      } else {
        console.error('Error fetching body measurements:', error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }

  async getWeeklyAverages(userId: string): Promise<{
    avgRecovery: number | null;
    avgStrain: number | null;
    avgSleep: number | null;
    avgHRV: number | null;
  }> {
    if (!userId) {
      throw new Error('User ID is required to get weekly averages');
    }
    try {
      const headers = await this.authHeader(userId);

      // Get last 8 cycles (we'll skip the first one which is today/current)
      // WHOOP app shows last 7 COMPLETED days, not including today
      const response = await axios.get(`${BASE}/cycle?limit=8`, { headers });

      if (!response.data.records || response.data.records.length === 0) {
        console.log('[WHOOP] No cycles found for weekly averages');
        return { avgRecovery: null, avgStrain: null, avgSleep: null, avgHRV: null };
      }

      const cycles = response.data.records;
      console.log(`[WHOOP] Fetched ${cycles.length} cycles for weekly averages calculation`);

      // Skip first cycle (today/current incomplete cycle) and use next 7
      const completedCycles = cycles.slice(1, 8);
      console.log(`[WHOOP] Using ${completedCycles.length} completed cycles (skipping today)`);

      const recoveryScores: number[] = [];
      const strainScores: number[] = [];
      const sleepScores: number[] = [];
      const hrvScores: number[] = [];

      // Process the 7 completed cycles
      for (let i = 0; i < completedCycles.length; i++) {
        const cycle = completedCycles[i];
        try {
          // Add delay between API calls to respect rate limits (increased from 100ms to 250ms)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 250));
          }

          // Get recovery data
          const recovery = await this.getRecovery(cycle.id, userId);
          if (recovery?.score?.recovery_score !== null && recovery?.score?.recovery_score !== undefined) {
            recoveryScores.push(recovery.score.recovery_score);
          }
          if (recovery?.score?.hrv_rmssd_milli !== null && recovery?.score?.hrv_rmssd_milli !== undefined) {
            hrvScores.push(recovery.score.hrv_rmssd_milli);
          }

          // Get strain data from cycle
          if (cycle.score?.strain !== null && cycle.score?.strain !== undefined) {
            strainScores.push(cycle.score.strain);
          }

          // Get sleep data using sleep_id from recovery data if available
          if (recovery?.sleep_id) {
            try {
              // Add delay before sleep API call (increased from 100ms to 250ms)
              await new Promise(resolve => setTimeout(resolve, 250));

              const headers = await this.authHeader(userId);
              const sleepResponse = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
              if (sleepResponse.status === 200) {
                const sleepData = sleepResponse.data;

                // Get sleep performance percentage (WHOOP returns 0-100 scale already)
                if (sleepData.score?.sleep_performance_percentage !== null && sleepData.score?.sleep_performance_percentage !== undefined) {
                  sleepScores.push(sleepData.score.sleep_performance_percentage);
                }
              }
            } catch (sleepError) {
              const sleepAxiosError = sleepError as { response?: { status?: number }; message?: string };
              if (sleepAxiosError.response?.status === 429) {
                console.log(`[WHOOP] Rate limit hit fetching sleep for cycle ${cycle.id}`);
              }
              // Sleep data may not be available for all cycles - continue processing
            }
          }

        } catch (error) {
          const axiosError = error as { response?: { status?: number }; message?: string };

          if (axiosError.response?.status === 429) {
            console.log(`[WHOOP] Rate limit hit for cycle ${cycle.id}, skipping remaining cycles`);
            break;
          }
          console.error(`[WHOOP] Error processing cycle ${cycle.id}:`, axiosError.message ?? error);
          // Continue with other cycles
        }
      }
      
      // Log collected data for debugging
      console.log(`[WHOOP] Collected data points:`);
      console.log(`  - Recovery: ${recoveryScores.length} values: [${recoveryScores.join(', ')}]`);
      console.log(`  - Strain: ${strainScores.length} values: [${strainScores.join(', ')}]`);
      console.log(`  - Sleep: ${sleepScores.length} values: [${sleepScores.join(', ')}]`);
      console.log(`  - HRV: ${hrvScores.length} values: [${hrvScores.join(', ')}]`);

      // Calculate averages with rounding to 1 decimal place
      const avgRecovery = recoveryScores.length > 0
        ? Math.round((recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length) * 10) / 10
        : null;

      const avgStrain = strainScores.length > 0
        ? Math.round((strainScores.reduce((a, b) => a + b, 0) / strainScores.length) * 10) / 10
        : null;

      const avgSleep = sleepScores.length > 0
        ? Math.round((sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length) * 10) / 10
        : null;

      const avgHRV = hrvScores.length > 0
        ? Math.round((hrvScores.reduce((a, b) => a + b, 0) / hrvScores.length) * 10) / 10
        : null;

      console.log(`[WHOOP] Weekly averages calculated: Recovery=${avgRecovery}%, Strain=${avgStrain}, Sleep=${avgSleep}%, HRV=${avgHRV}ms`);

      return { avgRecovery, avgStrain, avgSleep, avgHRV };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WHOOP] Error calculating weekly averages:', message);
      return { avgRecovery: null, avgStrain: null, avgSleep: null, avgHRV: null };
    }
  }

  async getTodaysData(userId: string): Promise<WhoopTodayData> {
    if (!userId) {
      throw new Error('User ID is required to get today\'s data');
    }
    try {
      // Get the latest cycle with user-specific authentication
      const latestCycle = await this.getLatestCycle(userId);
      if (!latestCycle) {
        console.log('No cycles found');
        return {};
      }

      console.log(`Using cycle: ${latestCycle.id}`);

      // Get recovery data with user-specific authentication
      const recovery = await this.getRecovery(latestCycle.id, userId);
      console.log('Recovery data found for cycle:', latestCycle.id);

      // Get sleep data using sleep_id from recovery data if available
      let sleepData = null;
      let sleepHours = null;
      let sleepScore = null;
      let sleepEfficiencyPct: number | null = null;
      let timeInBedHours: number | null = null;
      let stageSummary: any = null;
      
      if (recovery?.sleep_id) {
        console.log(`Found sleep_id in recovery data: ${recovery.sleep_id}`);
        try {
          const headers = await this.authHeader(userId);
          const response = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
          if (response.status === 200) {
            sleepData = response.data;
            console.log('Sleep data retrieved via sleep_id:', JSON.stringify(sleepData, null, 2));
            
            // After `sleepData = response.data;` and before building `result`, derive sleep hours properly.
            // Prefer time asleep (sum of light + slow wave + REM) when scored; otherwise fall back to time in bed.

            // Extract score and stage summary safely
            const scoreState = sleepData?.score_state || sleepData?.score?.score_state; // tolerate different shapes
            stageSummary = sleepData?.score?.stage_summary;

            console.log("[SLEEP] stageSummary present:", !!stageSummary,
              "| keys:", stageSummary ? Object.keys(stageSummary) : "none");

            // Extract sleep score (0–100) from performance percentage if present
            if (sleepData?.score?.sleep_performance_percentage !== undefined && sleepData?.score?.sleep_performance_percentage !== null) {
              sleepScore = Math.min(Math.max(sleepData.score.sleep_performance_percentage, 0), 100);
              console.log(`[SLEEP] Sleep score (performance %): ${sleepScore}`);
            }

            // Extract efficiency if present
            if (typeof sleepData?.score?.sleep_efficiency_percentage === "number") {
              sleepEfficiencyPct = Math.round(sleepData.score.sleep_efficiency_percentage);
            }

            // Compute time in bed (hours)
            if (typeof stageSummary?.total_in_bed_time_milli === "number") {
              timeInBedHours = Math.round((stageSummary.total_in_bed_time_milli / 3600000) * 10) / 10;
            } else if (sleepData?.start && sleepData?.end) {
              const tibMs = new Date(sleepData.end).getTime() - new Date(sleepData.start).getTime();
              timeInBedHours = Math.round((tibMs / 3600000) * 10) / 10;
            }

            // Compute time asleep (Sleep Hours) when we have scored stages
            if (stageSummary &&
                typeof stageSummary.total_light_sleep_time_milli === "number" &&
                typeof stageSummary.total_slow_wave_sleep_time_milli === "number" &&
                typeof stageSummary.total_rem_sleep_time_milli === "number") {
              const asleepMs =
                (stageSummary.total_light_sleep_time_milli || 0) +
                (stageSummary.total_slow_wave_sleep_time_milli || 0) +
                (stageSummary.total_rem_sleep_time_milli || 0);

              sleepHours = Math.round((asleepMs / 3600000) * 10) / 10;
              console.log(`[SLEEP] Time asleep (derived from stages): ${sleepHours} h`);
            } else {
              // No stage data yet → fallback to time in bed
              sleepHours = null; // keep null to avoid mislabeling as "sleep hours"
              console.log("[SLEEP] Stage summary missing → using Time in Bed fallback, scoring may be pending");
            }
          }
        } catch (sleepError: any) {
          console.log(`Failed to get sleep data via sleep_id ${recovery.sleep_id}:`, sleepError.response?.status);
        }
      }

      // Fallback to previous sleep retrieval method if sleep_id approach failed
      if (!sleepHours) {
        try {
          sleepHours = await this.getLatestSleepSession(userId);
          if (sleepHours !== null) {
            console.log(`Sleep hours retrieved via fallback method: ${sleepHours}`);
          } else {
            console.log('No sleep data available - this is normal if sleep hasn\'t been processed yet');
          }
        } catch (error) {
          const message = error instanceof WhoopApiError ? error.message : String(error);
          console.log('Sleep data retrieval failed:', message);
        }
      }

      // Get additional insights: workout and body measurements
      let workoutData = null;
      let bodyMeasurements = null;
      
      try {
        console.log('Fetching additional insights...');
        
        // Get recent workout data
        workoutData = await this.getWorkoutData(userId);
        
        // Get body measurements  
        bodyMeasurements = await this.getBodyMeasurements(userId);
        
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log('Error fetching additional insights:', message);
      }

      // Calculate sleep stages in minutes if available
      // Note: stageSummary already extracted earlier in the sleep processing
      const sleepStages = stageSummary ? {
        light_sleep_minutes: Math.round((stageSummary.total_light_sleep_time_milli || 0) / 60000),
        deep_sleep_minutes: Math.round((stageSummary.total_slow_wave_sleep_time_milli || 0) / 60000),
        rem_sleep_minutes: Math.round((stageSummary.total_rem_sleep_time_milli || 0) / 60000),
        awake_minutes: Math.round((stageSummary.total_awake_time_milli || 0) / 60000),
      } : null;

      const result: WhoopTodayData = {
        cycle_id: latestCycle.id,
        strain: latestCycle.score?.strain ?? undefined,
        recovery_score: recovery?.score?.recovery_score ?? undefined,
        // sleep fields
        sleep_score: sleepScore ?? undefined,
        sleep_stages: sleepStages ?? undefined,

        // primary "time asleep" (null if stages not scored yet)
        sleep_hours: sleepHours ?? undefined,

        // NEW: temporary camelCase alias for frontend compatibility (remove later if not needed)
        sleepHours: sleepHours ?? undefined,

        // fallback & context
        time_in_bed_hours: timeInBedHours ?? undefined,
        sleep_efficiency_pct: sleepEfficiencyPct ?? undefined,
        hrv: recovery?.score?.hrv_rmssd_milli ?? undefined,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? undefined,
        average_heart_rate: workoutData?.avgHeartRate ?? latestCycle.score?.average_heart_rate ?? undefined,
        stress_score: undefined, // WHOOP doesn't provide stress score in current API
        skin_temperature: recovery?.score?.skin_temp_celsius ?? undefined,
        spo2_percentage: recovery?.score?.spo2_percentage ?? undefined,
        respiratory_rate: recovery?.score?.respiratory_rate ?? undefined,
        calories_burned: workoutData?.kilojoule != null ? Math.round(workoutData.kilojoule * 0.239) : undefined, // Convert kJ to calories
        activity_log: workoutData?.activities ?? [],
        raw_data: {
          cycle: latestCycle,
          recovery: recovery,
          sleep: sleepData,
          workout: workoutData,
          body_measurements: bodyMeasurements
        }
      };



      // Store in database for historical tracking
      const today = new Date().toISOString().split('T')[0];
      const dataToStore = {
        date: today,
        cycle_id: result.cycle_id,
        strain: result.strain,
        recovery_score: result.recovery_score,
        hrv: result.hrv,
        resting_heart_rate: result.resting_heart_rate,
        sleep_hours: result.sleep_hours,
        raw_data: result.raw
      };

      // Log the daily stats before storing
      console.log(`Daily WHOOP stats logged: ${today}`);
      
      // Database storage handled in routes.ts
      console.log('WHOOP data retrieved successfully');

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching WHOOP data:', message);
      return {};
    }
  }

  private resolveRedirectUri() {
    const redirectUriEnv = process.env.WHOOP_REDIRECT_URI?.trim();
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    
    // Mobile environment: Always prefer .env value, no fallback to Replit
    // Web environment: Uses Replit redirect (https://health-data-hub.replit.app/api/whoop/callback)
    // Mobile environment: Uses only .env redirect (e.g., ngrok URL)
    
    if (!redirectUriEnv) {
      throw new Error('WHOOP_REDIRECT_URI must be set in environment variables for mobile app');
    }

    if (!redirectUriEnv.startsWith('http')) {
      throw new Error('WHOOP_REDIRECT_URI must include protocol (http/https)');
    }

    const isProduction = redirectUriEnv.startsWith('https://');
    const redirectUri = redirectUriEnv; // Always use .env value, no fallbacks

    console.log(`[WHOOP REDIRECT] Using .env redirect URI: ${redirectUri} (production: ${isProduction})`);
    
    return { redirectUri, nodeEnv };
  }

  getOAuthUrl(): string {
    const clientId = process.env.WHOOP_CLIENT_ID;
    if (!clientId) {
      throw new Error('WHOOP_CLIENT_ID not configured');
    }
    const { redirectUri, nodeEnv } = this.resolveRedirectUri();

    const scope = 'read:cycles read:recovery read:sleep read:profile read:workout read:body_measurement offline';
    const state = 'whoop_auth_' + Date.now();
    
    console.log('[OAUTH] NODE_ENV:', nodeEnv);
    console.log('[OAUTH] Using WHOOP redirect URI:', redirectUri);
    console.log('[OAUTH] Client ID:', clientId);
    console.log('[OAUTH] Requesting scopes:', scope);
    console.log('[OAUTH] Including offline scope for refresh token capability');
    
    const oauthUrl = `${WHOOP_OAUTH_BASE}/oauth2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}&` +
      `response_type=code`;
      
    console.log('[OAUTH] Generated OAuth URL:', oauthUrl);
    return oauthUrl;
  }

  // Get yesterday's WHOOP data (similar to getTodaysData but for yesterday)
  async getYesterdaysData(userId: string): Promise<WhoopTodayData> {
    if (!userId) {
      throw new Error('User ID is required to get yesterday\'s data');
    }
    try {
      console.log('Getting yesterday\'s WHOOP data for user:', userId);

      // Get multiple recent cycles to find yesterday's COMPLETED cycle
      const headers = await this.authHeader(userId);
      const response = await axios.get(`${BASE}/cycle?limit=10`, { headers });

      if (!response.data?.records || !response.data.records.length) {
        console.log('No cycles found for yesterday');
        return {};
      }

      // Find yesterday's COMPLETED cycle
      // WHOOP cycles start in the evening and run ~24 hours
      // cycles[0] = today's ongoing cycle (started yesterday evening)
      // cycles[1] = yesterday's cycle (may still be completing if checked early morning)
      // cycles[2] = 2 days ago cycle (definitely completed)
      // To ensure we get completed data, we look at cycles[2] or cycles[1] if it's ended
      const cycles = response.data.records;

      // Debug: Log all cycles with their strain values
      console.log('[YESTERDAY STRAIN DEBUG] All cycles retrieved:');
      cycles.forEach((cycle: any, idx: number) => {
        console.log(`  cycles[${idx}]: id=${cycle.id}, start=${cycle.start}, end=${cycle.end}, strain=${cycle.score?.strain}`);
      });

      let yesterdayCycle = null;
      const now = new Date();

      // Try cycles[1] first if it has ended
      if (cycles.length >= 2 && cycles[1].end) {
        const cycleEnd = new Date(cycles[1].end);
        // If the cycle ended and we're past that time, it's complete
        if (cycleEnd < now) {
          yesterdayCycle = cycles[1];
          console.log(`Using completed cycle[1]: ${yesterdayCycle.id} (ended: ${cycles[1].end})`);
        }
      }

      // If cycles[1] is not complete, use cycles[2] as fallback
      if (!yesterdayCycle && cycles.length >= 3) {
        yesterdayCycle = cycles[2];
        console.log(`Using cycle[2] as fallback (completed cycle): ${yesterdayCycle.id}`);
      }

      // If still no cycle found, fall back to cycles[1] anyway
      if (!yesterdayCycle && cycles.length >= 2) {
        yesterdayCycle = cycles[1];
        console.log(`Using cycle[1] as last resort: ${yesterdayCycle.id}`);
      }

      if (!yesterdayCycle) {
        console.log('Not enough cycles to find yesterday\'s data');
        return {};
      }

      // Get recovery data for yesterday's cycle
      const recovery = await this.getRecovery(yesterdayCycle.id, userId);
      console.log('Recovery data found for yesterday cycle:', yesterdayCycle.id);

      // Get sleep data using sleep_id from recovery data if available
      let sleepData = null;
      let sleepScore = null;

      if (recovery?.sleep_id) {
        console.log(`Found sleep_id in yesterday recovery data: ${recovery.sleep_id}`);
        try {
          const sleepResponse = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
          if (sleepResponse.status === 200) {
            sleepData = sleepResponse.data;
            if (sleepData?.score?.sleep_performance_percentage !== undefined && sleepData?.score?.sleep_performance_percentage !== null) {
              sleepScore = Math.min(Math.max(sleepData.score.sleep_performance_percentage, 0), 100);
            }
          }
        } catch (sleepError) {
          console.warn('Failed to get yesterday sleep data via sleep_id:', sleepError);
        }
      }

      // Build result object - get strain from the completed cycle
      const result: WhoopTodayData = {
        recovery_score: recovery?.score?.recovery_score ?? undefined,
        strain: yesterdayCycle.score?.strain ?? undefined, // Get strain from completed cycle
        hrv: recovery?.score?.hrv_rmssd_milli ?? undefined,
        sleep_score: sleepScore ?? undefined
      };

      console.log('Yesterday data result:', result);
      return result;
    } catch (error) {
      console.error('Error getting yesterday\'s data:', error);
      return {};
    }
  }

  // Get insights data (sleep hours and resting heart rate)
  async getInsightsData(userId: string): Promise<{ sleep_hours: number | undefined; resting_heart_rate: number | undefined }> {
    if (!userId) {
      throw new Error('User ID is required to get insights data');
    }
    try {
      console.log('Getting insights data for user:', userId);
      
      // Get the latest cycle for insights
      const latestCycle = await this.getLatestCycle(userId);
      if (!latestCycle) {
        console.log('No cycles found for insights');
        return { sleep_hours: undefined, resting_heart_rate: undefined };
      }
      
      // Get recovery data for RHR and sleep data for sleep hours
      const recovery = await this.getRecovery(latestCycle.id, userId);
      let sleepHours: number | undefined = undefined;
      
      if (recovery?.sleep_id) {
        try {
          const headers = await this.authHeader(userId);
          const sleepResponse = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
          if (sleepResponse.status === 200) {
            const sleepData = sleepResponse.data;
            const stageSummary = sleepData?.score?.stage_summary;
            
            if (stageSummary) {
              // Calculate sleep hours from stage summary
              const totalSleepMs = (stageSummary.total_light_sleep_time_milli || 0) +
                                  (stageSummary.total_slow_wave_sleep_time_milli || 0) +
                                  (stageSummary.total_rem_sleep_time_milli || 0);
              
              if (totalSleepMs > 0) {
                sleepHours = Math.round((totalSleepMs / (1000 * 60 * 60)) * 10) / 10; // Convert ms to hours, round to 1 decimal
              }
            }
          }
        } catch (sleepError) {
          console.warn('Failed to get sleep data for insights:', sleepError);
        }
      }
      
      const result = {
        sleep_hours: sleepHours,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? undefined
      };
      
      console.log('Insights data result:', result);
      return result;
    } catch (error) {
      console.error('Error getting insights data:', error);
      return { sleep_hours: undefined, resting_heart_rate: undefined };
    }
  }

  /**
   * Fetch WHOOP data for a specific historical date
   * Returns recovery, sleep, strain, and HRV data for the given date
   */
  async getDataForDate(userId: string, dateStr: string): Promise<{
    recoveryScore?: number;
    sleepScore?: number;
    strainScore?: number;
    hrv?: number;
    restingHeartRate?: number;
  } | null> {
    if (!userId) {
      throw new Error('User ID is required to get historical data');
    }

    try {
      console.log(`[WHOOP HISTORICAL] Fetching data for user=${userId}, date=${dateStr}`);

      const headers = await this.authHeader(userId);

      // Calculate date range: the date itself + next day to catch cycles that started on this date
      const startDate = new Date(dateStr);
      const endDate = new Date(dateStr);
      endDate.setDate(endDate.getDate() + 2); // Add 2 days to ensure we catch the cycle

      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();

      console.log(`[WHOOP HISTORICAL] Fetching cycles from ${startStr} to ${endStr}`);

      // Fetch cycles for the date range
      const cycleResponse = await axios.get(
        `${BASE}/cycle?start=${startStr}&end=${endStr}&limit=10`,
        { headers, timeout: 15000 }
      );

      if (!cycleResponse.data?.records || cycleResponse.data.records.length === 0) {
        console.log(`[WHOOP HISTORICAL] No cycles found for date ${dateStr}`);
        return null;
      }

      console.log(`[WHOOP HISTORICAL] Found ${cycleResponse.data.records.length} cycles`);

      // Find the cycle that corresponds to this date
      // WHOOP cycles typically start in the evening and end the next evening
      // We want the cycle where the date falls within the cycle period
      const targetDate = new Date(dateStr);
      const targetDateStr = dateStr;

      let targetCycle = null;
      for (const cycle of cycleResponse.data.records) {
        const cycleStart = new Date(cycle.start);
        const cycleEnd = new Date(cycle.end);
        const cycleDate = cycleStart.toISOString().split('T')[0];

        console.log(`[WHOOP HISTORICAL] Checking cycle: ${cycle.id}, date=${cycleDate}, start=${cycle.start}, end=${cycle.end}, strain=${cycle.score?.strain}`);

        // Match if the cycle start date matches our target date
        if (cycleDate === targetDateStr) {
          targetCycle = cycle;
          console.log(`[WHOOP HISTORICAL] Found matching cycle: ${cycle.id} for date ${targetDateStr}, strain=${cycle.score?.strain}`);
          break;
        }
      }

      if (!targetCycle) {
        console.log(`[WHOOP HISTORICAL] No cycle found matching date ${dateStr}`);
        return null;
      }

      // Fetch recovery data for this cycle
      const recovery = await this.getRecovery(targetCycle.id, userId);

      let sleepScore = null;
      let hrv = null;

      if (recovery) {
        hrv = recovery.score?.hrv_rmssd_milli || null;

        // Fetch sleep data if available
        if (recovery.sleep_id) {
          try {
            await new Promise(resolve => setTimeout(resolve, 250)); // Rate limiting
            const sleepResponse = await axios.get(
              `${BASE}/activity/sleep/${recovery.sleep_id}`,
              { headers, timeout: 15000 }
            );

            if (sleepResponse.data?.score?.sleep_performance_percentage !== null) {
              sleepScore = sleepResponse.data.score.sleep_performance_percentage;
            }
          } catch (sleepError) {
            console.log(`[WHOOP HISTORICAL] Failed to fetch sleep for cycle ${targetCycle.id}`);
          }
        }
      }

      const result = {
        recoveryScore: recovery?.score?.recovery_score || null,
        sleepScore: sleepScore,
        strainScore: targetCycle.score?.strain || null,
        hrv: hrv,
        restingHeartRate: recovery?.score?.resting_heart_rate || null,
      };

      console.log(`[WHOOP HISTORICAL] Data for ${dateStr}:`, result);
      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WHOOP HISTORICAL] Error fetching data for ${dateStr}:`, message);
      return null;
    }
  }
}

export const whoopApiService = new WhoopApiService();
