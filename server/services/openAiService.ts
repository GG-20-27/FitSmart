/**
 * OpenAI Service - Handles all GPT interactions with proper persona definitions
 */
import '../loadEnv';

const FITCOACH_TRAINING_SYSTEM_PROMPT = `You are fitCoachAi, a training analysis expert for the FitSmart app.

Your role is to analyze training sessions and provide:
1. A detailed explanation of the training score breakdown
2. Contextual insights connecting WHOOP metrics, recovery state, and user goals
3. Specific, actionable recommendations for improvement

Guidelines:
- ALWAYS reference specific metrics when available (strain, recovery %, sleep scores)
- When strain data is provided, MUST mention the actual strain value in your analysis
- Explain WHY the score is what it is, not just WHAT the score is
- Connect training decisions to recovery state and fitness goals
- Relate the strain value to the strain appropriateness score (e.g., "today's strain of 10.6 aligns well with your 3.0/4.0 strain appropriateness")
- Provide concrete next steps or microhabits
- Be encouraging but honest about training appropriateness
- End with a call-to-action (e.g., "Ask FitCoach if you need specific exercises for that!")
- Keep analysis concise but detailed (3-5 sentences)

Example tone with strain data:
"This moderate 45-minute run makes perfect sense as a recovery session given your 65% recovery. Today's strain of 10.1 aligns well with your strain appropriateness score of 3.2/4.0, showing you understood the task of taking it easy. The session quality was solid, and running aligns well with your endurance goal. However, your goal alignment score is lower because you're also working on movement fluidity - consider adding a 15-minute mobility session after your next run to support your court movement goal. Ask FitCoach if you need specific mobility exercises!"

Always respond in JSON format:
{
  "training_analysis": "<detailed, contextual analysis explaining the score>"
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

      // Build context prompt with all available data
      const contextParts = [];
      contextParts.push(`Training: ${params.trainingType} for ${params.duration} minutes`);
      if (params.intensity) contextParts.push(`at ${params.intensity} intensity`);
      if (params.goal) contextParts.push(`with goal: ${params.goal}`);
      if (params.comment) contextParts.push(`User notes: "${params.comment}"`);

      contextParts.push(`\nOverall Training Score: ${params.score.toFixed(1)}/10 (${params.recoveryZone.toUpperCase()} ZONE)`);

      contextParts.push(`\nScore Breakdown:`);
      contextParts.push(`- Strain Appropriateness: ${params.breakdown.strainAppropriatenessScore.toFixed(1)}/4.0 (40%)`);
      contextParts.push(`- Session Quality: ${params.breakdown.sessionQualityScore.toFixed(1)}/3.0 (30%)`);
      contextParts.push(`- Goal Alignment: ${params.breakdown.goalAlignmentScore.toFixed(1)}/2.0 (20%)`);
      contextParts.push(`- Injury Safety: ${params.breakdown.injurySafetyModifier.toFixed(1)}/1.0 (10%)`);

      if (params.recoveryScore || params.strainScore || params.sleepScore) {
        contextParts.push(`\nWHOOP Metrics:`);
        if (params.recoveryScore) contextParts.push(`- Recovery: ${Math.round(params.recoveryScore)}%`);
        if (params.strainScore) contextParts.push(`- Strain: ${params.strainScore.toFixed(1)}`);
        if (params.sleepScore) contextParts.push(`- Sleep: ${Math.round(params.sleepScore)}%`);
      }

      if (params.userGoal) {
        contextParts.push(`\nUser's Fitness Goal: ${params.userGoal}`);
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
          max_completion_tokens: 400,
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
      const basicAnalysis = `Your ${params.trainingType} session scored ${params.score.toFixed(1)}/10. ` +
        `This training was performed in the ${params.recoveryZone} recovery zone. ` +
        `Consider your recovery metrics when planning your next session.`;

      return {
        training_analysis: basicAnalysis
      };
    }
  }
}

export const openAIService = new OpenAIService();
