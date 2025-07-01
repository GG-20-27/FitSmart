import { users, meals, whoopData, type User, type InsertUser, type Meal, type InsertMeal, type WhoopData, type InsertWhoopData } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Meal operations
  createMeal(meal: InsertMeal): Promise<Meal>;
  getMealsByDate(date: string): Promise<Meal[]>;
  getAllMeals(): Promise<Meal[]>;
  
  // WHOOP data operations
  getWhoopDataByDate(date: string): Promise<WhoopData | undefined>;
  createOrUpdateWhoopData(data: InsertWhoopData): Promise<WhoopData>;
  
  // WHOOP token operations
  getWhoopToken(userId: string): Promise<WhoopToken | undefined>;
  createOrUpdateWhoopToken(data: InsertWhoopToken): Promise<WhoopToken>;
  deleteWhoopToken(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createMeal(insertMeal: InsertMeal): Promise<Meal> {
    const [meal] = await db
      .insert(meals)
      .values(insertMeal)
      .returning();
    return meal;
  }

  async getMealsByDate(date: string): Promise<Meal[]> {
    return await db.select().from(meals).where(eq(meals.date, date));
  }

  async getAllMeals(): Promise<Meal[]> {
    return await db.select().from(meals);
  }

  async getWhoopDataByDate(date: string): Promise<WhoopData | undefined> {
    const [data] = await db.select().from(whoopData).where(eq(whoopData.date, date));
    return data || undefined;
  }

  async createOrUpdateWhoopData(insertData: InsertWhoopData): Promise<WhoopData> {
    const existing = await this.getWhoopDataByDate(insertData.date);
    
    if (existing) {
      const [updated] = await db
        .update(whoopData)
        .set({
          ...insertData,
          lastSync: new Date()
        })
        .where(eq(whoopData.date, insertData.date))
        .returning();
      return updated;
    } else {
      const [data] = await db
        .insert(whoopData)
        .values(insertData)
        .returning();
      return data;
    }
  }
}

export const storage = new DatabaseStorage();
