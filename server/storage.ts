import { users, meals, whoopData, userCalendars, type User, type InsertUser, type Meal, type InsertMeal, type WhoopData, type InsertWhoopData, type UserCalendar, type InsertUserCalendar } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Meal operations
  createMeal(meal: InsertMeal): Promise<Meal>;
  getMealsByDate(date: string): Promise<Meal[]>;
  getAllMeals(): Promise<Meal[]>;
  
  // WHOOP data operations
  getWhoopDataByDate(date: string): Promise<WhoopData | undefined>;
  getWhoopDataByUserAndDate(userId: string, date: string): Promise<WhoopData | undefined>;
  createOrUpdateWhoopData(data: InsertWhoopData): Promise<WhoopData>;
  upsertWhoopData(data: InsertWhoopData): Promise<WhoopData>;
  
  // Calendar operations
  getUserCalendars(userId: string): Promise<UserCalendar[]>;
  createUserCalendar(data: InsertUserCalendar): Promise<UserCalendar>;
  deleteUserCalendar(id: number): Promise<void>;
  updateUserCalendar(id: number, data: Partial<InsertUserCalendar>): Promise<UserCalendar>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  async getWhoopDataByUserAndDate(userId: string, date: string): Promise<WhoopData | undefined> {
    const [data] = await db.select().from(whoopData)
      .where(and(eq(whoopData.userId, userId), eq(whoopData.date, date)));
    return data || undefined;
  }

  async createOrUpdateWhoopData(insertData: InsertWhoopData): Promise<WhoopData> {
    const existing = await this.getWhoopDataByUserAndDate(insertData.userId, insertData.date);
    
    if (existing) {
      const [updated] = await db
        .update(whoopData)
        .set({
          ...insertData,
          lastSync: new Date()
        })
        .where(and(eq(whoopData.userId, insertData.userId), eq(whoopData.date, insertData.date)))
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

  async upsertWhoopData(insertData: InsertWhoopData): Promise<WhoopData> {
    return this.createOrUpdateWhoopData(insertData);
  }

  // Calendar operations
  async getUserCalendars(userId: string): Promise<UserCalendar[]> {
    return await db.select().from(userCalendars).where(eq(userCalendars.userId, userId));
  }

  async createUserCalendar(data: InsertUserCalendar): Promise<UserCalendar> {
    const [calendar] = await db
      .insert(userCalendars)
      .values(data)
      .returning();
    return calendar;
  }

  async deleteUserCalendar(id: number): Promise<void> {
    await db.delete(userCalendars).where(eq(userCalendars.id, id));
  }

  async updateUserCalendar(id: number, data: Partial<InsertUserCalendar>): Promise<UserCalendar> {
    const [calendar] = await db
      .update(userCalendars)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userCalendars.id, id))
      .returning();
    return calendar;
  }
}

export const storage = new DatabaseStorage();
