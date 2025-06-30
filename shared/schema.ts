import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const meals = pgTable("meals", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
});

export const whoopData = pgTable("whoop_data", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD format
  recoveryScore: integer("recovery_score").notNull(),
  sleepScore: integer("sleep_score").notNull(),
  strainScore: integer("strain_score").notNull(), // stored as integer * 10 for precision
  restingHeartRate: integer("resting_heart_rate").notNull(),
  lastSync: timestamp("last_sync").defaultNow().notNull(),
});

export const whoopTokens = pgTable("whoop_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default('default'),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type Meal = typeof meals.$inferSelect;
export type InsertWhoopData = z.infer<typeof insertWhoopDataSchema>;
export type WhoopData = typeof whoopData.$inferSelect;
export type InsertWhoopToken = z.infer<typeof insertWhoopTokenSchema>;
export type WhoopToken = typeof whoopTokens.$inferSelect;

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
}

export interface MealResponse {
  meals: string[];
}

export interface ApiStatusResponse {
  status: string;
  message: string;
}
