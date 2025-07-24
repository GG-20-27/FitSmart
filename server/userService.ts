import { db } from './db';
import { users, whoopTokens, type InsertUser, type User, type InsertWhoopToken } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class UserService {
  // Create WHOOP OAuth user (no password needed)
  async createWhoopUser(id: string, email: string, whoopUserId: string): Promise<User> {
    try {
      const insertData: InsertUser = { 
        id,
        email,
        whoopUserId 
      };
      const [user] = await db.insert(users).values(insertData).returning();
      console.log(`Created new WHOOP user: ${email} with ID: ${user.id}`);
      return user;
    } catch (error) {
      console.error('Failed to create WHOOP user:', error);
      throw new Error(`Failed to create WHOOP user: ${error}`);
    }
  }

  // WHOOP OAuth doesn't use passwords - users authenticate via WHOOP only
  async validatePassword(email: string, password: string): Promise<User | null> {
    console.log(`[AUTH] Password validation not supported for WHOOP OAuth - redirecting to WHOOP login`);
    return null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    } catch (error) {
      console.error('Failed to get user by email:', error);
      return undefined;
    }
  }

  async getUserById(userId: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      return user;
    } catch (error) {
      console.error('Failed to get user by ID:', error);
      return undefined;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      console.error('Failed to get all users:', error);
      return [];
    }
  }

  async addWhoopToken(userId: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<void> {
    try {
      // Delete existing token for this user
      await db.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
      
      // Insert new token
      const insertData: InsertWhoopToken = {
        userId,
        accessToken,
        refreshToken: refreshToken || null,
        expiresAt: expiresAt || null,
      };
      
      await db.insert(whoopTokens).values(insertData);
      console.log(`WHOOP token added for user: ${userId}`);
    } catch (error) {
      console.error('Failed to add WHOOP token:', error);
      throw new Error(`Failed to add WHOOP token: ${error}`);
    }
  }

  async getWhoopToken(userId: string) {
    try {
      const [token] = await db.select().from(whoopTokens).where(eq(whoopTokens.userId, userId));
      return token;
    } catch (error) {
      console.error('Failed to get WHOOP token:', error);
      return undefined;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await db.delete(users).where(eq(users.id, userId));
      console.log(`Deleted user: ${userId}`);
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw new Error(`Failed to delete user: ${error}`);
    }
  }
}

export const userService = new UserService();