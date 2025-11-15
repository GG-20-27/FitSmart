import './loadEnv';
import { db } from './db';
import { chatHistory, chatSummaries, users } from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';

const SUMMARIZATION_PROMPT = `
You are a conversation summarization assistant for FitScore AI, a fitness coaching app.

Analyze the following chat conversation and create a concise summary (under 250 words) that captures:
- User's fitness goals and challenges
- Key health metrics discussed (recovery, strain, HRV, sleep patterns)
- Training schedule and workout patterns
- Dietary habits or meal analysis insights
- Assistant's key recommendations and advice
- Important context for future conversations

Focus on information that will help provide personalized coaching in future sessions.
Keep the summary factual and concise.

Conversation to summarize:
`;

export class ChatSummarizationService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!this.apiKey) {
      console.warn('[SUMMARIZATION SERVICE] OpenAI API key not configured - summarization unavailable');
    } else {
      console.log(`[SUMMARIZATION SERVICE] Configured with model: ${this.model}`);
    }
  }

  /**
   * Summarize recent chat history for a user
   * @param userId User ID to summarize
   * @param messageLimit Number of recent messages to include (default: 100)
   */
  async summarizeUserConversation(userId: string, messageLimit: number = 100): Promise<void> {
    if (!this.apiKey) {
      console.error('[SUMMARIZATION SERVICE] Cannot summarize - API key not configured');
      return;
    }

    try {
      console.log(`[SUMMARIZATION SERVICE] Starting summarization for user: ${userId}`);

      // Fetch recent messages (last 100 or specified limit)
      const messages = await db
        .select({
          role: chatHistory.role,
          content: chatHistory.content,
          createdAt: chatHistory.createdAt
        })
        .from(chatHistory)
        .where(eq(chatHistory.userId, userId))
        .orderBy(desc(chatHistory.createdAt))
        .limit(messageLimit);

      if (messages.length === 0) {
        console.log(`[SUMMARIZATION SERVICE] No messages found for user ${userId}`);
        return;
      }

      console.log(`[SUMMARIZATION SERVICE] Found ${messages.length} messages to summarize`);

      // Build conversation text (oldest first)
      const conversationText = messages
        .reverse()
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      // Call OpenAI to generate summary
      const summary = await this.generateSummary(conversationText);

      if (!summary) {
        console.error('[SUMMARIZATION SERVICE] Failed to generate summary');
        return;
      }

      // Save or update summary in database
      await this.saveSummary(userId, summary, messages.length);

      console.log(`[SUMMARIZATION SERVICE] Successfully summarized ${messages.length} messages for user ${userId}`);
    } catch (error) {
      console.error('[SUMMARIZATION SERVICE] Error during summarization:', error);
      throw error;
    }
  }

  /**
   * Generate summary using OpenAI API
   */
  private async generateSummary(conversationText: string): Promise<string | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: SUMMARIZATION_PROMPT
            },
            {
              role: 'user',
              content: conversationText
            }
          ],
          max_completion_tokens: 400,
          temperature: 0.3 // Lower temperature for more consistent summaries
        })
      });

      if (!response.ok) {
        console.error(`[SUMMARIZATION SERVICE] OpenAI API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content;

      return summary || null;
    } catch (error) {
      console.error('[SUMMARIZATION SERVICE] Failed to call OpenAI API:', error);
      return null;
    }
  }

  /**
   * Save or update summary in database
   */
  private async saveSummary(userId: string, summary: string, messageCount: number): Promise<void> {
    try {
      // Check if summary already exists
      const existing = await db
        .select()
        .from(chatSummaries)
        .where(eq(chatSummaries.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing summary
        await db
          .update(chatSummaries)
          .set({
            summary,
            messageCount,
            updatedAt: new Date()
          })
          .where(eq(chatSummaries.userId, userId));

        console.log(`[SUMMARIZATION SERVICE] Updated summary for user ${userId}`);
      } else {
        // Insert new summary
        await db
          .insert(chatSummaries)
          .values({
            userId,
            summary,
            messageCount
          });

        console.log(`[SUMMARIZATION SERVICE] Created new summary for user ${userId}`);
      }
    } catch (error) {
      console.error('[SUMMARIZATION SERVICE] Failed to save summary:', error);
      throw error;
    }
  }

  /**
   * Summarize conversations for all active users
   * Useful for scheduled jobs (cron/n8n)
   */
  async summarizeAllUsers(): Promise<void> {
    try {
      console.log('[SUMMARIZATION SERVICE] Starting summarization for all users');

      // Get all users with recent chat activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const activeUsers = await db
        .selectDistinct({
          userId: chatHistory.userId
        })
        .from(chatHistory)
        .where(gte(chatHistory.createdAt, sevenDaysAgo));

      console.log(`[SUMMARIZATION SERVICE] Found ${activeUsers.length} active users`);

      for (const { userId } of activeUsers) {
        try {
          await this.summarizeUserConversation(userId);
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`[SUMMARIZATION SERVICE] Failed to summarize for user ${userId}:`, error);
          // Continue with next user
        }
      }

      console.log('[SUMMARIZATION SERVICE] Completed summarization for all users');
    } catch (error) {
      console.error('[SUMMARIZATION SERVICE] Error in summarizeAllUsers:', error);
      throw error;
    }
  }
}

export const chatSummarizationService = new ChatSummarizationService();
