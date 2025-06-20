import { db } from './db';
import { whoopTokens, type InsertWhoopToken, type WhoopToken } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface WhoopTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user_id?: string;
}

export class WhoopTokenStorage {
  constructor() {
    // No need to load tokens - using database directly
  }

  setToken(userId: string, tokenData: WhoopTokenData) {
    console.log('Storing WHOOP token for user:', userId);
    console.log('Token data:', { 
      has_access_token: !!tokenData.access_token,
      expires_at: tokenData.expires_at ? new Date(tokenData.expires_at) : 'no expiration'
    });
    this.tokens.set(userId, tokenData);
    this.saveTokens();
    console.log('Token stored successfully, total tokens:', this.tokens.size);
  }

  getToken(userId: string): WhoopTokenData | undefined {
    const token = this.tokens.get(userId);
    console.log('Getting token for user:', userId, 'found:', !!token);
    return token;
  }

  // For simplicity, use default user for now
  setDefaultToken(tokenData: WhoopTokenData) {
    this.setToken('default', tokenData);
  }

  getDefaultToken(): WhoopTokenData | undefined {
    return this.getToken('default');
  }

  isTokenValid(token: WhoopTokenData): boolean {
    if (!token.expires_at) return true; // No expiry info, assume valid
    return Date.now() < token.expires_at;
  }
}

export const whoopTokenStorage = new WhoopTokenStorage();