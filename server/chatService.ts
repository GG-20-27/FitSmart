import type { ChatResponse } from '@shared/schema';
import { whoopApiService } from './whoopApiService';
import type { WhoopTodayResponse } from '@shared/schema';
import { buildContextPack } from './services/contextPack';
import { composePersonaPrompt, composeFitScorePrompt, buildMessagesArray, PERSONA_LLM_CONFIG, FITSCORE_LLM_CONFIG } from './prompt/personaComposer';
import { maybeAddReflection } from './utils/reflectionPlanner';
import { storage } from './storage';

export enum ChatErrorType {
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  OPENAI_ERROR = 'OPENAI_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

interface ChatError {
  type: ChatErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  details?: unknown;
}

class ChatServiceError extends Error {
  public readonly type: ChatErrorType;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(error: ChatError) {
    super(error.message);
    this.name = 'ChatServiceError';
    this.type = error.type;
    this.statusCode = error.statusCode;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}

interface SendChatOptions {
  userId: string;
  message: string;
  image?: string; // Base64 encoded image (deprecated)
  images?: string[]; // Base64 encoded images (supports multiple)
  goalsContext?: string; // User's goals and habits context
}

const SYSTEM_PROMPT = `You are FitScore AI Coach - a warm, engaging health assistant.

🎯 MANDATORY EMOJI RULE - YOU MUST FOLLOW THIS:
- Start EVERY response with an emoji
- Put emojis throughout your response (minimum 6 emojis total)
- End EVERY response with an emoji
- Example: "💪 Hi! I'm here to help you ✨ with your training 🏃 and recovery 💤. Let's get started! 🔥"

Use contextual emojis naturally. NEVER use: 😊 🙂 ☺️ ♂️

You can access WHOOP data and calendar info to provide personalized insights on recovery, training, sleep, and health.

Always be helpful, encouraging, and provide actionable advice.`;

export class ChatService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.timeout = 30000;

    if (!this.apiKey) {
      console.warn('[CHAT SERVICE] OpenAI API key not configured - chat service will be unavailable');
    } else {
      console.log(`[CHAT SERVICE] OpenAI configured with model: ${this.model}`);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Add emojis to response if it doesn't have any
   * Now more subtle - only 1 emoji at start, only when contextually appropriate
   */
  private addEmojisToResponse(text: string): string {
    // First check for emoji spam (multiple emojis in a row) and remove it
    const emojiSpamRegex = /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])\s*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;
    if (emojiSpamRegex.test(text)) {
      console.log('[CHAT SERVICE] Removing emoji spam from response');
      text = text.replace(emojiSpamRegex, '$1').trim();
    }

    // Check if response already has emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    if (emojiRegex.test(text)) {
      // Already has emojis, return cleaned version
      return text;
    }

    // ONLY add emoji for very specific celebratory contexts
    const lowerText = text.toLowerCase();
    if (lowerText.includes('congratulations') || lowerText.includes('excellent work') || lowerText.includes('amazing job')) {
      return `🎉 ${text}`;
    }

    // For everything else, keep it professional - no emoji
    return text;
  }

  private async getRecentChatHistory(userId: string, limit: number = 30): Promise<Array<{role: string, content: string}>> {
    try {
      const { db } = await import('./db');
      const { chatHistory } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      const { eq } = await import('drizzle-orm');

      const messages = await db
        .select({
          role: chatHistory.role,
          content: chatHistory.content,
          createdAt: chatHistory.createdAt
        })
        .from(chatHistory)
        .where(eq(chatHistory.userId, userId))
        .orderBy(desc(chatHistory.createdAt))
        .limit(limit);

      // Reverse to get chronological order (oldest first)
      return messages.reverse().map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } catch (error) {
      console.error('[CHAT SERVICE] Failed to fetch chat history:', error);
      return [];
    }
  }

  private async getLatestSummary(userId: string): Promise<string | null> {
    try {
      const { db } = await import('./db');
      const { chatSummaries } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      const { eq } = await import('drizzle-orm');

      const summaries = await db
        .select()
        .from(chatSummaries)
        .where(eq(chatSummaries.userId, userId))
        .orderBy(desc(chatSummaries.updatedAt))
        .limit(1);

      return summaries[0]?.summary || null;
    } catch (error) {
      console.error('[CHAT SERVICE] Failed to fetch chat summary:', error);
      return null;
    }
  }

  private async saveChatMessage(userId: string, role: 'user' | 'assistant', content: string, hasImages: boolean = false, imageCount: number = 0): Promise<void> {
    try {
      const { db } = await import('./db');
      const { chatHistory } = await import('@shared/schema');

      await db.insert(chatHistory).values({
        userId,
        role,
        content,
        hasImages,
        imageCount
      });

      console.log(`[CHAT SERVICE] Saved ${role} message to chat history`);
    } catch (error) {
      console.error('[CHAT SERVICE] Failed to save chat message:', error);
      // Don't throw - message saving is not critical for chat functionality
    }
  }

  private truncateContextMessages(messages: Array<any>, maxTokens: number = 6000): Array<any> {
    // Rough estimate: 1 token ≈ 4 characters
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

    // Always keep system message and current user message (last message)
    if (messages.length < 2) return messages;

    const systemMessage = messages[0];
    const currentUserMessage = messages[messages.length - 1];
    const middleMessages = messages.slice(1, -1);

    let totalTokens = 0;
    const truncated: Array<any> = [systemMessage];

    // Add system message tokens
    const systemContent = typeof systemMessage.content === 'string' ? systemMessage.content : JSON.stringify(systemMessage.content);
    totalTokens += estimateTokens(systemContent);

    // Add current user message tokens
    const userContent = typeof currentUserMessage.content === 'string' ? currentUserMessage.content : JSON.stringify(currentUserMessage.content);
    totalTokens += estimateTokens(userContent);

    // Process middle messages in reverse (most recent first) to keep latest context
    for (let i = middleMessages.length - 1; i >= 0; i--) {
      const msg = middleMessages[i];
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const msgTokens = estimateTokens(content);

      if (totalTokens + msgTokens > maxTokens) {
        console.log(`[CHAT SERVICE] Truncated context at ${totalTokens} tokens (limit: ${maxTokens})`);
        break;
      }

      truncated.splice(1, 0, msg); // Insert after system message
      totalTokens += msgTokens;
    }

    // Always add the current user message at the end
    truncated.push(currentUserMessage);

    return truncated;
  }

  public async sendChat({ userId, message, image, images, goalsContext }: SendChatOptions): Promise<ChatResponse> {
    if (!this.isConfigured()) {
      throw new ChatServiceError({
        type: ChatErrorType.CONFIGURATION_ERROR,
        message: 'Chat service not configured',
        retryable: false
      });
    }

    if (!message || !message.trim()) {
      throw new ChatServiceError({
        type: ChatErrorType.VALIDATION_ERROR,
        message: 'Message cannot be empty',
        retryable: false
      });
    }

    try {
      // === PERSONA PIPELINE STEP 1: Build Context Pack ===
      console.log('[CTX] 🔄 Starting FitSmart persona pipeline...');
      const contextPack = await buildContextPack(userId);
      console.log('[CTX] ✅ Context pack built');

      // Fetch chat history for context continuity
      console.log('[CHAT SERVICE] Fetching recent chat history...');
      const recentMessages = await this.getRecentChatHistory(userId, 30);
      const latestSummary = await this.getLatestSummary(userId);

      if (latestSummary) {
        console.log(`[CHAT SERVICE] Found summary: ${latestSummary.substring(0, 100)}...`);
      }
      if (recentMessages.length > 0) {
        console.log(`[CHAT SERVICE] Found ${recentMessages.length} recent messages`);
      }

      // Fetch user's onboarding profile data
      let userProfile: any = null;
      try {
        const { db } = await import('./db');
        const { users } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        userProfile = user;
        console.log('[CHAT SERVICE] Fetched user profile data');
      } catch (error) {
        console.error('[CHAT SERVICE] Failed to fetch user profile:', error);
      }

      // Store previous FitScore for reflection trigger
      const previousFitScore = userProfile?.currentFitScore;

      // Check if user is asking about WHOOP data or calendar
      const lowerMessage = message.toLowerCase();
      const needsWhoopData = lowerMessage.includes('recovery') || lowerMessage.includes('strain') ||
                           lowerMessage.includes('hrv') || lowerMessage.includes('sleep') ||
                           lowerMessage.includes('whoop') || lowerMessage.includes('fitness') ||
                           lowerMessage.includes('yesterday') || lowerMessage.includes('week') ||
                           lowerMessage.includes('trend') || lowerMessage.includes('average');

      const needsCalendarData = lowerMessage.includes('calendar') || lowerMessage.includes('training') ||
                               lowerMessage.includes('schedule') || lowerMessage.includes('workout') ||
                               lowerMessage.includes('session') || lowerMessage.includes('practice') ||
                               lowerMessage.includes('game') || lowerMessage.includes('event') ||
                               lowerMessage.includes('plan') || lowerMessage.includes('today');

      // Check if user uploaded meal images
      const hasMealImages = (images && images.length > 0) || (image && image.length > 0);
      const mealImageCount = images?.length || (image ? 1 : 0);

      // Check if user wants ONLY calorie estimation (exception case)
      const onlyCaloriesRequested = lowerMessage.includes('only estimate calories') ||
                                    lowerMessage.includes('just estimate calories') ||
                                    lowerMessage.includes('only calories');

      // DISABLED: FitScore calculation in chat - will be implemented in dedicated FitScore screen
      // This was causing slow responses and "thinking" forever issues
      const isFitScoreQuery = false; // Disabled for now

      let contextData = '';
      let fitScoreData: string = '';
      let shouldAskAboutFitScore = false;

      // Add user profile data to context
      if (userProfile) {
        contextData += `\n\nUser Profile Information:`;

        // Phase 1 data
        if (userProfile.age) contextData += `\n- Age: ${userProfile.age}`;
        if (userProfile.heightCm) contextData += `\n- Height: ${userProfile.heightCm}cm`;
        if (userProfile.weightKg) contextData += `\n- Weight: ${userProfile.weightKg}kg`;
        if (userProfile.targetPhysique) contextData += `\n- Target Physique: ${userProfile.targetPhysique}`;
        if (userProfile.goalShort) contextData += `\n- Short-term Goal: ${userProfile.goalShort}`;
        if (userProfile.goalLong) contextData += `\n- Long-term Goal: ${userProfile.goalLong}`;
        if (userProfile.trainingFrequency) contextData += `\n- Training Frequency: ${userProfile.trainingFrequency} sessions/week`;
        if (userProfile.trainingTypes) contextData += `\n- Training Types: ${Array.isArray(userProfile.trainingTypes) ? userProfile.trainingTypes.join(', ') : userProfile.trainingTypes}`;
        if (userProfile.trainingNonnegotiables) contextData += `\n- Training Non-negotiables: ${userProfile.trainingNonnegotiables}`;

        // Life stressors
        if (userProfile.lifeStressors) {
          const stressors = userProfile.lifeStressors;
          contextData += `\n- Life Stressors (1-5 scale):`;
          if (stressors.work) contextData += `\n  • Work: ${stressors.work}/5`;
          if (stressors.personal_life) contextData += `\n  • Personal Life: ${stressors.personal_life}/5`;
          if (stressors.health) contextData += `\n  • Health: ${stressors.health}/5`;
          if (stressors.sports) contextData += `\n  • Sports: ${stressors.sports}/5`;
          if (stressors.personal_projects) contextData += `\n  • Personal Projects: ${stressors.personal_projects}/5`;
          if (stressors.studies) contextData += `\n  • Studies: ${stressors.studies}/5`;
        }

        if (userProfile.meditationBreathwork) contextData += `\n- Meditation/Breathwork: ${userProfile.meditationBreathwork}`;
        if (userProfile.injuries) contextData += `\n- Injuries: ${userProfile.injuries}`;
        if (userProfile.tone) contextData += `\n- Preferred Tone: ${userProfile.tone}`;

        // Phase 2 data (if available)
        if (userProfile.typicalSleepHours) contextData += `\n- Typical Sleep: ${userProfile.typicalSleepHours} hours`;
        if (userProfile.morningFeeling) contextData += `\n- Morning Feeling: ${userProfile.morningFeeling}`;
        if (userProfile.typicalMeals) contextData += `\n- Typical Meals: ${userProfile.typicalMeals}`;
        if (userProfile.nutritionTracking) contextData += `\n- Nutrition Tracking: ${userProfile.nutritionTracking}`;
        if (userProfile.supplements) contextData += `\n- Supplements: ${userProfile.supplements}`;

        // Onboarding phase info
        if (userProfile.onboardingPhase) {
          contextData += `\n\nOnboarding Status: ${userProfile.onboardingPhase}`;
          if (userProfile.onboardingPhase === 'phase_1_complete') {
            contextData += ` (Week 2: Sleep Consistency - Phase 2 unlocks in 7 days)`;
          } else if (userProfile.onboardingPhase === 'phase_2_pending') {
            contextData += ` (Now in Phase 2 - gathering sleep and nutrition details)`;
          } else if (userProfile.onboardingPhase === 'phase_2_complete') {
            contextData += ` (Week 3+: Optimization - Phase 3 unlocks in 7 days)`;
          }
        }

        contextData += '\n';
      }

      // Fetch WHOOP data if needed
      if (needsWhoopData) {
        try {
          // Fetch today's data
          const whoopData: WhoopTodayResponse = await whoopApiService.getTodaysData(userId);
          contextData += `\n\nWHOOP Data for today:
- Recovery Score: ${whoopData.recovery_score ?? 'N/A'}%
- Strain: ${whoopData.strain ?? whoopData.strain_score ?? 'N/A'}
- Sleep Score: ${whoopData.sleep_score ?? 'N/A'}%
- Sleep Hours: ${whoopData.sleep_hours ?? whoopData.sleepHours ?? 'N/A'}h
- HRV: ${whoopData.hrv ?? 'N/A'}ms
- Resting Heart Rate: ${whoopData.resting_heart_rate ?? 'N/A'}bpm
- Respiratory Rate: ${whoopData.respiratory_rate ?? 'N/A'} breaths/min
- Skin Temperature: ${whoopData.skin_temperature ?? 'N/A'}°C
- SpO2: ${whoopData.spo2_percentage ?? 'N/A'}%
- Average Heart Rate: ${whoopData.average_heart_rate ?? 'N/A'}bpm\n`;

          // ALWAYS fetch yesterday's data (not conditional on message keywords)
          console.log('[CHAT SERVICE] Fetching yesterday data for user:', userId);
          try {
            const yesterdayData = await whoopApiService.getYesterdaysData(userId);
            console.log('[CHAT SERVICE] Yesterday data received:', yesterdayData);
            if (yesterdayData) {
              contextData += `\nYesterday's WHOOP Data:
- Recovery Score: ${yesterdayData.recovery_score ?? 'N/A'}%
- Strain: ${yesterdayData.strain ?? yesterdayData.strain_score ?? 'N/A'}
- Sleep Score: ${yesterdayData.sleep_score ?? 'N/A'}%
- HRV: ${yesterdayData.hrv ?? 'N/A'}ms\n`;
            } else {
              console.log('[CHAT SERVICE] Yesterday data is null/undefined');
            }
          } catch (err) {
            console.error('[CHAT SERVICE] Failed to fetch yesterday data:', err);
          }

          // ALWAYS fetch weekly data (not conditional on message keywords)
          console.log('[CHAT SERVICE] Fetching weekly data for user:', userId);
          try {
            const weeklyData = await whoopApiService.getWeeklyAverages(userId);
            console.log('[CHAT SERVICE] Weekly data received:', weeklyData);
            if (weeklyData) {
              // Handle both camelCase and snake_case field names
              const avgRecovery = (weeklyData as any).avgRecovery ?? (weeklyData as any).avg_recovery;
              const avgStrain = (weeklyData as any).avgStrain ?? (weeklyData as any).avg_strain;
              const avgSleep = (weeklyData as any).avgSleep ?? (weeklyData as any).avg_sleep;
              const avgHRV = (weeklyData as any).avgHRV ?? (weeklyData as any).avg_hrv;

              contextData += `\n7-Day Average WHOOP Data:
- Avg Recovery: ${avgRecovery ?? 'N/A'}%
- Avg Strain: ${avgStrain ?? 'N/A'}
- Avg Sleep Score: ${avgSleep ?? 'N/A'}%
- Avg HRV: ${avgHRV ?? 'N/A'}ms\n`;
            } else {
              console.log('[CHAT SERVICE] Weekly data is null/undefined');
            }
          } catch (err) {
            console.error('[CHAT SERVICE] Failed to fetch weekly data:', err);
          }
        } catch (error) {
          console.error('[CHAT SERVICE] Failed to fetch WHOOP data:', error);
          contextData += '\n\nWHOOP data is currently unavailable.\n';
        }
      }

      // Fetch calendar data if needed
      if (needsCalendarData) {
        console.log('[CHAT SERVICE] Calendar data requested - fetching events...');
        try {
          const { storage } = await import('./storage');
          const { DateTime } = await import('luxon');

          // Get user's calendars
          const userCalendars = await storage.getUserCalendars(userId);
          console.log(`[CHAT SERVICE] Found ${userCalendars.length} calendars for user`);

          if (userCalendars.length > 0) {
            const today = DateTime.now().setZone('Europe/Zurich');

            // Fetch events for today and the next 7 days
            const targetDate = today;
            const startDate = today.startOf('day');
            const endDate = today.plus({ days: 7 }).endOf('day');

            const calendarUrls = userCalendars
              .filter(cal => cal.isActive)
              .map(cal => cal.calendarUrl);

            console.log(`[CHAT SERVICE] Fetching events from ${startDate.toISODate()} to ${endDate.toISODate()}`);

            const allEvents: any[] = [];

            for (const calendarUrl of calendarUrls) {
              try {
                console.log(`[CHAT SERVICE] Fetching calendar: ${calendarUrl.substring(0, 50)}...`);
                const response = await fetch(calendarUrl);
                if (response.ok) {
                  const icsData = await response.text();
                  const ical = await import('node-ical');
                  const parsed = ical.default.sync.parseICS(icsData);

                  let eventCount = 0;
                  const { RRule } = await import('rrule');

                  for (const k in parsed) {
                    const event = parsed[k];
                    if (event.type === 'VEVENT' && event.start) {
                      // Check if event is recurring
                      if (event.rrule) {
                        // Handle recurring event - expand occurrences within date range
                        try {
                          const rruleObj = event.rrule as any;
                          const rrule = new RRule({
                            ...rruleObj.options,
                            dtstart: new Date(event.start)
                          });

                          // Get occurrences within our date range
                          const occurrences = rrule.between(
                            startDate.toJSDate(),
                            endDate.toJSDate(),
                            true // inclusive
                          );

                          // Add each occurrence as a separate event
                          occurrences.forEach(occurrence => {
                            const occurrenceStart = DateTime.fromJSDate(occurrence).setZone('Europe/Zurich');
                            const duration = event.end
                              ? DateTime.fromJSDate(event.end).diff(DateTime.fromJSDate(event.start))
                              : { milliseconds: 3600000 }; // Default 1 hour
                            const occurrenceEnd = occurrenceStart.plus(duration);

                            allEvents.push({
                              title: event.summary || 'Untitled Event',
                              start: occurrenceStart.toISO(),
                              end: occurrenceEnd.toISO(),
                              location: event.location,
                              isToday: occurrenceStart >= targetDate.startOf('day') && occurrenceStart <= targetDate.endOf('day'),
                              isRecurring: true
                            });
                            eventCount++;
                          });
                        } catch (rruleError) {
                          console.error('[CHAT SERVICE] Failed to parse recurring event:', rruleError);
                          // Fall back to treating as single event
                          const eventStart = DateTime.fromJSDate(event.start).setZone('Europe/Zurich');
                          const eventEnd = event.end ? DateTime.fromJSDate(event.end).setZone('Europe/Zurich') : eventStart;

                          if (eventStart >= startDate && eventStart <= endDate) {
                            allEvents.push({
                              title: event.summary || 'Untitled Event',
                              start: eventStart.toISO(),
                              end: eventEnd.toISO(),
                              location: event.location,
                              isToday: eventStart >= targetDate.startOf('day') && eventStart <= targetDate.endOf('day')
                            });
                            eventCount++;
                          }
                        }
                      } else {
                        // Handle non-recurring event
                        const eventStart = DateTime.fromJSDate(event.start).setZone('Europe/Zurich');
                        const eventEnd = event.end ? DateTime.fromJSDate(event.end).setZone('Europe/Zurich') : eventStart;

                        // Include events within the date range
                        if (eventStart >= startDate && eventStart <= endDate) {
                          allEvents.push({
                            title: event.summary || 'Untitled Event',
                            start: eventStart.toISO(),
                            end: eventEnd.toISO(),
                            location: event.location,
                            isToday: eventStart >= targetDate.startOf('day') && eventStart <= targetDate.endOf('day')
                          });
                          eventCount++;
                        }
                      }
                    }
                  }
                  console.log(`[CHAT SERVICE] Parsed ${eventCount} events from calendar (including recurring)`);
                } else {
                  console.error(`[CHAT SERVICE] Failed to fetch calendar: ${response.status}`);
                }
              } catch (err) {
                console.error('[CHAT SERVICE] Failed to fetch/parse calendar:', err);
              }
            }

            console.log(`[CHAT SERVICE] Total events found: ${allEvents.length}`);

            if (allEvents.length > 0) {
              // Sort events by start time
              allEvents.sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());

              // Separate today's events and upcoming events
              const todayEvents = allEvents.filter(e => e.isToday);
              const upcomingEvents = allEvents.filter(e => !e.isToday);

              contextData += `\n\n`;

              if (todayEvents.length > 0) {
                contextData += `Today's Training Schedule (${targetDate.toFormat('MMM d')}):\n`;
                todayEvents.forEach(event => {
                  const start = DateTime.fromISO(event.start).toFormat('HH:mm');
                  contextData += `- ${event.title} at ${start}`;
                  if (event.location) {
                    contextData += ` (${event.location})`;
                  }
                  contextData += '\n';
                });
                contextData += '\n';
              }

              // Show upcoming events
              if (upcomingEvents.length > 0) {
                contextData += `Upcoming Training Sessions (Next 7 Days):\n`;
                upcomingEvents.forEach(event => {
                  const start = DateTime.fromISO(event.start);
                  const dateStr = start.toFormat('MMM d');
                  const timeStr = start.toFormat('HH:mm');
                  contextData += `- ${event.title} on ${dateStr} at ${timeStr}`;
                  if (event.location) {
                    contextData += ` (${event.location})`;
                  }
                  contextData += '\n';
                });
              }
            } else {
              contextData += '\n\nNo training sessions scheduled for the next 7 days.\n';
            }
          } else {
            console.log('[CHAT SERVICE] No calendars configured for user');
            contextData += '\n\nNo calendars configured.\n';
          }
        } catch (error) {
          console.error('[CHAT SERVICE] Failed to fetch calendar data:', error);
          contextData += '\n\nCalendar data is currently unavailable.\n';
        }
      }

      // Check if user uploaded only 1 meal - ask for confirmation before calculating FitScore
      if (mealImageCount === 1 && isFitScoreQuery) {
        console.log('[CHAT SERVICE] Only 1 meal uploaded - asking for confirmation');
        fitScoreData = '\n\n⚠️ **Single Meal Detected**\n\nI see you uploaded 1 meal. Are you sure this is everything you ate today?\n\nFitScore works best with your full daily nutrition data (2+ meals). If this is your only meal so far, I can help you track it, but I\'ll wait to calculate your FitScore until you\'ve logged more.\n';
        // Set flag to skip FitScore calculation but still process the meal
        const skipFitScore = true;
      }

      // Meal images automatically trigger FitScore calculation (removed old prompt logic)

      // Fetch and auto-calculate FitScore if query detected (and not skipped due to single meal)
      if (isFitScoreQuery && mealImageCount !== 1) {
        // Calculate target date in local timezone (always today)
        const now = new Date();
        const targetDateObj = now;

        // Format as YYYY-MM-DD in local timezone
        const year = targetDateObj.getFullYear();
        const month = String(targetDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(targetDateObj.getDate()).padStart(2, '0');
        const targetDate = `${year}-${month}-${day}`;

        console.log(`[CHAT SERVICE] FitScore query detected for ${targetDate} - checking data availability...`);

        try {
          const { fitScoreService } = await import('./services/fitScoreService');
          const { mealAnalysisService } = await import('./services/mealAnalysisService');

          // First, check what data we have and what's missing
          const missingComponents: string[] = [];
          let mealAnalyses: any[] = [];

          // Check WHOOP data - only fail if ALL core data is missing
          let whoopDataAvailable = false;
          try {
            // Fetch today's WHOOP data
            const whoopData = await whoopApiService.getTodaysData(userId);

            // Check if we have at least the 3 core metrics (sleep, recovery, strain)
            const hasSleep = !!whoopData.sleep_hours;
            const hasRecovery = !!whoopData.recovery_score;
            const hasStrain = !!whoopData.strain;

            whoopDataAvailable = hasSleep || hasRecovery || hasStrain;

            if (!whoopDataAvailable) {
              missingComponents.push(`WHOOP data for today (no sleep, recovery, or strain data available)`);
            }
          } catch (error) {
            console.warn(`[CHAT SERVICE] Failed to fetch WHOOP data for today:`, error);
            missingComponents.push(`WHOOP data for today (device not synced or data unavailable)`);
          }

          // Check meal data - analyze images if provided
          if (hasMealImages) {
            console.log('[CHAT SERVICE] Analyzing meal images for nutrition...');
            const imageArray = images || (image ? [image] : []);

            // Get user's nutrition goals from profile
            const userGoals = userProfile ? {
              targetCalories: 2500, // Could be from profile
              targetProtein: 150, // Could be from profile
              fitnessGoal: userProfile.goalShort || 'General fitness'
            } : undefined;

            try {
              const analysis = await mealAnalysisService.analyzeMeals({
                imageUrls: imageArray,
                userGoals,
                mealNumber: 1 // Default to first meal, could be smarter
              });
              mealAnalyses.push(analysis);
              console.log('[CHAT SERVICE] Meal analysis successful:', analysis);
            } catch (error) {
              console.error('[CHAT SERVICE] Meal analysis failed:', error);
              console.error('[CHAT SERVICE] Meal analysis error stack:', error instanceof Error ? error.stack : 'No stack');
              missingComponents.push('Meal analysis (image processing failed)');
            }
          }
          // Note: Don't check for missing meals if no images provided
          // User may be asking for FitScore with previous meals or indicating meals separately
          // FitScoreService will handle empty meals gracefully (lower nutrition score)

          // If missing critical components, list them
          if (missingComponents.length > 0) {
            fitScoreData = `\n\n⚠️ **Cannot calculate FitScore - Missing data:**\n\n`;
            missingComponents.forEach(comp => {
              fitScoreData += `- ${comp}\n`;
            });
            fitScoreData += `\nPlease ensure all data is available and try again.\n`;
          } else {
            // All data available - calculate FitScore
            const fitScoreResult = await fitScoreService.getTodaysFitScore(userId, targetDate, mealAnalyses);

            // Format as markdown table for display
            const formatted = fitScoreService.formatAsMarkdownTable(fitScoreResult);

            // Store FitScore data for persona (don't add to context yet)
            (this as any).fitScoreTableForPersona = formatted.table;
            (this as any).fitScoreResultForPersona = fitScoreResult;
            (this as any).mealAnalysesForPersona = mealAnalyses;

            // DO NOT add table to fitScoreData - the LLM will generate the full FitScore output including the table
            // fitScoreData remains empty so the table only appears once in the LLM's response

            console.log(`[CHAT SERVICE] FitScore ${fitScoreResult.result.fitScore}/10 calculated (cached: ${fitScoreResult.isCached})`);
          }
        } catch (error) {
          console.error('[CHAT SERVICE] Failed to calculate FitScore:', error);
          console.error('[CHAT SERVICE] Error stack:', error instanceof Error ? error.stack : 'No stack');
          console.error('[CHAT SERVICE] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
          fitScoreData = '\n\n*FitScore calculation encountered an error. Please try again.*\n';
        }
      }

      // Support both single image (deprecated) and multiple images
      const imageArray = images || (image ? [image] : []);
      const hasImages = imageArray.length > 0;

      console.log(`[CHAT SERVICE] Sending message to OpenAI with context data${hasImages ? ` and ${imageArray.length} image(s)` : ''}`);

      // Build user message content
      let userContent: any;
      if (hasImages) {
        // If images are provided, use vision format
        const contentParts: any[] = [
          {
            type: 'text',
            text: message.trim() || 'Please analyze this image'
          }
        ];

        // Add all images
        imageArray.forEach((img, index) => {
          let imageUrl: string;

          // Check if image is already a URL (HTTP/HTTPS) or data URL
          if (img.startsWith('http://') || img.startsWith('https://')) {
            // Already a URL, use as-is
            imageUrl = img;
            console.log(`[CHAT SERVICE] Image ${index + 1}: URL - ${imageUrl}`);
          } else if (img.startsWith('data:image')) {
            // Already a data URL
            imageUrl = img;
            const base64Data = imageUrl.split(',')[1] || '';
            const sizeKB = Math.round((base64Data.length * 0.75) / 1024);
            console.log(`[CHAT SERVICE] Image ${index + 1}: ~${sizeKB}KB base64`);
          } else {
            // Raw base64, add data URL prefix
            imageUrl = `data:image/jpeg;base64,${img}`;
            const sizeKB = Math.round((img.length * 0.75) / 1024);
            console.log(`[CHAT SERVICE] Image ${index + 1}: ~${sizeKB}KB base64 (prefix added)`);
          }

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'auto'
            }
          });
        });

        userContent = contentParts;
      } else {
        // Text only
        userContent = message.trim();
      }

      // === PERSONA PIPELINE STEP 2: Compose Persona Prompt ===
      console.log('[PERSONA] 🔄 Composing persona-driven prompt...');
      const userMessageText = typeof userContent === 'string' ? userContent : message.trim();

      // Check if we should use FitScore persona (successful FitScore calculation with 2+ meals)
      const useFitScorePersona = !!(this as any).fitScoreTableForPersona && mealImageCount >= 2;

      let systemPrompt: string;
      let userPrompt: string;
      let llmConfig: any;

      if (useFitScorePersona) {
        console.log('[PERSONA] Using FitScore-specific persona for comprehensive analysis');

        // Fetch training event from calendar for target date
        let trainingEvent = '';
        try {
          const { DateTime } = await import('luxon');
          const userCalendars = await storage.getUserCalendars(userId);

          if (userCalendars && userCalendars.length > 0) {
            // Use today's date
            const targetDateStr = new Date().toISOString().split('T')[0];
            const targetDateObj = DateTime.fromISO(targetDateStr).setZone('Europe/Zurich');
            const startDate = targetDateObj.startOf('day');
            const endDate = targetDateObj.endOf('day');

            console.log(`[PERSONA] Fetching calendar events for ${targetDateStr}`);

            const calendarUrls = userCalendars
              .filter(cal => cal.isActive)
              .map(cal => cal.calendarUrl);

            const targetDayEvents: any[] = [];

            const { RRule } = await import('rrule');

            for (const calendarUrl of calendarUrls) {
              try {
                const response = await fetch(calendarUrl);
                if (response.ok) {
                  const icsData = await response.text();
                  const ical = await import('node-ical');
                  const parsed = ical.default.sync.parseICS(icsData);

                  for (const k in parsed) {
                    const event = parsed[k];
                    if (event.type === 'VEVENT' && event.start) {
                      // Check if event is recurring
                      if (event.rrule) {
                        // Handle recurring event - expand occurrences for target date
                        try {
                          const rruleObj = event.rrule as any;
                          const rrule = new RRule({
                            ...rruleObj.options,
                            dtstart: new Date(event.start)
                          });

                          // Get occurrences within target date
                          const occurrences = rrule.between(
                            startDate.toJSDate(),
                            endDate.toJSDate(),
                            true // inclusive
                          );

                          // Add each occurrence
                          occurrences.forEach(occurrence => {
                            const occurrenceStart = DateTime.fromJSDate(occurrence).setZone('Europe/Zurich');
                            targetDayEvents.push({
                              title: event.summary || 'Untitled Event',
                              start: occurrenceStart.toISO(),
                              location: event.location
                            });
                          });
                        } catch (rruleError) {
                          console.warn('[PERSONA] Failed to parse recurring event:', rruleError);
                          // Fall back to single event
                          const eventStart = DateTime.fromJSDate(event.start).setZone('Europe/Zurich');
                          if (eventStart >= startDate && eventStart <= endDate) {
                            targetDayEvents.push({
                              title: event.summary || 'Untitled Event',
                              start: eventStart.toISO(),
                              location: event.location
                            });
                          }
                        }
                      } else {
                        // Handle non-recurring event
                        const eventStart = DateTime.fromJSDate(event.start).setZone('Europe/Zurich');

                        // Only include events for target date
                        if (eventStart >= startDate && eventStart <= endDate) {
                          targetDayEvents.push({
                            title: event.summary || 'Untitled Event',
                            start: eventStart.toISO(),
                            location: event.location
                          });
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.warn('[PERSONA] Failed to fetch/parse calendar:', err);
              }
            }

            if (targetDayEvents.length > 0) {
              trainingEvent = targetDayEvents.map((e: any) => {
                const start = DateTime.fromISO(e.start).toFormat('HH:mm');
                return `${e.title} at ${start}${e.location ? ` (${e.location})` : ''}`;
              }).join(', ');
            }
          }
        } catch (error) {
          console.warn('[PERSONA] Failed to fetch training event:', error);
        }

        // Format meal analysis data for persona
        const mealAnalysisData = (this as any).mealAnalysesForPersona?.map((analysis: any, index: number) => {
          return `Meal ${index + 1}:
- Estimated Macros: ${analysis.estimatedMacros.protein}g protein, ${analysis.estimatedMacros.carbs}g carbs, ${analysis.estimatedMacros.fats}g fats
- Calories: ${analysis.estimatedMacros.calories} kcal
- Nutritional Quality: ${analysis.nutritionalQuality}
- Goals Alignment: ${analysis.goalsAlignment}
- Reasoning: ${analysis.reasoning}`;
        }).join('\n\n') || '';

        // Prioritize database goals over client-passed goals
        const finalGoalsContext = contextPack.goalsContext || goalsContext || null;

        const promptResult = composeFitScorePrompt(
          userMessageText,
          contextPack,
          userProfile,
          mealAnalysisData,
          (this as any).fitScoreTableForPersona,
          trainingEvent,
          recentMessages,
          finalGoalsContext
        );

        systemPrompt = promptResult.systemPrompt;
        userPrompt = promptResult.userPrompt;
        llmConfig = FITSCORE_LLM_CONFIG;
      } else {
        // Use standard persona
        // Prioritize database goals over client-passed goals
        const finalGoalsContext = contextPack.goalsContext || goalsContext || null;

        const promptResult = composePersonaPrompt(
          userMessageText,
          contextPack,
          userProfile,
          recentMessages,
          finalGoalsContext
        );

        systemPrompt = promptResult.systemPrompt;
        userPrompt = promptResult.userPrompt;
        llmConfig = PERSONA_LLM_CONFIG;
      }

      console.log('[PERSONA] ✅ Persona prompt composed');

      // Build messages array using persona composer
      let contextMessages = buildMessagesArray(systemPrompt, userPrompt, recentMessages);

      // If we have images, replace the last user message with vision format
      if (hasImages) {
        console.log(`[PERSONA] Adding ${imageArray.length} image(s) to user message`);
        const contentParts: any[] = [
          {
            type: 'text',
            text: userPrompt
          }
        ];

        // Add all images
        imageArray.forEach((img, index) => {
          let imageUrl: string;

          if (img.startsWith('http://') || img.startsWith('https://')) {
            imageUrl = img;
          } else if (img.startsWith('data:image')) {
            imageUrl = img;
          } else {
            imageUrl = `data:image/jpeg;base64,${img}`;
          }

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'auto'
            }
          });
        });

        // Replace last user message with vision format
        contextMessages[contextMessages.length - 1].content = contentParts;
      }

      // Truncate if needed to stay within token limits
      const truncatedMessages = this.truncateContextMessages(contextMessages, 6000);

      const requestBody = {
        model: this.model,
        messages: truncatedMessages,
        max_completion_tokens: llmConfig.maxTokens,
        temperature: llmConfig.temperature,
        presence_penalty: llmConfig.presencePenalty,
        frequency_penalty: llmConfig.frequencyPenalty,
        top_p: llmConfig.topP
      };

      // Log the system prompt being sent
      const systemMessage = truncatedMessages.find(m => m.role === 'system');
      if (systemMessage) {
        console.log(`[CHAT SERVICE] System prompt preview: ${systemMessage.content.substring(0, 200)}...`);
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;

        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed?.error?.message || errorMessage;
          console.error(`[CHAT SERVICE] OpenAI API Error:`, JSON.stringify(parsed, null, 2));
        } catch {
          console.error(`[CHAT SERVICE] OpenAI API Error (unparseable):`, errorText);
        }

        throw new ChatServiceError({
          type: ChatErrorType.OPENAI_ERROR,
          message: errorMessage,
          statusCode: response.status,
          retryable: response.status >= 500
        });
      }

      const data = await response.json();
      console.log(`[CHAT SERVICE] OpenAI raw response:`, JSON.stringify(data, null, 2));

      const reply = data.choices?.[0]?.message?.content;

      if (!reply) {
        console.error(`[CHAT SERVICE] No content in response. Full data:`, data);
        throw new ChatServiceError({
          type: ChatErrorType.OPENAI_ERROR,
          message: 'No response content from OpenAI',
          retryable: true,
          details: data
        });
      }

      console.log(`[CHAT SERVICE] Successfully received response from OpenAI (${reply.length} chars)`);

      // === PERSONA PIPELINE STEP 3: Add Reflection ===
      console.log('[REFLECT] 🔄 Analyzing reflection triggers...');
      const finalReply = maybeAddReflection(
        message.trim(),
        reply,
        contextPack,
        previousFitScore
      );
      console.log('[REFLECT] ✅ Reflection analysis complete');

      // Post-process: Add emojis if response doesn't have any (but keep subtle)
      let processedReply = this.addEmojisToResponse(finalReply);

      if (processedReply !== finalReply) {
        console.log(`[CHAT SERVICE] Added emojis to response (original had none)`);
      }

      // Append FitScore table if it was calculated
      if (fitScoreData) {
        processedReply += fitScoreData;
        console.log('[CHAT SERVICE] Appended FitScore breakdown table to response');
      }

      console.log('[FINAL] ✅ Final reply ready for delivery');

      // Save both user and assistant messages to chat history
      await this.saveChatMessage(userId, 'user', message.trim(), hasImages, imageArray.length);
      await this.saveChatMessage(userId, 'assistant', processedReply);

      return { reply: processedReply };

    } catch (error) {
      if (error instanceof ChatServiceError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ChatServiceError({
          type: ChatErrorType.NETWORK_ERROR,
          message: 'Network timeout contacting OpenAI',
          retryable: true
        });
      }

      throw new ChatServiceError({
        type: ChatErrorType.UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        retryable: false
      });
    }
  }

  public async testConnection(): Promise<ChatResponse> {
    return { reply: 'Coach is online! Chat service is ready.' };
  }
}

export const chatService = new ChatService();