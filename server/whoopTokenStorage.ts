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
    // Database-based storage, no initialization needed
  }

  async setToken(userId: string, tokenData: WhoopTokenData) {
    try {
      // Delete existing token for this user
      await db.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
      
      const insertData: InsertWhoopToken = {
        userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : null,
      };

      // Insert new token
      await db.insert(whoopTokens).values(insertData);
      
      console.log(`WHOOP token saved to database for user: ${userId}`);
    } catch (error) {
      console.error('Failed to save WHOOP token to database:', error);
      throw error;
    }
  }

  async getToken(userId: string): Promise<WhoopTokenData | undefined> {
    try {
      const [token] = await db.select().from(whoopTokens).where(eq(whoopTokens.userId, userId));
      
      if (!token) {
        console.log(`Getting token for user: ${userId} found: false`);
        return undefined;
      }

      console.log(`Getting token for user: ${userId} found: true`);
      return {
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expires_at: token.expiresAt ? Math.floor(token.expiresAt.getTime() / 1000) : undefined,
        user_id: token.userId,
      };
    } catch (error) {
      console.error('Failed to get WHOOP token from database:', error);
      return undefined;
    }
  }

  async setDefaultToken(tokenData: WhoopTokenData) {
    await this.setToken('d5fc289b-82a1-4e7c-b6fb-df042cb2c5a5', tokenData);
  }

  async getDefaultToken(): Promise<WhoopTokenData | undefined> {
    return await this.getToken('d5fc289b-82a1-4e7c-b6fb-df042cb2c5a5');
  }

  isTokenValid(token: WhoopTokenData): boolean {
    if (!token.expires_at) return true; // No expiry info, assume valid
    return Date.now() / 1000 < token.expires_at;
  }

  async deleteWhoopToken(userId: string): Promise<void> {
    try {
      await db.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
      console.log(`WHOOP token deleted for user: ${userId}`);
    } catch (error) {
      console.error('Failed to delete WHOOP token:', error);
    }
  }
}

export const whoopTokenStorage = new WhoopTokenStorage();