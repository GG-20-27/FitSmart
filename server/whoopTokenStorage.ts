import fs from 'fs';
import path from 'path';

interface WhoopTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user_id?: string;
}

const TOKEN_FILE = path.join(process.cwd(), 'whoop_tokens.json');

export class WhoopTokenStorage {
  private tokens: Map<string, WhoopTokenData> = new Map();

  constructor() {
    this.loadTokens();
  }

  private loadTokens() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        const tokenData = JSON.parse(data);
        this.tokens = new Map(Object.entries(tokenData));
      }
    } catch (error) {
      console.warn('Failed to load WHOOP tokens:', error);
    }
  }

  private saveTokens() {
    try {
      const tokenData = Object.fromEntries(this.tokens);
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
    } catch (error) {
      console.error('Failed to save WHOOP tokens:', error);
    }
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