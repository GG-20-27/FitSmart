import './loadEnv';
import type { ChatResponse } from '@shared/schema';
import { whoopApiService } from './whoopApiService';
import type { WhoopTodayResponse } from '@shared/schema';
import { buildContextPack } from './services/contextPack';
import { composePersonaPrompt, buildMessagesArray, PERSONA_LLM_CONFIG } from './prompt/personaComposer';
import { maybeAddReflection } from './utils/reflectionPlanner';

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

  public async sendChat({ userId, message, image, images }: SendChatOptions): Promise<ChatResponse> {
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

      let contextData = '';

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
- Resting Heart Rate: ${whoopData.resting_heart_rate ?? 'N/A'}bpm\n`;

          // Fetch yesterday's data if user asks about trends or yesterday
          if (lowerMessage.includes('yesterday') || lowerMessage.includes('trend')) {
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
          }

          // Fetch weekly data if user asks about averages or week
          if (lowerMessage.includes('week') || lowerMessage.includes('average') || lowerMessage.includes('trend')) {
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
            // Fetch events for the next 7 days (not just today)
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
                  for (const k in parsed) {
                    const event = parsed[k];
                    if (event.type === 'VEVENT' && event.start) {
                      const eventStart = DateTime.fromJSDate(event.start).setZone('Europe/Zurich');
                      const eventEnd = event.end ? DateTime.fromJSDate(event.end).setZone('Europe/Zurich') : eventStart;

                      // Include events happening today or in the next 7 days
                      if (eventStart >= startDate && eventStart <= endDate) {
                        allEvents.push({
                          title: event.summary || 'Untitled Event',
                          start: eventStart.toISO(),
                          end: eventEnd.toISO(),
                          location: event.location,
                          isToday: eventStart >= today.startOf('day') && eventStart <= today.endOf('day')
                        });
                        eventCount++;
                      }
                    }
                  }
                  console.log(`[CHAT SERVICE] Parsed ${eventCount} events from calendar`);
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
                contextData += `Today's Training Schedule (${today.toFormat('MMM d')}):\n`;
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
            text: message.trim() || 'Analyze these meal images and provide nutritional insights'
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
              detail: 'low' // Use low detail for faster processing and lower cost
            }
          });
        });

        userContent = contentParts;
      } else {
        // Text only
        userContent = message.trim();
      }

      // Build context messages array with hybrid memory
      const contextMessages: Array<any> = [
        {
          role: 'system',
          content: SYSTEM_PROMPT + contextData
        }
      ];

      // Add summary as assistant context if available
      if (latestSummary) {
        contextMessages.push({
          role: 'assistant',
          content: `[Previous conversation summary: ${latestSummary}]`
        });
      }

      // Add recent message history
      recentMessages.forEach(msg => {
        contextMessages.push({
          role: msg.role,
          content: msg.content
        });
      });

      // Add current user message with emoji reminder
      const userMessageContent = typeof userContent === 'string'
        ? `${userContent}\n\n[REMINDER: Include emojis in your response - start and end with one!]`
        : userContent;

      contextMessages.push({
        role: 'user',
        content: userMessageContent
      });

      // Truncate if needed to stay within token limits
      const truncatedMessages = this.truncateContextMessages(contextMessages, 6000);

      const requestBody = {
        model: this.model, // gpt-4o supports both vision and text
        messages: truncatedMessages,
        max_completion_tokens: 500,
        temperature: 0.9 // Higher temperature for more creative/emoji-rich responses
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

      // Post-process: Add emojis if response doesn't have any
      const processedReply = this.addEmojisToResponse(reply);

      if (processedReply !== reply) {
        console.log(`[CHAT SERVICE] Added emojis to response (original had none)`);
      }

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