import { users, meals, trainingData, whoopData, userCalendars, fitlookDaily, dailyCheckins, fitroastWeekly, userContext, improvementPlans, planHabits, habitCheckins, type User, type InsertUser, type Meal, type InsertMeal, type TrainingData, type InsertTrainingData, type WhoopData, type InsertWhoopData, type UserCalendar, type InsertUserCalendar, type FitlookDaily, type InsertFitlookDaily, type DailyCheckin, type InsertDailyCheckin, type FitroastWeekly, type InsertFitroastWeekly, type UserContext, type InsertUserContext, type ImprovementPlan, type PlanHabit, type HabitCheckin } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Meal operations
  createMeal(meal: InsertMeal): Promise<Meal>;
  getMealsByDate(date: string): Promise<Meal[]>;
  getAllMeals(): Promise<Meal[]>;
  getMealsByUserAndDate(userId: string, date: string): Promise<Meal[]>;
  getMealById(id: number): Promise<Meal | undefined>;
  updateMeal(id: number, data: Partial<InsertMeal>): Promise<Meal>;
  deleteMeal(id: number): Promise<void>;

  // Training data operations
  createTrainingData(data: InsertTrainingData): Promise<TrainingData>;
  getTrainingDataByUserAndDate(userId: string, date: string): Promise<TrainingData[]>;
  updateTrainingData(id: number, data: Partial<InsertTrainingData>): Promise<TrainingData>;
  deleteTrainingData(id: number): Promise<void>;

  // WHOOP data operations
  getWhoopDataByDate(date: string): Promise<WhoopData | undefined>;
  getWhoopDataByUserAndDate(userId: string, date: string): Promise<WhoopData | undefined>;
  createOrUpdateWhoopData(data: InsertWhoopData): Promise<WhoopData>;
  upsertWhoopData(data: InsertWhoopData): Promise<WhoopData>;
  deleteWhoopDataByUserAndDate(userId: string, date: string): Promise<void>;

  // Calendar operations
  getUserCalendars(userId: string): Promise<UserCalendar[]>;
  createUserCalendar(data: InsertUserCalendar): Promise<UserCalendar>;
  deleteUserCalendar(id: number): Promise<void>;
  updateUserCalendar(id: number, data: Partial<InsertUserCalendar>): Promise<UserCalendar>;

  // FitLook operations
  getFitlookByUserAndDate(userId: string, dateLocal: string): Promise<FitlookDaily | undefined>;
  createFitlook(data: InsertFitlookDaily): Promise<FitlookDaily>;
  deleteFitlookByUserAndDate(userId: string, dateLocal: string): Promise<void>;

  // Daily checkin operations
  getCheckinByUserAndDate(userId: string, dateLocal: string): Promise<DailyCheckin | undefined>;
  createCheckin(data: InsertDailyCheckin): Promise<DailyCheckin>;

  // FitRoast operations
  getFitroastByUserAndWeek(userId: string, weekEnd: string): Promise<FitroastWeekly | undefined>;
  getLatestFitroast(userId: string): Promise<FitroastWeekly | undefined>;
  createFitroast(data: InsertFitroastWeekly): Promise<FitroastWeekly>;
  deleteFitroastByUserAndWeek(userId: string, weekEnd: string): Promise<void>;

  // User context operations
  getUserContext(userId: string): Promise<UserContext | undefined>;
  upsertUserContext(userId: string, data: Partial<InsertUserContext>): Promise<UserContext>;

  // Improvement plan operations
  getActivePlan(userId: string): Promise<ImprovementPlan | undefined>;
  createActivePlan(userId: string, pillar: string): Promise<ImprovementPlan>;
  completePlan(id: number, rollingAvg: number): Promise<ImprovementPlan>;
  getCompletedPlans(userId: string): Promise<ImprovementPlan[]>;

  // Plan habits operations
  savePlanHabits(userId: string, planId: number, habits: { habitKey: string; label: string; description?: string }[]): Promise<void>;
  getPlanHabits(planId: number): Promise<PlanHabit[]>;

  // Habit checkin operations
  upsertHabitCheckin(userId: string, habitKey: string, date: string, checked: boolean): Promise<void>;
  getHabitCheckinsByDate(userId: string, date: string): Promise<HabitCheckin[]>;
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

  async getMealsByUserAndDate(userId: string, date: string): Promise<Meal[]> {
    return await db.select().from(meals)
      .where(and(eq(meals.userId, userId), eq(meals.date, date)));
  }

  async updateMeal(id: number, data: Partial<InsertMeal>): Promise<Meal> {
    const [updated] = await db
      .update(meals)
      .set(data)
      .where(eq(meals.id, id))
      .returning();
    return updated;
  }

  async getMealById(id: number): Promise<Meal | undefined> {
    const [meal] = await db.select().from(meals).where(eq(meals.id, id));
    return meal;
  }

  async deleteMeal(id: number): Promise<void> {
    await db.delete(meals).where(eq(meals.id, id));
  }

  // Training data operations
  async createTrainingData(insertData: InsertTrainingData): Promise<TrainingData> {
    const [data] = await db
      .insert(trainingData)
      .values(insertData)
      .returning();
    return data;
  }

  async getTrainingDataByUserAndDate(userId: string, date: string): Promise<TrainingData[]> {
    return await db.select().from(trainingData)
      .where(and(eq(trainingData.userId, userId), eq(trainingData.date, date)));
  }

  async updateTrainingData(id: number, data: Partial<InsertTrainingData>): Promise<TrainingData> {
    const [updated] = await db
      .update(trainingData)
      .set(data)
      .where(eq(trainingData.id, id))
      .returning();
    return updated;
  }

  async deleteTrainingData(id: number): Promise<void> {
    await db.delete(trainingData).where(eq(trainingData.id, id));
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

  async deleteWhoopDataByUserAndDate(userId: string, date: string): Promise<void> {
    await db.delete(whoopData).where(and(eq(whoopData.userId, userId), eq(whoopData.date, date)));
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
  // FitLook operations
  async getFitlookByUserAndDate(userId: string, dateLocal: string): Promise<FitlookDaily | undefined> {
    const [row] = await db.select().from(fitlookDaily)
      .where(and(eq(fitlookDaily.userId, userId), eq(fitlookDaily.dateLocal, dateLocal)));
    return row || undefined;
  }

  async createFitlook(data: InsertFitlookDaily): Promise<FitlookDaily> {
    const [row] = await db.insert(fitlookDaily).values(data).returning();
    return row;
  }

  async deleteFitlookByUserAndDate(userId: string, dateLocal: string): Promise<void> {
    await db.delete(fitlookDaily)
      .where(and(eq(fitlookDaily.userId, userId), eq(fitlookDaily.dateLocal, dateLocal)));
  }

  // Daily checkin operations
  async getCheckinByUserAndDate(userId: string, dateLocal: string): Promise<DailyCheckin | undefined> {
    const [row] = await db.select().from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.dateLocal, dateLocal)));
    return row || undefined;
  }

  async createCheckin(data: InsertDailyCheckin): Promise<DailyCheckin> {
    const [row] = await db.insert(dailyCheckins).values(data).returning();
    return row;
  }

  // FitRoast operations
  async getFitroastByUserAndWeek(userId: string, weekEnd: string): Promise<FitroastWeekly | undefined> {
    const [row] = await db.select().from(fitroastWeekly)
      .where(and(eq(fitroastWeekly.userId, userId), eq(fitroastWeekly.weekEnd, weekEnd)));
    return row || undefined;
  }

  async getLatestFitroast(userId: string): Promise<FitroastWeekly | undefined> {
    const [row] = await db.select().from(fitroastWeekly)
      .where(eq(fitroastWeekly.userId, userId))
      .orderBy(desc(fitroastWeekly.weekEnd))
      .limit(1);
    return row || undefined;
  }

  async createFitroast(data: InsertFitroastWeekly): Promise<FitroastWeekly> {
    const [row] = await db.insert(fitroastWeekly).values(data).returning();
    return row;
  }

  async deleteFitroastByUserAndWeek(userId: string, weekEnd: string): Promise<void> {
    await db.delete(fitroastWeekly)
      .where(and(eq(fitroastWeekly.userId, userId), eq(fitroastWeekly.weekEnd, weekEnd)));
  }

  // User context operations
  async getUserContext(userId: string): Promise<UserContext | undefined> {
    const [row] = await db.select().from(userContext).where(eq(userContext.userId, userId));
    return row || undefined;
  }

  async upsertUserContext(userId: string, data: Partial<InsertUserContext>): Promise<UserContext> {
    const existing = await this.getUserContext(userId);
    if (existing) {
      const [row] = await db.update(userContext)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userContext.userId, userId))
        .returning();
      return row;
    } else {
      const [row] = await db.insert(userContext)
        .values({ userId, ...data } as InsertUserContext)
        .returning();
      return row;
    }
  }

  // Improvement plan operations
  async getActivePlan(userId: string): Promise<ImprovementPlan | undefined> {
    const [row] = await db.select().from(improvementPlans)
      .where(and(eq(improvementPlans.userId, userId), eq(improvementPlans.status, 'active')));
    return row || undefined;
  }

  async getAllActivePlans(userId: string): Promise<ImprovementPlan[]> {
    return await db.select().from(improvementPlans)
      .where(and(eq(improvementPlans.userId, userId), eq(improvementPlans.status, 'active')));
  }

  async createActivePlan(userId: string, pillar: string): Promise<ImprovementPlan> {
    const [row] = await db.insert(improvementPlans)
      .values({ userId, pillar, status: 'active' })
      .returning();
    return row;
  }

  async completePlan(id: number, rollingAvg: number): Promise<ImprovementPlan> {
    const [row] = await db.update(improvementPlans)
      .set({ status: 'completed', completedAt: new Date(), rollingAvgAtCompletion: rollingAvg })
      .where(eq(improvementPlans.id, id))
      .returning();
    return row;
  }

  async getCompletedPlans(userId: string): Promise<ImprovementPlan[]> {
    return await db.select().from(improvementPlans)
      .where(and(eq(improvementPlans.userId, userId), eq(improvementPlans.status, 'completed')));
  }

  // Plan habits operations
  async savePlanHabits(userId: string, planId: number, habits: { habitKey: string; label: string; description?: string }[]): Promise<void> {
    if (habits.length === 0) return;
    await db.insert(planHabits)
      .values(habits.map(h => ({ userId, planId, habitKey: h.habitKey, label: h.label, description: h.description ?? null })))
      .onConflictDoNothing();
  }

  async getPlanHabits(planId: number): Promise<PlanHabit[]> {
    return await db.select().from(planHabits).where(eq(planHabits.planId, planId));
  }

  // Habit checkin operations
  async upsertHabitCheckin(userId: string, habitKey: string, date: string, checked: boolean): Promise<void> {
    const [existing] = await db.select({ id: habitCheckins.id })
      .from(habitCheckins)
      .where(and(eq(habitCheckins.userId, userId), eq(habitCheckins.habitKey, habitKey), eq(habitCheckins.date, date)));
    if (existing) {
      await db.update(habitCheckins).set({ checked }).where(eq(habitCheckins.id, existing.id));
    } else {
      await db.insert(habitCheckins).values({ userId, habitKey, date, checked });
    }
  }

  async getHabitCheckinsByDate(userId: string, date: string): Promise<HabitCheckin[]> {
    return await db.select().from(habitCheckins)
      .where(and(eq(habitCheckins.userId, userId), eq(habitCheckins.date, date)));
  }
}

export const storage = new DatabaseStorage();
