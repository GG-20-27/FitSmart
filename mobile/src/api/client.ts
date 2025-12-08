import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const AUTH_TOKEN_KEY = 'fitscore_jwt_staging';
const DEV_STATIC_JWT = process.env.EXPO_PUBLIC_STATIC_JWT?.trim() || 
  // @ts-ignore - types for expo config may vary during build/runtime
  (Constants.expoConfig?.extra as any)?.staticJwt ||
  // @ts-ignore - legacy manifest support on device (Expo Go)
  (Constants.manifest?.extra as any)?.staticJwt;

function resolveApiBaseUrl(): string {
  // Try EXPO_PUBLIC_API_URL from app.json first
  // @ts-ignore - types for expo config may vary during build/runtime
  const configUrl = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_URL;
  if (configUrl && configUrl.trim().length > 0) {
    const value = configUrl.trim();
    console.log(`[API] ✅ Using EXPO_PUBLIC_API_URL from app.json: ${value}`);
    return value;
  }

  // Try environment variable
  const envUrl = globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    const value = envUrl.trim();
    console.log(`[API] Using base URL from EXPO_PUBLIC_API_BASE_URL: ${value}`);
    return value;
  }

  // Legacy support
  // @ts-ignore - types for expo config may vary during build/runtime
  const configExtra = (Constants.expoConfig?.extra as any)?.apiBaseUrl;
  if (configExtra) {
    console.log(`[API] Using base URL from expoConfig.extra: ${configExtra}`);
    return configExtra;
  }

  // @ts-ignore - legacy manifest support on device (Expo Go)
  const legacyExtra = (Constants.manifest?.extra as any)?.apiBaseUrl;
  if (legacyExtra) {
    console.log(`[API] Using base URL from manifest.extra: ${legacyExtra}`);
    return legacyExtra;
  }

  // ERROR: No API URL configured!
  console.error('❌ [API] ERROR: No API URL found!');
  console.error('❌ [API] Expected EXPO_PUBLIC_API_URL in mobile/app.json under "extra"');
  console.error('❌ [API] App will not work without a valid API URL');

  throw new Error('API URL not configured. Please set EXPO_PUBLIC_API_URL in mobile/app.json');
}

export const API_BASE_URL = resolveApiBaseUrl();
console.log(`[API] Base URL resolved to ${API_BASE_URL}`);

export async function setAuthToken(token: string) {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken() {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

// Check if user has a manually acquired token (not dev fallback)
export async function hasUserToken(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    return !!token;
  } catch {
    return false;
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    let token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

    // Only use dev fallback if explicitly requested for API calls
    // Don't auto-seed anymore to allow welcome screen to show
    if (!token && DEV_STATIC_JWT) {
      console.log('[API] No stored token, using DEV_STATIC_JWT for API request');
      return DEV_STATIC_JWT;
    }

    return token;
  } catch {
    return null;
  }
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  
  console.log(`[API] Making request to: ${url}`);
  console.log(`[API] Has token: ${!!token}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    
    console.log(`[API] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorText: string;
      try {
        const cloned = response.clone();
        const errorData = await cloned.json();
        errorText = errorData.error || errorData.message || response.statusText;
      } catch {
        errorText = await response.text() || response.statusText;
      }
      
      const errorMessage = `${response.status}: ${errorText}`;
      console.error(`[API] Request failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    try {
      const data = await response.json();
      console.log(`[API] Request successful`);
      return data as T;
    } catch (e) {
      console.error(`[API] Failed to parse JSON response:`, e);
      throw new Error('Invalid response format from server');
    }
  } catch (error) {
    // Better error handling for network issues
    if (error instanceof TypeError && error.message.includes('Network request failed')) {
      console.error(`[API] Network error - Cannot reach ${url}`);
      console.error(`[API] Check: 1) Phone and laptop on same WiFi 2) Backend running 3) IP address correct`);
      throw new Error(`Cannot connect to server at ${API_BASE_URL}. Check network connection.`);
    }
    throw error;
  }
}

// Chat types and helper
export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string }

export async function postChat(messages: ChatMessage[]): Promise<{ reply: string }> {
  return apiRequest<{ reply: string }>(`/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages })
  });
}
