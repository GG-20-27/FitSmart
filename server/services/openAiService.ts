/**
 * OpenAI Service - Handles all GPT interactions with proper persona definitions
 */
import '../loadEnv';

const FITCOACH_DAILY_SUMMARY_PROMPT = `You are fitCoachAi, a warm and supportive wellness coach for the FitSmart app.

Your role is to provide a personal, human daily summary that speaks to the WHOLE person - not just their numbers.

CRITICAL RULES:
- NEVER mention specific numbers, percentages, or scores
- NEVER say things like "your recovery was 85%" or "you scored 7.2"
- Speak to patterns, effort, consistency, mindset, and how they might be feeling
- Be warm, supportive, and human - like a trusted coach who knows them
- Use "you" language - this is personal

FitCoach's Take (2-4 sentences):
- Acknowledge their day with empathy
- Connect the dots between their metrics holistically
- Speak to effort and intention, not outcomes
- End with encouragement or gentle insight

Tomorrow's Outlook (1-2 sentences):
- Forward-looking, soft motivational guidance
- No metrics or numbers
- Focus on one actionable mindset or behavior

Example good response:
{
  "fitCoachTake": "Today wasn't easy, and that's perfectly normal. Your body is telling you it needs a bit more rest — and listening to that is a strength, not a setback. You showed up anyway, and that matters.",
  "tomorrowsOutlook": "An early wind-down tonight will set you up for a strong start tomorrow. Trust the process."
}

Example bad response (too many numbers):
{
  "fitCoachTake": "Your recovery score of 65% means you should take it easy. With only 5 hours of sleep..." - DON'T mention numbers!
}

Always respond in JSON format with fitCoachTake and tomorrowsOutlook fields.`;

const FITCOACH_TRAINING_SYSTEM_PROMPT = `You are fitCoachAi, a concise training coach for the FitSmart app.

Provide a SHORT analysis (2-3 sentences max) focusing ONLY on:
1. The actual WHOOP strain value and what it means for this session
2. How the training aligns with the user's fitness goal
3. Any injury/recovery concerns if relevant

CRITICAL RULES:
- If strain data is provided, ALWAYS mention the specific strain number (e.g., "Your strain of 10.6...")
- DO NOT explain the scoring breakdown or percentages
- DO NOT explain what metrics measure
- Be direct, warm, and actionable
- End with brief encouragement or a quick tip

Good example:
"Your strain of 8.4 was appropriate for your moderate recovery today. This run supports your endurance goal well - keep it up!"

Bad example (too long):
"The session quality score of 2.6/3.0 reflects your ability to maintain pace..." - DON'T explain metrics like this.

Always respond in JSON format:
{
  "training_analysis": "<2-3 sentence analysis>"
}`;

const FITSCORE_AI_SYSTEM_PROMPT = `You are fitScoreAi, a nutrition analysis expert for the FitSmart app.

Your role is to analyze meal images and provide:
1. A nutrition quality score (1-10 scale)
2. Warm, empathetic analysis with microhabit suggestions

Guidelines:
- Start with something positive and descriptive about the meal
- Be empathetic, warm, and encouraging
- Describe what the meal IS, not just what it lacks
- If suggesting improvements, frame them as small, actionable microhabits
- Always include at least one empathetic or encouraging sentence
- Keep analysis concise (2-4 sentences)
- Use phrases like "a tasty way to...", "great choice for...", "consider adding...", "perhaps try..."

Scoring criteria:
- 8-10: Excellent nutrition (balanced macros, nutrient-dense, appropriate portions)
- 5-7: Good nutrition (decent balance but room for improvement)
- 3-4: Fair nutrition (imbalanced or low quality ingredients)
- 1-2: Poor nutrition (highly processed, very imbalanced)

Example tone:
"Pancakes are a really tasty way to start the day, and the 40g protein is excellent for muscle maintenance. The meal's overall balance could benefit from adding some healthy fats like nuts or avocado, and perhaps some berries for fiber."

Always respond in JSON format:
{
  "nutrition_subscore": <number 1-10>,
  "ai_analysis": "<warm, empathetic analysis with microhabit suggestions>"
}`;

export interface MealAnalysisResult {
  nutrition_subscore: number;
  ai_analysis: string;
}

export interface TrainingAnalysisResult {
  training_analysis: string;
}

export interface DailySummaryResult {
  fitCoachTake: string;
  tomorrowsOutlook: string;
}

export class OpenAIService {
  private readonly apiKey: string;
  private readonly visionModel: string;
  private readonly textModel: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.visionModel = 'gpt-4o';  // GPT-4 Vision model
    this.textModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!this.apiKey) {
      console.error('[OpenAI Service] API key not configured');
    } else {
      console.log(`[OpenAI Service] Configured with vision model: ${this.visionModel}`);
    }
  }

  /**
   * Analyze a meal image using fitScoreAi persona
   * @param imageUrl Full URL to the meal image
   * @param mealType Type of meal (Breakfast, Lunch, etc.)
   * @param mealNotes Optional user notes about the meal
   */
  async analyzeMealImage(
    imageUrl: string,
    mealType: string,
    mealNotes?: string
  ): Promise<MealAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Analyzing ${mealType} image: ${imageUrl}`);

      const userPrompt = `Analyze this ${mealType} meal image.${
        mealNotes ? `\n\nUser notes: "${mealNotes}"` : ''
      }

Provide a nutrition quality score (1-10) and detailed analysis.
Focus on macronutrient balance, meal quality, and actionable recommendations.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'system',
              content: FITSCORE_AI_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userPrompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_completion_tokens: 300,
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenAI Service] API error ${response.status}: ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result = JSON.parse(content) as MealAnalysisResult;

      // Validate response
      if (typeof result.nutrition_subscore !== 'number' ||
          result.nutrition_subscore < 1 ||
          result.nutrition_subscore > 10) {
        throw new Error('Invalid nutrition score from AI');
      }

      if (!result.ai_analysis || result.ai_analysis.length < 10) {
        throw new Error('Invalid analysis from AI');
      }

      console.log(`[OpenAI Service] Analysis complete: score ${result.nutrition_subscore}/10`);
      return result;

    } catch (error) {
      console.error('[OpenAI Service] Failed to analyze meal:', error);

      // Return fallback response
      return {
        nutrition_subscore: 5,
        ai_analysis: 'Meal analysis temporarily unavailable. Please try again later.'
      };
    }
  }

  /**
   * Analyze a training session using fitCoachAi persona
   * Provides contextual insights connecting WHOOP metrics, score breakdown, and user goals
   */
  async analyzeTrainingSession(params: {
    trainingType: string;
    duration: number;
    intensity?: string;
    goal?: string;
    comment?: string;
    score: number;
    breakdown: {
      strainAppropriatenessScore: number;
      sessionQualityScore: number;
      goalAlignmentScore: number;
      injurySafetyModifier: number;
    };
    recoveryScore?: number;
    strainScore?: number;
    sleepScore?: number;
    recoveryZone: 'green' | 'yellow' | 'red';
    userGoal?: string;
  }): Promise<TrainingAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Analyzing training session: ${params.trainingType}`);

      // Build concise context prompt focused on key data
      const contextParts = [];

      // Training details
      contextParts.push(`Training: ${params.trainingType}, ${params.duration} min, ${params.intensity || 'unspecified'} intensity`);

      // WHOOP data - emphasize strain
      if (params.strainScore) {
        contextParts.push(`WHOOP Strain: ${params.strainScore.toFixed(1)} (scale 0-21)`);
      }
      if (params.recoveryScore) {
        contextParts.push(`Recovery: ${Math.round(params.recoveryScore)}% (${params.recoveryZone} zone)`);
      }

      // Score
      contextParts.push(`Score: ${params.score.toFixed(1)}/10`);

      // Goal
      if (params.userGoal) {
        contextParts.push(`Fitness Goal: ${params.userGoal}`);
      }

      // User comment if any
      if (params.comment) {
        contextParts.push(`User notes: "${params.comment}"`);
      }

      const userPrompt = contextParts.join('\n');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.textModel,
          messages: [
            {
              role: 'system',
              content: FITCOACH_TRAINING_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          max_completion_tokens: 200,
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenAI Service] API error ${response.status}: ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result = JSON.parse(content) as TrainingAnalysisResult;

      // Validate response
      if (!result.training_analysis || result.training_analysis.length < 20) {
        throw new Error('Invalid training analysis from AI');
      }

      console.log(`[OpenAI Service] Training analysis complete`);
      return result;

    } catch (error) {
      console.error('[OpenAI Service] Failed to analyze training:', error);

      // Return fallback response with basic context
      const strainPart = params.strainScore ? `Your strain of ${params.strainScore.toFixed(1)} ` : 'This ';
      const basicAnalysis = `${strainPart}${params.trainingType} session scored ${params.score.toFixed(1)}/10 in the ${params.recoveryZone} zone. Keep listening to your body!`;

      return {
        training_analysis: basicAnalysis
      };
    }
  }

  /**
   * Generate daily FitCoach summary using fitCoachAi persona
   * Provides warm, supportive summary without raw numbers
   */
  async generateDailySummary(params: {
    recoveryZone: 'green' | 'yellow' | 'red';
    trainingZone: 'green' | 'yellow' | 'red';
    nutritionZone: 'green' | 'yellow' | 'red';
    fitScoreZone: 'green' | 'yellow' | 'red';
    hadTraining: boolean;
    hadMeals: boolean;
    sleepQuality: 'good' | 'moderate' | 'poor';
    hrvTrend: 'above_baseline' | 'near_baseline' | 'below_baseline';
    userGoal?: string;
  }): Promise<DailySummaryResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Generating daily FitCoach summary`);

      // Build context without exposing raw numbers
      const contextParts = [];

      // Recovery context
      const recoveryDescriptions = {
        green: 'well-recovered and energized',
        yellow: 'moderately recovered with some fatigue signals',
        red: 'showing signs of accumulated stress or fatigue'
      };
      contextParts.push(`Recovery state: ${recoveryDescriptions[params.recoveryZone]}`);

      // Sleep context
      const sleepDescriptions = {
        good: 'had a restful night',
        moderate: 'sleep was okay but not optimal',
        poor: 'sleep was disrupted or insufficient'
      };
      contextParts.push(`Sleep: ${sleepDescriptions[params.sleepQuality]}`);

      // HRV context
      const hrvDescriptions = {
        above_baseline: 'HRV trending above their personal baseline (good adaptation)',
        near_baseline: 'HRV at typical levels',
        below_baseline: 'HRV below baseline (body under some stress)'
      };
      contextParts.push(`HRV: ${hrvDescriptions[params.hrvTrend]}`);

      // Training context
      if (params.hadTraining) {
        const trainingDescriptions = {
          green: 'Training was well-balanced for their recovery level',
          yellow: 'Training was acceptable but could be better aligned',
          red: 'Training may have been too intense or misaligned with recovery'
        };
        contextParts.push(`Training: ${trainingDescriptions[params.trainingZone]}`);
      } else {
        contextParts.push('Training: Rest day (no training logged)');
      }

      // Nutrition context
      if (params.hadMeals) {
        const nutritionDescriptions = {
          green: 'Nutrition was excellent today',
          yellow: 'Nutrition was decent with room for improvement',
          red: 'Nutrition needs attention'
        };
        contextParts.push(`Nutrition: ${nutritionDescriptions[params.nutritionZone]}`);
      } else {
        contextParts.push('Nutrition: No meals logged yet');
      }

      // Overall day
      const overallDescriptions = {
        green: 'Overall a strong day',
        yellow: 'A balanced day with some areas to work on',
        red: 'A challenging day - rest and recovery are important'
      };
      contextParts.push(`Overall: ${overallDescriptions[params.fitScoreZone]}`);

      // User goal if available
      if (params.userGoal) {
        contextParts.push(`Fitness goal: ${params.userGoal}`);
      }

      const userPrompt = `Generate a warm, supportive daily summary for this user. Remember: NO numbers or percentages!

Context:
${contextParts.join('\n')}

Provide FitCoach's Take (2-4 sentences) and Tomorrow's Outlook (1-2 sentences).`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.textModel,
          messages: [
            {
              role: 'system',
              content: FITCOACH_DAILY_SUMMARY_PROMPT
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          max_completion_tokens: 300,
          temperature: 0.8,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenAI Service] API error ${response.status}: ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result = JSON.parse(content) as DailySummaryResult;

      // Validate response
      if (!result.fitCoachTake || result.fitCoachTake.length < 20) {
        throw new Error('Invalid fitCoachTake from AI');
      }
      if (!result.tomorrowsOutlook || result.tomorrowsOutlook.length < 10) {
        throw new Error('Invalid tomorrowsOutlook from AI');
      }

      console.log(`[OpenAI Service] Daily summary generated successfully`);
      return result;

    } catch (error) {
      console.error('[OpenAI Service] Failed to generate daily summary:', error);

      // Return fallback response based on overall zone
      const fallbacks = {
        green: {
          fitCoachTake: "You're in a great place today. Your body is responding well, and your efforts are paying off. Keep trusting the process and stay consistent.",
          tomorrowsOutlook: "Carry this momentum forward — tomorrow is yours to own."
        },
        yellow: {
          fitCoachTake: "Today was solid, even if it wasn't perfect. Progress isn't always linear, and showing up matters more than being perfect. You're doing the work.",
          tomorrowsOutlook: "A good night's rest will help you come back stronger tomorrow."
        },
        red: {
          fitCoachTake: "Today might have felt tough, and that's okay. Your body is asking for a little extra care right now. Rest is productive too — it's how you come back stronger.",
          tomorrowsOutlook: "Be gentle with yourself tonight. Tomorrow is a fresh start."
        }
      };

      return fallbacks[params.fitScoreZone] || fallbacks.yellow;
    }
  }
}

export const openAIService = new OpenAIService();
