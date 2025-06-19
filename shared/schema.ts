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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type Meal = typeof meals.$inferSelect;
export type InsertWhoopData = z.infer<typeof insertWhoopDataSchema>;
export type WhoopData = typeof whoopData.$inferSelect;

// WHOOP API response types
export interface WhoopTodayResponse {
  recovery_score: number;
  sleep_score: number;
  strain_score: number;
  resting_heart_rate: number;
}

export interface MealResponse {
  meals: string[];
}

export interface ApiStatusResponse {
  status: string;
  message: string;
}
