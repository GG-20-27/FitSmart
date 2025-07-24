import { pgTable, text, serial, integer, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// WHOOP OAuth-based multi-user support with text user IDs
export const users = pgTable("users", {
  id: text("id").primaryKey(), // WHOOP user ID like "whoop_25283528"
  email: text("email").notNull().unique(),
  whoopUserId: text("whoop_user_id").notNull(), // Original WHOOP numeric ID
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

export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  whoopUserId: true,
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
