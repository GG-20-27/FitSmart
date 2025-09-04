import { pgTable, text, serial, integer, timestamp, uuid, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// WHOOP OAuth-based multi-user support with text user IDs
export const users = pgTable("users", {
  id: text("id").primaryKey(), // WHOOP user ID like "whoop_25283528"
  email: text("email").notNull().unique(),
  whoopUserId: text("whoop_user_id").notNull(), // Original WHOOP numeric ID
  displayName: text("display_name"), // Optional display name for admin to set
  role: text("role").notNull().default("user"), // "user" or "admin"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const whoopTokens = pgTable("whoop_tokens", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }), // One token per user
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  staticJwt: text("staticJwt"), // Long-lived Bearer token for Custom GPT
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
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD format
  recoveryScore: integer("recovery_score").notNull(),
  sleepScore: integer("sleep_score").notNull(),
  strainScore: real("strain_score").notNull(), // Store as decimal for precision
  restingHeartRate: integer("resting_heart_rate").notNull(),
  sleepHours: real("sleep_hours"),
  hrv: real("hrv"), // HRV can be decimal like 93.759125
  respiratoryRate: real("respiratory_rate"), // Can be decimal like 17.285156
  skinTempCelsius: real("skin_temp_celsius"),
  spo2Percentage: real("spo2_percentage"), // Can be decimal like 96.375
  averageHeartRate: integer("average_heart_rate"),
  lastSync: timestamp("last_sync").defaultNow().notNull(),
}, (table) => ({
  pk: { name: "whoop_data_pkey", columns: [table.userId, table.date] }
}));

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
  role: true,
});

export const insertMealSchema = createInsertSchema(meals).omit({
  id: true,
  uploadedAt: true,
});

export const insertWhoopDataSchema = createInsertSchema(whoopData).omit({
  lastSync: true,
});

export const insertWhoopTokenSchema = createInsertSchema(whoopTokens).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertUserCalendarSchema = createInsertSchema(userCalendars).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions
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
  sleep_score?: number; // Primary sleep metric
  sleep_hours?: number; // Time actually asleep (null if stages not scored yet)
  sleepHours?: number; // temporary camelCase alias for frontend compatibility
  sleep_stages?: {
    light_sleep_minutes?: number;
    deep_sleep_minutes?: number;
    rem_sleep_minutes?: number;
    awake_minutes?: number;
  };
  time_in_bed_hours?: number; // Time spent in bed - fallback metric
  sleep_efficiency_pct?: number; // Sleep efficiency percentage
  hrv?: number;
  resting_heart_rate?: number;
  average_heart_rate?: number;
  stress_score?: number;
  skin_temperature?: number;
  spo2_percentage?: number;
  respiratory_rate?: number;
  calories_burned?: number;
  activity_log?: any[];
  date?: string;
  last_sync?: string;
  raw?: {
    cycle?: any;
    recovery?: any;
    sleep?: any;
    workout?: any;
    body_measurements?: any;
  };
  raw_data?: {
    cycle?: any;
    recovery?: any;
    sleep?: any;
    workout?: any;
    body_measurements?: any;
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
