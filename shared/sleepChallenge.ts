import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { pgTable, varchar, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

// Sleep Challenge Schema
export const sleepChallenges = pgTable('sleep_challenges', {
  id: varchar('id').primaryKey().default('gen_random_uuid()'),
  userId: varchar('user_id').notNull(),
  challengeType: varchar('challenge_type').notNull(), // 'weekly', 'monthly', 'custom'
  title: varchar('title').notNull(),
  description: varchar('description'),
  targetSleepHours: integer('target_sleep_hours').notNull(), // Target * 10 (7.5 hours = 75)
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  isActive: boolean('is_active').default(true),
  completedDays: integer('completed_days').default(0),
  totalDays: integer('total_days').notNull(),
  rewardPoints: integer('reward_points').default(0),
  badgeEarned: varchar('badge_earned'),
  metadata: jsonb('metadata'), // Store challenge-specific settings
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Sleep Challenge Progress tracking
export const sleepChallengeProgress = pgTable('sleep_challenge_progress', {
  id: varchar('id').primaryKey().default('gen_random_uuid()'),
  challengeId: varchar('challenge_id').notNull(),
  userId: varchar('user_id').notNull(),
  date: varchar('date').notNull(), // YYYY-MM-DD format
  sleepHours: integer('sleep_hours'), // Actual sleep * 10
  targetMet: boolean('target_met').default(false),
  pointsEarned: integer('points_earned').default(0),
  bonusMultiplier: integer('bonus_multiplier').default(1), // For streak bonuses
  createdAt: timestamp('created_at').defaultNow()
});

// User Rewards and Badges
export const userRewards = pgTable('user_rewards', {
  id: varchar('id').primaryKey().default('gen_random_uuid()'),
  userId: varchar('user_id').notNull(),
  totalPoints: integer('total_points').default(0),
  lifetimePoints: integer('lifetime_points').default(0),
  currentStreak: integer('current_streak').default(0),
  longestStreak: integer('longest_streak').default(0),
  badges: jsonb('badges'), // Array of earned badges
  level: integer('level').default(1),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Challenge types and configurations
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

// Zod schemas for validation
export const insertSleepChallengeSchema = createInsertSchema(sleepChallenges).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSleepChallengeProgressSchema = createInsertSchema(sleepChallengeProgress).omit({
  id: true,
  createdAt: true
});

export const insertUserRewardsSchema = createInsertSchema(userRewards).omit({
  id: true,
  updatedAt: true
});

// Types
export type SleepChallenge = typeof sleepChallenges.$inferSelect;
export type InsertSleepChallenge = z.infer<typeof insertSleepChallengeSchema>;

export type SleepChallengeProgress = typeof sleepChallengeProgress.$inferSelect;
export type InsertSleepChallengeProgress = z.infer<typeof insertSleepChallengeProgressSchema>;

export type UserRewards = typeof userRewards.$inferSelect;
export type InsertUserRewards = z.infer<typeof insertUserRewardsSchema>;

export type ChallengeType = typeof CHALLENGE_TYPES[keyof typeof CHALLENGE_TYPES];
export type BadgeType = typeof BADGE_TYPES[keyof typeof BADGE_TYPES];