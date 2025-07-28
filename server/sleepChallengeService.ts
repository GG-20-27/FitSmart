import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { 
  sleepChallenges, 
  sleepChallengeProgress, 
  userRewards, 
  whoopData,
  type SleepChallenge,
  type InsertSleepChallenge,
  type SleepChallengeProgress,
  type InsertSleepChallengeProgress,
  type UserRewards,
  type InsertUserRewards,
  CHALLENGE_TYPES,
  BADGE_TYPES,
  POINT_SYSTEM
} from '@shared/schema';

export class SleepChallengeService {
  
  // Create a new sleep challenge
  async createChallenge(userId: string, challengeData: InsertSleepChallenge): Promise<SleepChallenge> {
    const [challenge] = await db.insert(sleepChallenges)
      .values({
        ...challengeData,
        userId,
        totalDays: this.calculateTotalDays(challengeData.startDate, challengeData.endDate)
      })
      .returning();
    
    // Initialize user rewards if they don't exist
    await this.initializeUserRewards(userId);
    
    return challenge;
  }

  // Get user's active challenges
  async getUserActiveChallenges(userId: string): Promise<SleepChallenge[]> {
    return await db.select()
      .from(sleepChallenges)
      .where(and(
        eq(sleepChallenges.userId, userId),
        eq(sleepChallenges.isActive, true)
      ))
      .orderBy(desc(sleepChallenges.createdAt));
  }

  // Get user's challenge history
  async getUserChallengeHistory(userId: string): Promise<SleepChallenge[]> {
    return await db.select()
      .from(sleepChallenges)
      .where(eq(sleepChallenges.userId, userId))
      .orderBy(desc(sleepChallenges.createdAt));
  }

  // Process daily sleep data and update challenges
  async processDailySleep(userId: string, date: string, sleepHours: number): Promise<void> {
    const activeChallenges = await this.getUserActiveChallenges(userId);
    
    for (const challenge of activeChallenges) {
      await this.updateChallengeProgress(challenge, userId, date, sleepHours);
    }
    
    // Update user rewards and check for badges
    await this.updateUserRewards(userId);
  }

  // Update progress for a specific challenge
  private async updateChallengeProgress(
    challenge: SleepChallenge, 
    userId: string, 
    date: string, 
    sleepHours: number
  ): Promise<void> {
    const sleepHoursInt = Math.round(sleepHours * 10); // Store as integer * 10
    const targetMet = sleepHoursInt >= challenge.targetSleepHours;
    
    // Check if progress already exists for this date
    const existingProgress = await db.select()
      .from(sleepChallengeProgress)
      .where(and(
        eq(sleepChallengeProgress.challengeId, challenge.id),
        eq(sleepChallengeProgress.userId, userId),
        eq(sleepChallengeProgress.date, date)
      ))
      .limit(1);

    const currentStreak = await this.getCurrentStreak(userId);
    const bonusMultiplier = this.calculateBonusMultiplier(currentStreak);
    const pointsEarned = targetMet ? Math.round(POINT_SYSTEM.TARGET_MET * bonusMultiplier) : 0;

    if (existingProgress.length > 0) {
      // Update existing progress
      await db.update(sleepChallengeProgress)
        .set({
          sleepHours: sleepHoursInt,
          targetMet,
          pointsEarned,
          bonusMultiplier
        })
        .where(eq(sleepChallengeProgress.id, existingProgress[0].id));
    } else {
      // Create new progress entry
      await db.insert(sleepChallengeProgress)
        .values({
          challengeId: challenge.id,
          userId,
          date,
          sleepHours: sleepHoursInt,
          targetMet,
          pointsEarned,
          bonusMultiplier
        });
    }

    // Update challenge completed days count
    const completedDays = await this.getChallengeCompletedDays(challenge.id);
    const rewardPoints = await this.getChallengeRewardPoints(challenge.id);
    
    await db.update(sleepChallenges)
      .set({
        completedDays,
        rewardPoints,
        updatedAt: new Date()
      })
      .where(eq(sleepChallenges.id, challenge.id));

    // Check if challenge is completed
    if (completedDays >= challenge.totalDays) {
      await this.completChallenge(challenge);
    }
  }

  // Get challenge completed days count
  private async getChallengeCompletedDays(challengeId: number): Promise<number> {
    const result = await db.select({
      count: sql<number>`count(*)`
    })
    .from(sleepChallengeProgress)
    .where(and(
      eq(sleepChallengeProgress.challengeId, challengeId),
      eq(sleepChallengeProgress.targetMet, true)
    ));

    return result[0]?.count || 0;
  }

  // Get total reward points for a challenge
  private async getChallengeRewardPoints(challengeId: number): Promise<number> {
    const result = await db.select({
      total: sql<number>`sum(points_earned)`
    })
    .from(sleepChallengeProgress)
    .where(eq(sleepChallengeProgress.challengeId, challengeId));

    return result[0]?.total || 0;
  }

  // Complete a challenge and award bonus points
  private async completChallenge(challenge: SleepChallenge): Promise<void> {
    let bonusPoints = POINT_SYSTEM.CHALLENGE_COMPLETION_BONUS;
    let badgeEarned = '';

    // Award additional bonuses based on challenge type
    if (challenge.challengeType === CHALLENGE_TYPES.WEEKLY && challenge.completedDays === challenge.totalDays) {
      bonusPoints += POINT_SYSTEM.PERFECT_WEEK_BONUS;
      badgeEarned = BADGE_TYPES.PERFECT_WEEK;
    } else if (challenge.challengeType === CHALLENGE_TYPES.MONTHLY && challenge.completedDays === challenge.totalDays) {
      bonusPoints += POINT_SYSTEM.PERFECT_MONTH_BONUS;
      badgeEarned = BADGE_TYPES.PERFECT_MONTH;
    }

    // Update challenge as completed
    await db.update(sleepChallenges)
      .set({
        isActive: false,
        rewardPoints: challenge.rewardPoints + bonusPoints,
        badgeEarned: badgeEarned || null,
        updatedAt: new Date()
      })
      .where(eq(sleepChallenges.id, challenge.id));

    // Award bonus points to user
    await this.awardPoints(challenge.userId, bonusPoints);
    
    // Award badge if earned
    if (badgeEarned) {
      await this.awardBadge(challenge.userId, badgeEarned);
    }
  }

  // Get user's current sleep streak
  private async getCurrentStreak(userId: string): Promise<number> {
    const userReward = await this.getUserRewards(userId);
    return userReward?.currentStreak || 0;
  }

  // Calculate bonus multiplier based on streak
  private calculateBonusMultiplier(streak: number): number {
    if (streak >= 7) return POINT_SYSTEM.STREAK_BONUS_MULTIPLIER * 2;
    if (streak >= 3) return POINT_SYSTEM.STREAK_BONUS_MULTIPLIER;
    return 1;
  }

  // Initialize user rewards
  private async initializeUserRewards(userId: string): Promise<UserRewards> {
    const existing = await this.getUserRewards(userId);
    if (existing) return existing;

    const [userReward] = await db.insert(userRewards)
      .values({
        userId,
        totalPoints: 0,
        lifetimePoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        level: 1,
        badges: []
      })
      .returning();

    return userReward;
  }

  // Get user rewards
  async getUserRewards(userId: string): Promise<UserRewards | null> {
    const [userReward] = await db.select()
      .from(userRewards)
      .where(eq(userRewards.userId, userId))
      .limit(1);

    return userReward || null;
  }

  // Update user rewards based on recent progress
  private async updateUserRewards(userId: string): Promise<void> {
    // Calculate current streak
    const streak = await this.calculateUserStreak(userId);
    
    // Calculate total points from all progress
    const totalPointsResult = await db.select({
      total: sql<number>`sum(points_earned)`
    })
    .from(sleepChallengeProgress)
    .where(eq(sleepChallengeProgress.userId, userId));

    const totalPoints = totalPointsResult[0]?.total || 0;
    const level = this.calculateLevel(totalPoints);

    // Get existing rewards to preserve badges and lifetime points
    const existingRewards = await this.getUserRewards(userId);
    const lifetimePoints = Math.max(totalPoints, existingRewards?.lifetimePoints || 0);
    const longestStreak = Math.max(streak, existingRewards?.longestStreak || 0);

    // Update user rewards
    if (existingRewards) {
      await db.update(userRewards)
        .set({
          totalPoints,
          lifetimePoints,
          currentStreak: streak,
          longestStreak,
          level,
          updatedAt: new Date()
        })
        .where(eq(userRewards.userId, userId));
    } else {
      await this.initializeUserRewards(userId);
    }

    // Check for streak-based badges
    await this.checkStreakBadges(userId, streak);
  }

  // Calculate user's current sleep streak
  private async calculateUserStreak(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    let currentDate = new Date(today);
    let streak = 0;

    // Check backwards from today to find consecutive days with target met
    for (let i = 0; i < 30; i++) { // Check last 30 days max
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const progress = await db.select()
        .from(sleepChallengeProgress)
        .where(and(
          eq(sleepChallengeProgress.userId, userId),
          eq(sleepChallengeProgress.date, dateStr),
          eq(sleepChallengeProgress.targetMet, true)
        ))
        .limit(1);

      if (progress.length > 0) {
        streak++;
      } else {
        break; // Streak broken
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }

    return streak;
  }

  // Calculate user level based on total points
  private calculateLevel(totalPoints: number): number {
    return Math.floor(totalPoints / 100) + 1;
  }

  // Award points to user
  private async awardPoints(userId: string, points: number): Promise<void> {
    await db.update(userRewards)
      .set({
        totalPoints: sql`${userRewards.totalPoints} + ${points}`,
        lifetimePoints: sql`${userRewards.lifetimePoints} + ${points}`,
        updatedAt: new Date()
      })
      .where(eq(userRewards.userId, userId));
  }

  // Award badge to user
  private async awardBadge(userId: string, badgeType: string): Promise<void> {
    const userReward = await this.getUserRewards(userId);
    if (!userReward) return;

    const currentBadges = userReward.badges || [];
    if (!currentBadges.includes(badgeType)) {
      const newBadges = [...currentBadges, badgeType];
      
      await db.update(userRewards)
        .set({
          badges: newBadges,
          updatedAt: new Date()
        })
        .where(eq(userRewards.userId, userId));
    }
  }

  // Check and award streak-based badges
  private async checkStreakBadges(userId: string, streak: number): Promise<void> {
    const badgesToCheck = [
      { streak: 3, badge: BADGE_TYPES.SLEEP_STREAK_3 },
      { streak: 7, badge: BADGE_TYPES.SLEEP_STREAK_7 },
      { streak: 14, badge: BADGE_TYPES.SLEEP_STREAK_14 },
      { streak: 30, badge: BADGE_TYPES.SLEEP_STREAK_30 }
    ];

    for (const { streak: requiredStreak, badge } of badgesToCheck) {
      if (streak >= requiredStreak) {
        await this.awardBadge(userId, badge);
      }
    }
  }

  // Calculate total days between start and end date
  private calculateTotalDays(startDate: Date, endDate: Date): number {
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
  }

  // Get challenge progress for a specific challenge
  async getChallengeProgress(challengeId: number): Promise<SleepChallengeProgress[]> {
    return await db.select()
      .from(sleepChallengeProgress)
      .where(eq(sleepChallengeProgress.challengeId, challengeId))
      .orderBy(asc(sleepChallengeProgress.date));
  }

  // Get user's recent progress (last 30 days)
  async getUserRecentProgress(userId: string): Promise<SleepChallengeProgress[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    return await db.select()
      .from(sleepChallengeProgress)
      .where(and(
        eq(sleepChallengeProgress.userId, userId),
        gte(sleepChallengeProgress.date, dateStr)
      ))
      .orderBy(desc(sleepChallengeProgress.date));
  }

  // Create default weekly challenge for new users
  async createDefaultWeeklyChallenge(userId: string, targetHours: number = 8): Promise<SleepChallenge> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 6); // 7 days total

    return await this.createChallenge(userId, {
      challengeType: CHALLENGE_TYPES.WEEKLY,
      title: 'Weekly Sleep Goal',
      description: `Get ${targetHours} hours of sleep for 7 consecutive days`,
      targetSleepHours: targetHours * 10, // Store as integer * 10
      startDate,
      endDate,
      isActive: true,
      completedDays: 0,
      totalDays: 7,
      rewardPoints: 0
    });
  }
}

export const sleepChallengeService = new SleepChallengeService();