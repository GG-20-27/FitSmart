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
  };
  error?: {
    type: string;
    message: string;
    retryable: boolean;
  };
}

export class WhoopApiService {
  private async authHeader() {
    const tokenData = await this.getValidWhoopToken();
    return { Authorization: `Bearer ${tokenData.access_token}` };
  }

  private async refreshToken(refreshToken: string): Promise<any> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP client credentials');
    }

    console.log('[TOKEN REFRESH] Starting WHOOP token refresh...');

    try {
      const response = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'offline'
      }, {
        headers: {
          'Content-Type': 'application/json',
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
        user_id: 'default'
      };
    } catch (error: any) {
      console.error('[TOKEN REFRESH] Token refresh failed:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error || error.message}`);
    }
  }

  // New function to ensure we always have a valid token
  async getValidWhoopToken(): Promise<any> {
    let tokenData = await whoopTokenStorage.getDefaultToken();
    
    if (!tokenData?.access_token) {
      console.log('[TOKEN VALIDATION] No WHOOP access token found');
      throw new Error('Missing WHOOP access token');
    }

    // Check if token is expired
    if (!whoopTokenStorage.isTokenValid(tokenData)) {
      console.log('[TOKEN VALIDATION] Token expired, attempting to refresh...');
      
      if (!tokenData.refresh_token) {
        console.log('[TOKEN VALIDATION] No refresh token available');
        throw new Error('WHOOP token expired and no refresh token available');
      }

      try {
        const refreshedToken = await this.refreshToken(tokenData.refresh_token);
        await whoopTokenStorage.setDefaultToken(refreshedToken);
        console.log('[TOKEN VALIDATION] Token refreshed and stored successfully');
        return refreshedToken;
      } catch (error) {
        console.error('[TOKEN VALIDATION] Failed to refresh token:', error);
        throw new Error('WHOOP token expired and refresh failed');
      }
    } else {
      console.log('[TOKEN VALIDATION] Token is still valid');
      return tokenData;
    }
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri = 'https://health-data-hub.replit.app/api/whoop/callback';

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
      console.log('WHOOP response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('WHOOP token exchange successful');
      return data;
    } catch (error: any) {
      console.error('WHOOP token exchange failed:', error.message);
      throw new Error(`Failed to exchange code for access token: ${error.message}`);
    }
  }

  async getLatestCycle(): Promise<any> {
    try {
      const headers = await this.authHeader();
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

  async getRecovery(cycleId: string): Promise<any> {
    try {
      const headers = await this.authHeader();
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

  async getSleep(cycleId: string): Promise<any> {
    try {
      const headers = await this.authHeader();
      console.log(`Fetching sleep for cycle ${cycleId}...`);
      
      const response = await axios.get(`${BASE}/cycle/${cycleId}/sleep`, { headers });
      
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
          const headers = await this.authHeader();
          const cycleResponse = await axios.get(`${BASE}/cycle?limit=10`, { headers });
          
          if (cycleResponse.data.records && cycleResponse.data.records.length > 0) {
            // Find the current cycle index and get the previous one
            const cycles = cycleResponse.data.records;
            const currentCycleIndex = cycles.findIndex((cycle: any) => cycle.id === cycleId);
            
            if (currentCycleIndex !== -1 && currentCycleIndex < cycles.length - 1) {
              const previousCycleId = cycles[currentCycleIndex + 1].id;
              console.log(`Trying to fetch sleep data from previous cycle: ${previousCycleId}`);
              
              const previousSleepResponse = await axios.get(`${BASE}/cycle/${previousCycleId}/sleep`, { headers });
              
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

  async getLatestSleepData(): Promise<{ sleep_score: number | null; cycleDate: string | null }> {
    try {
      const headers = await this.authHeader();
      const response = await axios.get(`${BASE}/cycle?limit=3`, { headers });
      
      if (!response.data.records || response.data.records.length === 0) {
        return { sleep_score: null, cycleDate: null };
      }

      const cycles = response.data.records;

      // Check today's cycle first
      const todayCycle = cycles[0];
      if (todayCycle?.id) {
        const todaySleep = await this.getSleep(todayCycle.id);
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
          const yesterdaySleep = await this.getSleep(yesterdayCycle.id);
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

  async getLatestSleepSession(): Promise<number | null> {
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
        const headers = await this.authHeader();
        const response = await axios.get(`${BASE}/sleep?start=${yesterdayStr}&end=${todayStr}`, { 
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
        const headers = await this.authHeader();
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
            
            const sleepData = await this.getSleep(cycle.id);
            
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

  async getWeeklyAverages(): Promise<{
    avgRecovery: number | null;
    avgStrain: number | null;
    avgSleep: number | null;
    avgHRV: number | null;
  }> {
    try {
      const headers = await this.authHeader();
      
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
      
      // Process each cycle
      for (const cycle of cycles) {
        try {
          // Get recovery data
          const recovery = await this.getRecovery(cycle.id);
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
          
          // Get sleep data
          try {
            const sleep = await this.getSleep(cycle.id);
            if (sleep?.score?.sleep_score) {
              sleepScores.push(sleep.score.sleep_score);
            }
          } catch (error) {
            // Sleep data often missing, continue silently
          }
          
        } catch (error) {
          console.error(`Error processing cycle ${cycle.id}:`, error);
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

  async getTodaysData(): Promise<WhoopTodayData> {
    try {
      // Get the latest cycle
      const latestCycle = await this.getLatestCycle();
      if (!latestCycle) {
        console.log('No cycles found');
        return {};
      }

      console.log(`Using cycle: ${latestCycle.id}`);

      // Get recovery data
      const recovery = await this.getRecovery(latestCycle.id);
      console.log('Recovery data found for cycle:', latestCycle.id);

      // Get sleep data - try to find any recent valid sleep session
      let sleepHours = null;
      try {
        sleepHours = await this.getLatestSleepSession();
        if (sleepHours !== null) {
          console.log(`Sleep hours retrieved: ${sleepHours}`);
        } else {
          console.log('No sleep data available - this is normal if sleep hasn\'t been processed yet');
        }
      } catch (error) {
        console.log('Sleep data retrieval failed:', error instanceof WhoopApiError ? error.message : error);
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
          sleep: sleepHours
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
    const redirectUri = 'https://health-data-hub.replit.app/api/whoop/callback';
    const scope = 'read:cycles read:recovery read:sleep read:profile read:workout read:body_measurement';
    const state = 'whoop_auth_' + Date.now();
    
    return `${WHOOP_OAUTH_BASE}/oauth2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}&` +
      `response_type=code`;
  }
}

export const whoopApiService = new WhoopApiService();