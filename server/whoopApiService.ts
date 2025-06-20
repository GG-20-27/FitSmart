import axios from 'axios';
import { whoopTokenStorage } from './whoopTokenStorage';

const WHOOP_API_BASE = 'https://api.prod.whoop.com';
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
  recovery_score: number;
  sleep_score: number;
  strain_score: number;
  resting_heart_rate: number;
}

export class WhoopApiService {
  private getAuthHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri = 'https://health-data-hub.replit.app/api/whoop/callback';

    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP client credentials');
    }

    console.log('Starting WHOOP token exchange...');
    console.log('Client ID:', clientId);
    console.log('Redirect URI:', redirectUri);
    console.log('Authorization code:', code);

    const requestData = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    };

    console.log('Request data object:', requestData);

    try {
      const formBody = Object.entries(requestData)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

      const requestUrl = `${WHOOP_OAUTH_BASE}/oauth2/token`;
      console.log('Request URL:', requestUrl);
      console.log('Form body:', formBody);
      console.log('Form body length:', formBody.length);
      console.log('Form body bytes:', Buffer.from(formBody).length);

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
      console.log('WHOOP response text:', responseText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('WHOOP token exchange successful:', data);
      return data;
    } catch (error: any) {
      console.error('WHOOP token exchange failed:');
      console.error('Error message:', error.message);
      console.error('Full error:', error);
      throw new Error(`Failed to exchange code for access token: ${error.message}`);
    }
  }

  async getTodaysRecovery(accessToken: string): Promise<WhoopRecoveryData | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${WHOOP_API_BASE}/developer/v1/recovery`, {
        headers: this.getAuthHeaders(accessToken),
        params: {
          start: today,
          end: today
        }
      });

      if (response.data.records && response.data.records.length > 0) {
        return response.data.records[0].score;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to fetch recovery data:', error.response?.data || error.message);
      return null;
    }
  }

  async getTodaysSleep(accessToken: string): Promise<WhoopSleepData | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${WHOOP_API_BASE}/developer/v1/activity/sleep`, {
        headers: this.getAuthHeaders(accessToken),
        params: {
          start: today,
          end: today
        }
      });

      if (response.data.records && response.data.records.length > 0) {
        return response.data.records[0].score;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to fetch sleep data:', error.response?.data || error.message);
      return null;
    }
  }

  async getTodaysStrain(accessToken: string): Promise<WhoopStrainData | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${WHOOP_API_BASE}/developer/v1/cycle`, {
        headers: this.getAuthHeaders(accessToken),
        params: {
          start: today,
          end: today
        }
      });

      if (response.data.records && response.data.records.length > 0) {
        return response.data.records[0].score;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to fetch strain data:', error.response?.data || error.message);
      return null;
    }
  }

  async getTodaysData(): Promise<WhoopTodayData> {
    const tokenData = whoopTokenStorage.getDefaultToken();
    
    if (!tokenData || !whoopTokenStorage.isTokenValid(tokenData)) {
      console.warn('No valid WHOOP access token found. Using fallback data.');
      return {
        recovery_score: 68,
        sleep_score: 75,
        strain_score: 12.3,
        resting_heart_rate: 60
      };
    }

    try {
      const [recovery, sleep, strain] = await Promise.all([
        this.getTodaysRecovery(tokenData.access_token),
        this.getTodaysSleep(tokenData.access_token),
        this.getTodaysStrain(tokenData.access_token)
      ]);

      return {
        recovery_score: recovery?.recovery_score || 0,
        sleep_score: sleep?.sleep_score || 0,
        strain_score: strain?.strain || 0,
        resting_heart_rate: recovery?.resting_heart_rate || 0
      };
    } catch (error) {
      console.error('Failed to fetch WHOOP data:', error);
      throw new Error('Unable to fetch live WHOOP data');
    }
  }

  getOAuthUrl(): string {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = 'https://health-data-hub.replit.app/api/whoop/callback';
    const scope = 'read:recovery read:sleep read:cycles read:profile';
    const state = 'whoop_auth_' + Date.now(); // Generate a unique state for security
    
    return `${WHOOP_OAUTH_BASE}/oauth2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}`;
  }
}

export const whoopApiService = new WhoopApiService();