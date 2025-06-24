import axios from 'axios';
import { whoopTokenStorage } from './whoopTokenStorage';

const BASE = 'https://api.prod.whoop.com/developer/v1';
const WHOOP_OAUTH_BASE = 'https://api.prod.whoop.com/oauth';

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
  sleep_score?: number;
  raw?: {
    cycle?: any;
    recovery?: any;
    sleep?: any;
  };
}

export class WhoopApiService {
  private async authHeader() {
    const tokenData = await whoopTokenStorage.getDefaultToken();
    if (!tokenData?.access_token) {
      throw new Error('Missing WHOOP access token');
    }
    return { Authorization: `Bearer ${tokenData.access_token}` };
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
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error(`Failed to fetch sleep for cycle ${cycleId}:`, error.response?.status, error.response?.data);
      if (error.response?.status === 404) {
        console.log(`No sleep data available for cycle ${cycleId}`);
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

  async getLatestSleepScore(): Promise<number | null> {
    try {
      // Get recent cycles - sleep data is typically in previous cycle
      const headers = await this.authHeader();
      const response = await axios.get(`${BASE}/cycle?limit=5`, { headers });
      
      if (response.data.records && response.data.records.length > 1) {
        // Start from second cycle (previous night) as sleep is processed from previous cycle
        for (let i = 1; i < response.data.records.length; i++) {
          const cycle = response.data.records[i];
          try {
            const sleepData = await this.getSleep(cycle.id);
            if (sleepData?.score?.sleep_score) {
              console.log(`Found sleep score ${sleepData.score.sleep_score} for cycle ${cycle.id}`);
              return sleepData.score.sleep_score;
            }
          } catch (error) {
            // Skip cycles without sleep data (404 errors are normal)
            continue;
          }
        }
      }
      
      console.log('No sleep data found in recent cycles');
      return null;
    } catch (error) {
      console.error('Error fetching latest sleep score:', error);
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

      // Get latest sleep data (today or yesterday)
      const sleepData = await this.getLatestSleepData();

      const result: WhoopTodayData = {
        cycle_id: latestCycle.id,
        strain: latestCycle.score?.strain || null,
        recovery_score: recovery?.score?.recovery_score || null,
        hrv: recovery?.score?.hrv_rmssd_milli || null,
        resting_heart_rate: recovery?.score?.resting_heart_rate || null,
        sleep_score: sleepData.sleep_score,
        raw: {
          cycle: latestCycle,
          recovery: recovery,
          sleep: sleepData
        }
      };

      // Store in database for historical tracking
      const today = getTodayDate();
      const dataToStore = {
        date: today,
        cycle_id: result.cycle_id,
        strain: result.strain,
        recovery_score: result.recovery_score,
        hrv: result.hrv,
        resting_heart_rate: result.resting_heart_rate,
        sleep_score: result.sleep_score,
        raw_data: result.raw
      };

      // Log the daily stats before storing
      logDailyStats(dataToStore);
      
      await storage.createOrUpdateWhoopData(dataToStore);
      console.log('WHOOP data retrieved successfully');

      return result;
    } catch (error) {
      console.error('Error fetching WHOOP data:', error);
      return {};
    }
  }
      // Fetch latest cycle first
      const cycle = await this.getLatestCycle();
      if (!cycle) {
        console.log('No cycle data available');
        return {};
      }

      // Fetch recovery and sleep based on cycle ID
      const [recovery, sleep] = await Promise.all([
        this.getRecovery(cycle.id),
        this.getSleep(cycle.id)
      ]);

      // If no sleep data for current cycle, try to get latest available
      let latestSleepScore = null;
      if (!sleep?.score?.sleep_score) {
        console.log('No sleep data for current cycle, fetching latest available...');
        latestSleepScore = await this.getLatestSleepScore();
      }

      console.log('Raw WHOOP data retrieved:');
      console.log('Cycle:', cycle);
      console.log('Recovery:', recovery);
      console.log('WHOOP sleep raw:', sleep);

      const result: WhoopTodayData = {
        cycle_id: cycle.id,
        strain: cycle.score?.strain ?? null,
        recovery_score: recovery?.score?.recovery_score ?? null,
        hrv: recovery?.score?.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? null,
        sleep_score: sleep?.score?.sleep_score ?? latestSleepScore,
        raw: { cycle, recovery, sleep }
      };

      console.log('Processed WHOOP data:', result);
      return result;
    } catch (error: any) {
      console.error('WHOOP API connection failed:', error.message);
      throw new Error('WHOOP API connection failed');
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