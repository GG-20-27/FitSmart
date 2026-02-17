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
  mealType: text("meal_type"), // Breakfast, Brunch, Lunch, Dinner, Snack #1, Snack #2
  mealNotes: text("meal_notes"), // Optional notes about the meal
  analysisResult: text("analysis_result"), // AI analysis result stored as JSON
});

export const trainingData = pgTable("training_data", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD format
  type: text("type").notNull(), // Training type (e.g., "Morning Run", "Strength Training")
  duration: integer("duration").notNull(), // Duration in minutes
  goal: text("goal"), // Training goal (e.g., "Endurance", "Strength")
  intensity: text("intensity"), // Low, Moderate, High
  comment: text("comment"), // Optional user comment
  skipped: boolean("skipped").default(false).notNull(), // Whether training was skipped
  analysisResult: text("analysis_result"), // AI analysis result stored as JSON
  trainingScore: real("training_score"), // Calculated training score (1-10)
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const chatHistory = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  hasImages: boolean("has_images").default(false).notNull(),
  imageCount: integer("image_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatSummaries = pgTable("chat_summaries", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  summary: text("summary").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userGoals = pgTable("user_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  progress: integer("progress").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  microhabits: text("microhabits"), // JSON string array
  emoji: text("emoji"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fitScores = pgTable("fit_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD format
  score: real("score").notNull(),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});

export const fitlookDaily = pgTable("fitlook_daily", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  dateLocal: text("date_local").notNull(), // YYYY-MM-DD in Europe/Zurich
  payloadJson: text("payload_json").notNull(), // Stringified FitLookPayload
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FitLook payload shape (shared between server and mobile)
export interface FitLookPayload {
  date_local: string;
  hero_text: string;
  readiness_tag: 'Green' | 'Yellow' | 'Red';
  readiness_line: string;
  todays_focus: string;
  momentum_line: string;
  cta_primary: string;
  cta_secondary: string;
}

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

export const insertTrainingDataSchema = createInsertSchema(trainingData).omit({
  id: true,
  createdAt: true,
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

export const insertChatHistorySchema = createInsertSchema(chatHistory).omit({
  id: true,
  createdAt: true,
});

export const insertChatSummarySchema = createInsertSchema(chatSummaries).omit({
  updatedAt: true,
});

export const insertUserGoalSchema = createInsertSchema(userGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFitScoreSchema = createInsertSchema(fitScores).omit({
  id: true,
  calculatedAt: true,
});

export const insertFitlookDailySchema = createInsertSchema(fitlookDaily).omit({
  id: true,
  createdAt: true,
});

// Type definitions
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type Meal = typeof meals.$inferSelect;
export type InsertTrainingData = z.infer<typeof insertTrainingDataSchema>;
export type TrainingData = typeof trainingData.$inferSelect;
export type InsertWhoopData = z.infer<typeof insertWhoopDataSchema>;
export type WhoopData = typeof whoopData.$inferSelect;
export type InsertWhoopToken = z.infer<typeof insertWhoopTokenSchema>;
export type WhoopToken = typeof whoopTokens.$inferSelect;
export type InsertUserCalendar = z.infer<typeof insertUserCalendarSchema>;
export type UserCalendar = typeof userCalendars.$inferSelect;
export type InsertChatHistory = z.infer<typeof insertChatHistorySchema>;
export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertChatSummary = z.infer<typeof insertChatSummarySchema>;
export type ChatSummary = typeof chatSummaries.$inferSelect;
export type InsertUserGoal = z.infer<typeof insertUserGoalSchema>;
export type UserGoal = typeof userGoals.$inferSelect;
export type InsertFitScore = z.infer<typeof insertFitScoreSchema>;
export type FitScore = typeof fitScores.$inferSelect;
export type InsertFitlookDaily = z.infer<typeof insertFitlookDailySchema>;
export type FitlookDaily = typeof fitlookDaily.$inferSelect;



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

export interface ChatRequest {
  message: string;
  image?: string;
  images?: string[];
}

export interface ChatResponse {
  reply: string;
  fitScore?: number;
}

