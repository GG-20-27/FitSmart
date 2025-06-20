import axios from 'axios';
import { whoopTokenStorage } from './whoopTokenStorage';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
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
      // Use a wider date range to ensure we capture available data
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startDate = weekAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      
      console.log('Fetching WHOOP recovery data for date range:', startDate, 'to', endDate);
      
      // Try the actual working WHOOP API v1 endpoints based on documentation
      const endpoints = [
        { url: `${WHOOP_API_BASE}/v1/recovery`, name: 'Recovery' },
        { url: `${WHOOP_API_BASE}/v1/cycle`, name: 'Physiological Cycle' },
        { url: `https://api.whoop.com/developer/v1/recovery`, name: 'Recovery Alt' },
        { url: `https://api.whoop.com/developer/v1/cycle`, name: 'Cycle Alt' }
      ];
      
      for (const { url, name } of endpoints) {
        try {
          console.log(`Trying ${name} endpoint:`, url);
          const response = await axios.get(url, {
            headers: this.getAuthHeaders(accessToken),
            params: {
              start: startDate,
              end: endDate,
              limit: 10
            }
          });

          console.log(`${name} endpoint SUCCESS - Status:`, response.status);
          console.log(`${name} response structure:`, Object.keys(response.data));
          console.log(`${name} response data:`, JSON.stringify(response.data, null, 2));

          if (response.data && (response.data.records || response.data.data || response.data.length > 0)) {
            const records = response.data.records || response.data.data || response.data;
            if (records && records.length > 0) {
              const record = records[records.length - 1]; // Get most recent
              console.log(`${name} record found:`, JSON.stringify(record, null, 2));
              
              return {
                recovery_score: record.score?.recovery_score || record.recovery_score || 0,
                resting_heart_rate: record.score?.resting_heart_rate || record.resting_heart_rate || 0,
                hrv_rmssd_milli: record.score?.hrv_rmssd_milli || record.hrv_rmssd_milli || 0,
                spo2_percentage: record.score?.spo2_percentage || record.spo2_percentage || 0,
                skin_temp_celsius: record.score?.skin_temp_celsius || record.skin_temp_celsius || 0
              };
            }
          }
        } catch (endpointError: any) {
          console.log(`${name} endpoint failed - Status:`, endpointError.response?.status, 'Error:', endpointError.response?.data || endpointError.message);
          continue;
        }
      }
      
      console.log('No recovery data found from any endpoint');
      return null;
    } catch (error: any) {
      console.error('Failed to fetch recovery data:', error.message);
      return null;
    }
  }

  async getTodaysSleep(accessToken: string): Promise<WhoopSleepData | null> {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      console.log('Fetching WHOOP sleep data for date range:', yesterdayStr, 'to', todayStr);
      
      const response = await axios.get(`${WHOOP_API_BASE}/v1/activity/sleep`, {
        headers: this.getAuthHeaders(accessToken),
        params: {
          start: yesterdayStr,
          end: todayStr,
          limit: 1
        }
      });

      console.log('WHOOP sleep response status:', response.status);
      console.log('WHOOP sleep response:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.records && response.data.records.length > 0) {
        const record = response.data.records[0];
        console.log('Sleep record found:', record);
        return {
          sleep_score: record.score?.stage_summary?.sleep_performance_percentage || record.score?.sleep_performance_percentage || 0,
          stage_summary: record.score?.stage_summary || {
            total_in_bed_time_milli: 0,
            total_awake_time_milli: 0,
            total_no_data_time_milli: 0,
            total_light_sleep_time_milli: 0,
            total_slow_wave_sleep_time_milli: 0,
            total_rem_sleep_time_milli: 0
          }
        };
      }
      
      console.log('No sleep records found in response');
      return null;
    } catch (error: any) {
      console.error('Failed to fetch sleep data - Status:', error.response?.status);
      console.error('Failed to fetch sleep data - Response:', error.response?.data);
      console.error('Failed to fetch sleep data - Error:', error.message);
      return null;
    }
  }

  async getTodaysStrain(accessToken: string): Promise<WhoopStrainData | null> {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      console.log('Fetching WHOOP strain data for date range:', yesterdayStr, 'to', todayStr);
      
      const response = await axios.get(`${WHOOP_API_BASE}/v1/cycle`, {
        headers: this.getAuthHeaders(accessToken),
        params: {
          start: yesterdayStr,
          end: todayStr,
          limit: 1
        }
      });

      console.log('WHOOP strain response status:', response.status);
      console.log('WHOOP strain response:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.records && response.data.records.length > 0) {
        const record = response.data.records[0];
        console.log('Strain record found:', record);
        return {
          strain: record.score?.strain || 0,
          kilojoule: record.score?.kilojoule || 0,
          average_heart_rate: record.score?.average_heart_rate || 0,
          max_heart_rate: record.score?.max_heart_rate || 0
        };
      }
      
      console.log('No strain records found in response');
      return null;
    } catch (error: any) {
      console.error('Failed to fetch strain data - Status:', error.response?.status);
      console.error('Failed to fetch strain data - Response:', error.response?.data);
      console.error('Failed to fetch strain data - Error:', error.message);
      return null;
    }
  }

  async getTodaysData(): Promise<WhoopTodayData> {
    const tokenData = await whoopTokenStorage.getDefaultToken();
    
    if (!tokenData || !whoopTokenStorage.isTokenValid(tokenData)) {
      console.warn('No valid WHOOP access token found.');
      throw new Error('WHOOP authentication required');
    }

    console.log('Fetching WHOOP data with valid token...');

    // First, test if the API connection works by checking user profile
    try {
      const userResponse = await axios.get(`${WHOOP_API_BASE}/v1/user/profile/basic`, {
        headers: this.getAuthHeaders(tokenData.access_token)
      });
      console.log('WHOOP user profile test successful:', userResponse.status);
    } catch (error: any) {
      console.error('WHOOP user profile test failed:', error.response?.status, error.response?.data);
      // Continue with data fetching even if profile fails
    }

    try {
      const [recovery, sleep, strain] = await Promise.all([
        this.getTodaysRecovery(tokenData.access_token),
        this.getTodaysSleep(tokenData.access_token),
        this.getTodaysStrain(tokenData.access_token)
      ]);

      console.log('Raw WHOOP data retrieved:');
      console.log('Recovery:', recovery);
      console.log('Sleep:', sleep);
      console.log('Strain:', strain);

      const result = {
        recovery_score: recovery?.recovery_score || 0,
        sleep_score: sleep?.sleep_score || 0,
        strain_score: strain?.strain || 0,
        resting_heart_rate: recovery?.resting_heart_rate || 0
      };

      console.log('Processed WHOOP data:', result);

      // If all values are 0, check if it's an API access issue
      if (result.recovery_score === 0 && result.sleep_score === 0 && result.strain_score === 0 && result.resting_heart_rate === 0) {
        console.warn('All WHOOP values are 0 - this could indicate:');
        console.warn('1. No data available for today');
        console.warn('2. API endpoint access issues');
        console.warn('3. Insufficient OAuth scopes');
      }

      return result;
    } catch (error) {
      console.error('Failed to fetch WHOOP data:', error);
      throw new Error('Unable to fetch live WHOOP data');
    }
  }

  getOAuthUrl(): string {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = 'https://health-data-hub.replit.app/api/whoop/callback';
    const scope = 'read:recovery read:sleep read:cycles read:profile read:workout';
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