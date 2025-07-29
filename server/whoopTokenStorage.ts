import { db } from './db';
import { whoopTokens, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface WhoopTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user_id?: string;
}

export class WhoopTokenStorage {
  async getToken(userId: string): Promise<WhoopTokenData | null> {
    try {
      const [token] = await db.select().from(whoopTokens).where(eq(whoopTokens.userId, userId));
      if (!token) {
        return null;
      }
      
      return {
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expires_at: token.expiresAt || undefined,
        user_id: userId
      };
    } catch (error) {
      console.error('Error fetching WHOOP token:', error);
      return null;
    }
  }

  async setToken(userId: string, tokenData: WhoopTokenData): Promise<void> {
    try {
      // First ensure the user exists
      const existingUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (existingUser.length === 0) {
        throw new Error(`User ${userId} does not exist. Create user first.`);
      }

      // Upsert the token
      await db.insert(whoopTokens).values({
        userId: userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: tokenData.expires_at || null,
      }).onConflictDoUpdate({
        target: whoopTokens.userId,
        set: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt: tokenData.expires_at || null,
          updatedAt: new Date(),
        },
      });

      console.log(`WHOOP token stored successfully for user: ${userId}`);
    } catch (error) {
      console.error('Error storing WHOOP token:', error);
      throw error;
    }
  }

  async deleteToken(userId: string): Promise<void> {
    try {
      await db.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
      console.log(`WHOOP token deleted for user: ${userId}`);
    } catch (error) {
      console.error('Error deleting WHOOP token:', error);
      throw error;
    }
  }

  isTokenValid(tokenData: WhoopTokenData): boolean {
    if (!tokenData || !tokenData.access_token) {
      return false;
    }
    
    if (!tokenData.expires_at) {
      return true; // No expiration set, assume valid
    }
    
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 5 * 60; // 5 minutes buffer
    return now < (tokenData.expires_at - bufferTime);
  }

  async getAllTokens(): Promise<Array<{ userId: string; tokenData: WhoopTokenData }>> {
    try {
      const tokens = await db.select().from(whoopTokens);
      return tokens.map(token => ({
        userId: token.userId,
        tokenData: {
          access_token: token.accessToken,
          refresh_token: token.refreshToken || undefined,
          expires_at: token.expiresAt || undefined,
          user_id: token.userId
        }
      }));
    } catch (error) {
      console.error('Error fetching all tokens:', error);
      return [];
    }
  }

  async refreshWhoopToken(userId: string, refreshToken: string): Promise<WhoopTokenData | null> {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing WHOOP OAuth credentials');
    }

    try {
      const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: HTTP ${response.status} - ${errorText}`);
      }

      const tokenResponse = await response.json();
      
      const newTokenData: WhoopTokenData = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token || refreshToken,
        expires_at: tokenResponse.expires_in ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in : undefined,
        user_id: userId
      };

      // Store the refreshed token
      await this.setToken(userId, newTokenData);
      
      console.log(`WHOOP token refreshed successfully for user: ${userId}`);
      return newTokenData;
    } catch (error) {
      console.error(`Failed to refresh WHOOP token for user ${userId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const whoopTokenStorage = new WhoopTokenStorage();