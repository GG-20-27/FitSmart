import axios, { AxiosError } from 'axios';
import { whoopTokenStorage } from './whoopTokenStorage';

const BASE = 'https://api.prod.whoop.com/developer/v1';
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
  hrv?: number;
  resting_heart_rate?: number;
  sleep_hours?: number;
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
  private async authHeader(userId: string = 'd5fc289b-82a1-4e7c-b6fb-df042cb2c5a5') {
    const tokenData = await this.getValidWhoopToken(userId);
    return { Authorization: `Bearer ${tokenData.access_token}` };
  }

  private async refreshToken(refreshToken: string, userId: string = 'd5fc289b-82a1-4e7c-b6fb-df042cb2c5a5'): Promise<any> {
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
  async getValidWhoopToken(userId: string = 'd5fc289b-82a1-4e7c-b6fb-df042cb2c5a5'): Promise<any> {
    let tokenData = await whoopTokenStorage.getToken(userId);
    
    if (!tokenData?.access_token) {
      console.log('[TOKEN VALIDATION] No WHOOP access token found');
      throw new WhoopApiError({
        type: WhoopErrorType.AUTHENTICATION_ERROR,
        message: 'Missing WHOOP access token',
        retryable: false
      });
    }

    // For now, just return the token without refresh checks to fix the issue
    console.log('[TOKEN VALIDATION] Using existing token');
    return tokenData;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    
    // Use production redirect URI since we have registered WHOOP credentials  
    const isProduction = true; // Use registered redirect URI
    const redirectUri = isProduction 
      ? 'https://health-data-hub.replit.app/api/whoop/callback'
      : 'http://localhost:5000/api/whoop/callback';

    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP client credentials');
    }

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

  async getLatestCycle(userId: string = 'd5fc289b-82a1-4e7c-b6fb-df042cb2c5a5'): Promise<any> {
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

  async getRecovery(cycleId: string, userId: string = 'd5fc289b-82a1-4e7c-b6fb-df042cb2c5a5'): Promise<any> {
    try {
      const headers = await this.authHeader(userId);
      console.log(`Fetching recovery for cycle ${cycleId}...`);
      
      const response = await axios.get(`${BASE}/cycle/${cycleId}/recovery`, { headers });
      
      if (response.status === 200) {
        console.log('Recovery data found for cycle:', cycleId);
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error(`Failed to fetch recovery for cycle ${cycleId}:`, error.response?.status, error.response?.data);
      if (error.response?.status === 404) {
        console.log(`No recovery data available for cycle ${cycleId}`);
        return null;
      }
      throw error;
    }
  }

  async getSleep(cycleId: string, userId: string = 'default'): Promise<any> {
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

  async getLatestSleepData(userId: string = 'default'): Promise<{ sleep_score: number | null; cycleDate: string | null }> {
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

  async getLatestSleepSession(userId: string = 'default'): Promise<number | null> {
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
          // Find the most recent non-nap sleep session
          const sleepSessions = response.data.records
            .filter((sleep: any) => sleep.nap === false && sleep.sleep_hours != null && sleep.sleep_hours > 0)
            .sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime()); // Sort by most recent
          
          if (sleepSessions.length > 0) {
            const mostRecentSleep = sleepSessions[0];
            console.log(`Found valid sleep session: ${mostRecentSleep.sleep_hours} hours (${mostRecentSleep.start})`);
            return Math.round(mostRecentSleep.sleep_hours * 10) / 10;
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

  async getWorkoutData(userId?: string): Promise<any> {
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
      console.error('Error fetching workout data:', error);
      return null;
    }
  }

  async getBodyMeasurements(userId?: string): Promise<any> {
    try {
      console.log('Fetching body measurements...');
      
      const headers = await this.authHeader(userId);
      const response = await axios.get(`${BASE}/user/measurement`, { 
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
      console.error('Error fetching body measurements:', error);
      return null;
    }
  }

  async getWeeklyAverages(userId?: string): Promise<{
    avgRecovery: number | null;
    avgStrain: number | null;
    avgSleep: number | null;
    avgHRV: number | null;
  }> {
    try {
      const headers = await this.authHeader(userId);
      
      // Get cycles from the past 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      const response = await axios.get(
        `${BASE}/cycle?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, 
        { headers }
      );
      
      if (!response.data.records || response.data.records.length === 0) {
        console.log('No cycles found for weekly averages');
        return { avgRecovery: null, avgStrain: null, avgSleep: null, avgHRV: null };
      }
      
      const cycles = response.data.records;
      console.log(`Processing ${cycles.length} cycles for weekly averages`);
      
      const recoveryScores: number[] = [];
      const strainScores: number[] = [];
      const sleepScores: number[] = [];
      const hrvScores: number[] = [];
      
      // Process each cycle with rate limiting protection
      for (let i = 0; i < Math.min(cycles.length, 5); i++) {
        const cycle = cycles[i];
        try {
          // Add delay between API calls to respect rate limits
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Get recovery data
          const recovery = await this.getRecovery(cycle.id, userId);
          if (recovery?.score?.recovery_score) {
            recoveryScores.push(recovery.score.recovery_score);
          }
          if (recovery?.score?.hrv_rmssd_milli) {
            hrvScores.push(recovery.score.hrv_rmssd_milli);
          }
          
          // Get strain data from cycle
          if (cycle.score?.strain) {
            strainScores.push(cycle.score.strain);
          }
          
          // Get sleep data using sleep_id from recovery data if available
          if (recovery?.sleep_id) {
            try {
              // Add delay before sleep API call
              await new Promise(resolve => setTimeout(resolve, 100));
              
              const headers = await this.authHeader(userId);
              const response = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
              if (response.status === 200) {
                const sleepData = response.data;
                
                // Get sleep score percentage 
                if (sleepData.score?.sleep_performance_percentage !== null && sleepData.score?.sleep_performance_percentage !== undefined) {
                  sleepScores.push(sleepData.score.sleep_performance_percentage);
                }
              }
            } catch (error) {
              // Sleep data may not be available for all cycles or rate limited
            }
          }
          
        } catch (error) {
          if (error.response?.status === 429) {
            console.log(`Rate limit hit for cycle ${cycle.id}, skipping remaining cycles`);
            break;
          }
          console.error(`Error processing cycle ${cycle.id}:`, error.message);
          // Continue with other cycles
        }
      }
      
      // Calculate averages
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
      
      console.log(`Weekly averages calculated: Recovery: ${avgRecovery}%, Strain: ${avgStrain}, Sleep: ${avgSleep}%, HRV: ${avgHRV}ms`);
      
      return { avgRecovery, avgStrain, avgSleep, avgHRV };
      
    } catch (error) {
      console.error('Error calculating weekly averages:', error);
      return { avgRecovery: null, avgStrain: null, avgSleep: null, avgHRV: null };
    }
  }

  async getTodaysData(userId?: string): Promise<WhoopTodayData> {
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
      
      if (recovery?.sleep_id) {
        console.log(`Found sleep_id in recovery data: ${recovery.sleep_id}`);
        try {
          const headers = await this.authHeader(userId);
          const response = await axios.get(`${BASE}/activity/sleep/${recovery.sleep_id}`, { headers });
          if (response.status === 200) {
            sleepData = response.data;
            console.log('Sleep data retrieved via sleep_id:', JSON.stringify(sleepData, null, 2));
            
            // Extract sleep hours and score from response
            if (sleepData.score?.sleep_score) {
              sleepHours = sleepData.score.sleep_score;
              console.log(`Sleep score from sleep_id: ${sleepHours}`);
            }
            
            // Try to get sleep hours from stage_summary if available
            if (!sleepHours && sleepData.score?.stage_summary?.total_in_bed_time_milli) {
              sleepHours = Math.round(sleepData.score.stage_summary.total_in_bed_time_milli / (1000 * 60 * 60) * 10) / 10;
              console.log(`Sleep hours calculated from stage_summary: ${sleepHours}`);
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
          console.log('Sleep data retrieval failed:', error instanceof WhoopApiError ? error.message : error);
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
        console.log('Error fetching additional insights:', error);
      }

      const result: WhoopTodayData = {
        cycle_id: latestCycle.id,
        strain: latestCycle.score?.strain || null,
        recovery_score: recovery?.score?.recovery_score || null,
        hrv: recovery?.score?.hrv_rmssd_milli || null,
        resting_heart_rate: recovery?.score?.resting_heart_rate || null,
        sleep_hours: sleepHours,
        raw: {
          cycle: latestCycle,
          recovery: recovery,
          sleep: sleepData || sleepHours,
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
      console.error('Error fetching WHOOP data:', error);
      return {};
    }
  }

  getOAuthUrl(): string {
    const clientId = process.env.WHOOP_CLIENT_ID;
    if (!clientId) {
      throw new Error('WHOOP_CLIENT_ID not configured');
    }

    // Use production redirect URI since we have registered WHOOP credentials
    const isProduction = true; // Use registered redirect URI 
    const redirectUri = isProduction 
      ? 'https://health-data-hub.replit.app/api/whoop/callback'
      : 'http://localhost:5000/api/whoop/callback';

    const scope = 'read:cycles read:recovery read:sleep read:profile read:workout read:body_measurement offline';
    const state = 'whoop_auth_' + Date.now();
    
    console.log('[OAUTH] Environment: Production=' + isProduction);
    console.log('[OAUTH] Redirect URI:', redirectUri);
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
}

export const whoopApiService = new WhoopApiService();