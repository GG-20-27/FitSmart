import { users, meals, whoopData, type User, type InsertUser, type Meal, type InsertMeal, type WhoopData, type InsertWhoopData } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private meals: Map<number, Meal>;
  private whoopData: Map<string, WhoopData>; // keyed by date
  private currentUserId: number;
  private currentMealId: number;
  private currentWhoopId: number;

  constructor() {
    this.users = new Map();
    this.meals = new Map();
    this.whoopData = new Map();
    this.currentUserId = 1;
    this.currentMealId = 1;
    this.currentWhoopId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createMeal(insertMeal: InsertMeal): Promise<Meal> {
    const id = this.currentMealId++;
    const meal: Meal = { 
      ...insertMeal, 
      id, 
      uploadedAt: new Date()
    };
    this.meals.set(id, meal);
    return meal;
  }

  async getMealsByDate(date: string): Promise<Meal[]> {
    return Array.from(this.meals.values()).filter(
      (meal) => meal.date === date
    );
  }

  async getAllMeals(): Promise<Meal[]> {
    return Array.from(this.meals.values());
  }

  async getWhoopDataByDate(date: string): Promise<WhoopData | undefined> {
    return this.whoopData.get(date);
  }

  async createOrUpdateWhoopData(insertData: InsertWhoopData): Promise<WhoopData> {
    const existing = this.whoopData.get(insertData.date);
    
    if (existing) {
      const updated: WhoopData = {
        ...existing,
        ...insertData,
        lastSync: new Date()
      };
      this.whoopData.set(insertData.date, updated);
      return updated;
    } else {
      const id = this.currentWhoopId++;
      const data: WhoopData = {
        ...insertData,
        id,
        lastSync: new Date()
      };
      this.whoopData.set(insertData.date, data);
      return data;
    }
  }
}

export const storage = new MemStorage();
