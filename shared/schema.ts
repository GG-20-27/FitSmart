import { pgTable, text, serial, integer, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// WHOOP OAuth-based multi-user support with text user IDs
export const users = pgTable("users", {
  id: text("id").primaryKey(), // WHOOP user ID like "whoop_25283528"
  email: text("email").notNull().unique(),
  whoopUserId: text("whoop_user_id").notNull(), // Original WHOOP numeric ID
  role: text("role").notNull().default("user"), // "user" or "admin"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const whoopTokens = pgTable("whoop_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const meals = pgTable("meals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
});

export const whoopData = pgTable("whoop_data", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD format
  recoveryScore: integer("recovery_score").notNull(),
  sleepScore: integer("sleep_score").notNull(),
  strainScore: integer("strain_score").notNull(), // stored as integer * 10 for precision
  restingHeartRate: integer("resting_heart_rate").notNull(),
  lastSync: timestamp("last_sync").defaultNow().notNull(),
});

export const userCalendars = pgTable("user_calendars", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  calendarUrl: text("calendar_url").notNull(),
  calendarName: text("calendar_name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sleep Challenge Tables
export const sleepChallenges = pgTable("sleep_challenges", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  challengeType: text("challenge_type").notNull(), // 'weekly', 'monthly', 'custom'
  title: text("title").notNull(),
  description: text("description"),
  targetSleepHours: integer("target_sleep_hours").notNull(), // Target * 10 (7.5 hours = 75)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  completedDays: integer("completed_days").default(0).notNull(),
  totalDays: integer("total_days").notNull(),
  rewardPoints: integer("reward_points").default(0).notNull(),
  badgeEarned: text("badge_earned"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sleepChallengeProgress = pgTable("sleep_challenge_progress", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull().references(() => sleepChallenges.id, { onDelete: 'cascade' }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD format
  sleepHours: integer("sleep_hours"), // Actual sleep * 10
  targetMet: boolean("target_met").default(false).notNull(),
  pointsEarned: integer("points_earned").default(0).notNull(),
  bonusMultiplier: integer("bonus_multiplier").default(1).notNull(), // For streak bonuses
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userRewards = pgTable("user_rewards", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  totalPoints: integer("total_points").default(0).notNull(),
  lifetimePoints: integer("lifetime_points").default(0).notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  badges: text("badges").array().default([]).notNull(), // Array of earned badges
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  whoopUserId: true,
  role: true,
});

export const insertMealSchema = createInsertSchema(meals).omit({
  id: true,
  uploadedAt: true,
});

export const insertWhoopDataSchema = createInsertSchema(whoopData).omit({
  id: true,
  lastSync: true,
});

export const insertWhoopTokenSchema = createInsertSchema(whoopTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WhoopToken = typeof whoopTokens.$inferSelect;
export type InsertWhoopToken = typeof whoopTokens.$inferInsert;

export const insertUserCalendarSchema = createInsertSchema(userCalendars).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type Meal = typeof meals.$inferSelect;
export type InsertWhoopData = z.infer<typeof insertWhoopDataSchema>;
export type WhoopData = typeof whoopData.$inferSelect;
export type InsertWhoopToken = z.infer<typeof insertWhoopTokenSchema>;
export type WhoopToken = typeof whoopTokens.$inferSelect;
export type InsertUserCalendar = z.infer<typeof insertUserCalendarSchema>;
export type UserCalendar = typeof userCalendars.$inferSelect;

// Sleep Challenge schemas
export const insertSleepChallengeSchema = createInsertSchema(sleepChallenges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSleepChallengeProgressSchema = createInsertSchema(sleepChallengeProgress).omit({
  id: true,
  createdAt: true,
});

export const insertUserRewardsSchema = createInsertSchema(userRewards).omit({
  id: true,
  updatedAt: true,
});

export type SleepChallenge = typeof sleepChallenges.$inferSelect;
export type InsertSleepChallenge = z.infer<typeof insertSleepChallengeSchema>;
export type SleepChallengeProgress = typeof sleepChallengeProgress.$inferSelect;
export type InsertSleepChallengeProgress = z.infer<typeof insertSleepChallengeProgressSchema>;
export type UserRewards = typeof userRewards.$inferSelect;
export type InsertUserRewards = z.infer<typeof insertUserRewardsSchema>;

// Challenge constants
export const CHALLENGE_TYPES = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  CUSTOM: 'custom'
} as const;

export const BADGE_TYPES = {
  SLEEP_STREAK_3: 'sleep_streak_3',
  SLEEP_STREAK_7: 'sleep_streak_7',
  SLEEP_STREAK_14: 'sleep_streak_14',
  SLEEP_STREAK_30: 'sleep_streak_30',
  PERFECT_WEEK: 'perfect_week',
  PERFECT_MONTH: 'perfect_month',
  SLEEP_CHAMPION: 'sleep_champion',
  EARLY_BIRD: 'early_bird',
  CONSISTENCY_MASTER: 'consistency_master'
} as const;

export const POINT_SYSTEM = {
  TARGET_MET: 10,
  STREAK_BONUS_MULTIPLIER: 1.5,
  PERFECT_WEEK_BONUS: 50,
  PERFECT_MONTH_BONUS: 200,
  CHALLENGE_COMPLETION_BONUS: 100
} as const;

export type ChallengeType = typeof CHALLENGE_TYPES[keyof typeof CHALLENGE_TYPES];
export type BadgeType = typeof BADGE_TYPES[keyof typeof BADGE_TYPES];

// WHOOP API response types
export interface WhoopTodayResponse {
  cycle_id?: string;
  strain?: number;
  recovery_score?: number;
  hrv?: number;
  resting_heart_rate?: number;
  sleep_hours?: number;
  raw?: {
    cycle?: any;
    recovery?: any;
    sleep?: any;
  };
  error?: {
    type: string;
    message: string;
    retryable: boolean;
  };
}

export interface MealResponse {
  meals: string[];
}

export interface ApiStatusResponse {
  status: string;
  message: string;
}
