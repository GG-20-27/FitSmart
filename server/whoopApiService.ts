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

  async getTodaysData(): Promise<WhoopTodayData> {
    const tokenData = await whoopTokenStorage.getDefaultToken();
    
    if (!tokenData?.access_token) {
      throw new Error('Missing WHOOP access token');
    }

    console.log('Fetching WHOOP data with valid token...');

    try {
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
        sleep_score: sleep?.score?.sleep_score ?? null,
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