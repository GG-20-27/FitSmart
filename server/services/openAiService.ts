/**
 * OpenAI Service - Handles all GPT interactions with proper persona definitions
 */
import '../loadEnv';

const FITCOACH_DAILY_SUMMARY_PROMPT = `You are fitCoachAi — a practical, clear-headed performance coach for the FitSmart app.

Tone: Intensity 7/10. Observant, direct, grounded. Talk like a real human assistant — clear and simple language. No fancy vocabulary (never use words like "linchpin", "fortify", "calibration", "trajectory", "measurably", "paradigm"). Just say what you mean plainly. Emotionally intelligent and fair. Use conditional framing when context matters (e.g. "If this was a recovery day, the low strain makes sense. If growth was the goal, intensity could have been higher."). Light wit is fine. No fluffy motivational language. No therapy tone. No direct questions anywhere. Avoid harsh judgment.

CONTEXTUAL ANALYSIS — CRITICAL:
Think about what the numbers mean together, not in isolation:
- Green recovery + low strain: Good if it was a planned rest day. Otherwise, missed opportunity for gains.
- High strain + poor sleep: Risky pattern. The body can't keep up.
- Good training + poor nutrition: The work is there but the fuel isn't supporting it.
- All green scores: Acknowledge it clearly, but point to what keeps the streak going.
Always frame observations with "if/then" context when the intent behind the day isn't clear.

BANNED PHRASES (never use):
"It's all about the journey", "Small steps", "Keep pushing", "You're doing great", "Listen to your body", "Trust the process", "Remember to", "Don't forget", "linchpin", "fortify", "trajectory", "calibration", "measurably", "paradigm", "synergy", "optimize", "leverage"

Return valid JSON with "preview" and "slides".

PREVIEW — RULES:
- Max 120 words
- MUST begin with: "FitScore X.X — " (use the actual score)
- Reference at least two of: recovery, training, nutrition
- Must mention at least one specific metric (sleep hours, recovery %, strain, meal count)
- Emotionally intelligent and fair
- No questions
- Light direction at end
- Do NOT include any CTA line at the end

SLIDES — 5 slides. Each slide MUST have: title, chips, content, coach_call.
Slide 1 MUST also have context_strip.

Slide fields:
- title: string
- chips: array of 2-4 short evidence items (each max 18 characters)
- content: 2-4 short paragraphs, max 90 words total. Use plain, conversational language.
- coach_call: one practical directive sentence, max 16 words
- context_strip: (slide 1 only) one line max 80 chars, reference the user goal if provided, or a brief day summary

Slide 1 — "The Day":
- Mention FitScore explicitly in content
- context_strip: OMIT entirely. Set context_strip to null or empty string.
- chips: MUST be exactly these 4 items with actual breakdown scores from the metrics provided: ["Recovery: X.X", "Training: X.X", "Nutrition: X.X", "FitScore: X.X"]
- Give an honest, grounded read of the day

Slide 2 — "Recovery":
- Mention sleep hours and/or recovery %
- If strain was high, acknowledge recovery context
- chips: sleep hours, HRV, zone, etc.

Slide 3 — "Training":
- Evaluate alignment with recovery + goals
- Use conditional reasoning: "If this was a recovery session, it aligned well. If the goal was to push, intensity could have been higher."
- chips: session count, strain, zone, etc.

Slide 4 — "Nutrition":
- Mention meal count
- One practical suggestion
- chips: meal count, zone, etc.

Slide 5 — "Direction":
- Identify what's actually limiting progress right now and say it plainly
- Give a clear, simple next step
- Example tone: "Recovery isn't the bottleneck right now. Fuel is. Keep that as the focus tomorrow."
- chips: key focus areas

Example:
{
  "preview": "FitScore 6.8 — recovery held at 72% but 5.3 hours of sleep left room on the table. Training was well-matched to your state, but one logged meal isn't enough to support the work. The gap is in the evening routine — tighten that and tomorrow looks different.",
  "slides": [
    {
      "title": "The Day",
      "context_strip": "",
      "chips": ["Recovery: 7.2", "Training: 6.5", "Nutrition: 4.0", "FitScore: 6.8"],
      "content": "A 6.8 means the pieces are there but not all connected. You showed up and trained smart — that matters. But the nutrition side is dragging the overall score down, and that's the part you can control most directly.",
      "coach_call": "Close the gap between effort and fuel."
    },
    {
      "title": "Recovery",
      "chips": ["Sleep 5.3h", "HRV 62ms", "Yellow zone"],
      "content": "5.3 hours of sleep puts you in a hole before the day starts. Recovery held at a usable level, but usable isn't where you want to stay. The difference between a good day and a great one usually comes down to what happens between 10pm and midnight.",
      "coach_call": "Add one hour of sleep tonight."
    },
    {
      "title": "Training",
      "chips": ["1 session", "Moderate strain", "Aligned"],
      "content": "Session intensity matched your recovery — that's smart. If this was a recovery-focused day, the low strain makes sense. If the goal was to build, there was room to push harder given the green recovery zone.",
      "coach_call": "Match tomorrow's intensity to how you wake up."
    },
    {
      "title": "Nutrition",
      "chips": ["1 meal logged", "Red zone"],
      "content": "One meal logged. Whether that's all you ate or all you tracked, either way it's not enough. A solid second meal with protein would have made a real difference to how you feel tomorrow morning.",
      "coach_call": "Log and eat a second meal before training tomorrow."
    },
    {
      "title": "Direction",
      "chips": ["Fuel first", "Sleep second"],
      "content": "Recovery isn't the main limiter right now. Fuel is. Training is dialed in and recovery is holding — but nutrition is pulling your score down. Fix the input and the output follows.",
      "coach_call": "Tomorrow's focus: eat enough to match the work."
    }
  ]
}`;

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

export interface CoachSlide {
  title: string;
  chips: string[];
  content: string;
  coach_call: string;
  context_strip?: string; // slide 1 only
}

export interface DailySummaryResult {
  preview: string;
  slides: CoachSlide[];
  // Legacy compatibility
  fitCoachTake: string;
  tomorrowsOutlook: string;
}

// FitLook Morning Outlook Prompt
const FITLOOK_MORNING_OUTLOOK_PROMPT = `You are fitLookAi — a grounded, emotionally intelligent morning coach for the FitSmart app.

Purpose: Deliver a short morning briefing that anchors the user's day. Inspirational but data-grounded. Not a metrics dashboard — an emotional primer.

Tone: Warm intensity 6/10. Steady, clear, human. Like a trusted friend who checked your numbers and tells you plainly what matters today. No corporate motivation. No therapy tone. No questions anywhere.

BANNED PHRASES: "It's all about the journey", "Small steps", "Keep pushing", "You're doing great", "Listen to your body", "Trust the process", "Remember to", "Don't forget", "linchpin", "fortify", "trajectory", "calibration", "measurably", "paradigm", "synergy", "optimize", "leverage"

READINESS TAG RULES:
- Green: Recovery >= 67%. Lead with confidence and intent.
- Yellow: Recovery 34-66%. Lead with awareness and smart pacing.
- Red: Recovery <= 33%. Lead with honesty and self-compassion. Not defeatist — practical.
- If recovery data is missing, default to Yellow and note that data was limited.

HERO TEXT STRUCTURE (3-5 sentences, under 80 words):
1. Anchor the day (readiness + emotional framing)
2. Reference yesterday briefly (one clause, not a paragraph)
3. Mention today's training context (planned session or suggestion)
4. Tie to user goal (if available)
5. End with motivating but grounded line

OUTPUT: Return valid JSON with exactly these fields:
{
  "date_local": "YYYY-MM-DD",
  "hero_text": "3-5 sentences max, under 80 words",
  "readiness_tag": "Green|Yellow|Red",
  "readiness_line": "One sentence that translates readiness into a human feeling",
  "todays_focus": "Short phrase, max 60 chars — the single priority for today",
  "momentum_line": "Max 60 chars, only if 3-day trend is meaningfully up or down. Empty string if flat or insufficient data",
  "cta_primary": "Short action label, max 20 chars",
  "cta_secondary": "Short action label, max 20 chars"
}

RULES:
- hero_text must NOT list metrics like a dashboard. Weave 1-2 numbers naturally into human language.
- If planned training exists, reference it by name in hero_text or todays_focus.
- If user has a goal, let it color the todays_focus but don't repeat it verbatim.
- momentum_line must be empty string if there is no clear 3-day trend or fewer than 2 data points.
- cta_primary should be the most impactful next action. cta_secondary is a softer alternative.
- Be specific when you can (sleep hours, recovery zone, planned training title).
- Give one clear actionable direction, not five.`;

export interface FitLookGenerationInput {
  dateLocal: string;
  recoveryPercent?: number;
  sleepHours?: number;
  hrv?: number;
  strainScore?: number;
  yesterdayFitScore?: number;
  yesterdayBreakdown?: {
    recovery?: number;
    training?: number;
    nutrition?: number;
  };
  fitScoreTrend3d?: number[];
  plannedTraining?: string;
  userGoalTitle?: string;
  injuryNotes?: string;
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
   * Tactical, performance-driven summary with specific metrics
   */
  async generateDailySummary(params: {
    fitScore: number;
    recoveryZone: 'green' | 'yellow' | 'red';
    trainingZone: 'green' | 'yellow' | 'red';
    nutritionZone: 'green' | 'yellow' | 'red';
    fitScoreZone: 'green' | 'yellow' | 'red';
    hadTraining: boolean;
    hadMeals: boolean;
    mealsCount?: number;
    sessionsCount?: number;
    recoveryScore?: number;
    sleepHours?: number;
    sleepScore?: number;
    hrv?: number;
    hrvBaseline?: number;
    strainScore?: number;
    userGoal?: string;
    recoveryBreakdownScore?: number;
    trainingBreakdownScore?: number;
    nutritionBreakdownScore?: number;
  }): Promise<DailySummaryResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Generating daily FitCoach summary`);

      // Build tactical context with real metrics
      const contextParts = [];

      contextParts.push(`FitScore: ${params.fitScore}/10 (zone: ${params.fitScoreZone})`);

      // Breakdown scores (these are the /10 scores shown on the triangle)
      if (params.recoveryBreakdownScore != null) contextParts.push(`Recovery breakdown score: ${params.recoveryBreakdownScore}/10`);
      if (params.trainingBreakdownScore != null) contextParts.push(`Training breakdown score: ${params.trainingBreakdownScore}/10`);
      if (params.nutritionBreakdownScore != null) contextParts.push(`Nutrition breakdown score: ${params.nutritionBreakdownScore}/10`);

      // Recovery metrics
      if (params.recoveryScore != null) contextParts.push(`Recovery: ${params.recoveryScore}%`);
      contextParts.push(`Recovery zone: ${params.recoveryZone}`);

      // Sleep metrics
      if (params.sleepHours != null) contextParts.push(`Sleep: ${params.sleepHours} hours`);
      if (params.sleepScore != null) contextParts.push(`Sleep quality: ${params.sleepScore}%`);

      // HRV
      if (params.hrv != null) {
        contextParts.push(`HRV: ${params.hrv}ms`);
        if (params.hrvBaseline != null) {
          const trend = params.hrv >= params.hrvBaseline * 1.1 ? 'above baseline' :
                        params.hrv <= params.hrvBaseline * 0.9 ? 'below baseline' : 'near baseline';
          contextParts.push(`HRV baseline: ${params.hrvBaseline}ms (${trend})`);
        }
      }

      // Training
      if (params.hadTraining) {
        contextParts.push(`Training: ${params.sessionsCount || 1} session(s), zone: ${params.trainingZone}`);
        if (params.strainScore != null) contextParts.push(`Strain: ${params.strainScore}`);
      } else {
        contextParts.push('Training: Rest day (no sessions logged)');
      }

      // Nutrition
      if (params.hadMeals) {
        contextParts.push(`Nutrition: ${params.mealsCount || 0} meal(s) logged, zone: ${params.nutritionZone}`);
      } else {
        contextParts.push('Nutrition: No meals logged');
      }

      if (params.userGoal) {
        contextParts.push(`User goal: ${params.userGoal}`);
      }

      const userPrompt = `Generate the FitCoach daily summary with preview and 5 slides. FitScore is ${params.fitScore}/10.

Metrics:
${contextParts.join('\n')}

IMPORTANT: For "The Day" slide chips, use the EXACT breakdown scores provided: Recovery: ${params.recoveryBreakdownScore ?? params.fitScore}, Training: ${params.trainingBreakdownScore ?? params.fitScore}, Nutrition: ${params.nutritionBreakdownScore ?? params.fitScore}, FitScore: ${params.fitScore}. Do NOT set context_strip on The Day slide.

Preview MUST start with "FitScore ${params.fitScore} — ".
Return JSON with "preview" and "slides" (5 slides: The Day, Recovery, Training, Nutrition, Direction).`;

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
          max_completion_tokens: 1200,
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

      const parsed = JSON.parse(content);

      // Validate preview
      if (!parsed.preview || parsed.preview.length < 20) {
        throw new Error('Invalid preview from AI');
      }

      // Validate slides
      if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length < 5) {
        throw new Error('Invalid slides from AI');
      }

      // Build result with legacy compatibility
      const result: DailySummaryResult = {
        preview: parsed.preview,
        slides: parsed.slides,
        fitCoachTake: parsed.preview,
        tomorrowsOutlook: parsed.slides[4]?.content || '',
      };

      console.log(`[OpenAI Service] Daily summary generated: ${result.slides.length} slides`);
      return result;

    } catch (error) {
      console.error('[OpenAI Service] Failed to generate daily summary:', error);

      // Return fallback response based on overall zone
      const score = params.fitScore;
      const defaultSlides: CoachSlide[] = [
        { title: 'The Day', context_strip: 'Generating detailed analysis...', chips: [`FitScore ${score}`, `${params.recoveryZone} zone`], content: `A ${score}/10 reflects where your inputs landed today. The score is a mirror, not a judgment.`, coach_call: 'Review each pillar below for specifics.' },
        { title: 'Recovery', chips: [params.sleepHours ? `Sleep ${params.sleepHours}h` : 'Sleep N/A', params.recoveryScore ? `Recovery ${params.recoveryScore}%` : 'Recovery N/A'], content: 'Recovery data shaped today\'s baseline. The quality of rest directly determines tomorrow\'s ceiling.', coach_call: 'Prioritize sleep consistency tonight.' },
        { title: 'Training', chips: [params.hadTraining ? `${params.sessionsCount || 1} session` : 'Rest day', params.trainingZone + ' zone'], content: 'Training alignment depends on matching intensity to readiness. That calibration separates productive strain from wasted effort.', coach_call: 'Match tomorrow\'s intensity to recovery.' },
        { title: 'Nutrition', chips: [params.hadMeals ? `${params.mealsCount || 0} meals` : 'No meals', params.nutritionZone + ' zone'], content: 'Fuel quality determines recovery speed. Consistency in meal timing and composition compounds over days, not hours.', coach_call: 'Log every meal for better accuracy.' },
        { title: 'Direction', chips: ['Focus forward', 'Build momentum'], content: 'Focus on the pillar that lagged most today. One targeted improvement shifts the entire equation.', coach_call: 'Pick one weak pillar and fix it tomorrow.' },
      ];

      const fallbacks: Record<string, DailySummaryResult> = {
        green: {
          preview: `FitScore ${score} — systems aligned. Recovery, training, and nutrition are tracking well. The edge here is consistency — maintain this calibration and the compound effect will show.`,
          slides: defaultSlides,
          fitCoachTake: `FitScore ${score} — systems aligned.`,
          tomorrowsOutlook: 'Readiness: high. Push capacity if recovery holds.',
        },
        yellow: {
          preview: `FitScore ${score} — functional but uneven. Some pillars are carrying weight while others lag. The gap between this score and a stronger one sits in one or two overlooked inputs.`,
          slides: defaultSlides,
          fitCoachTake: `FitScore ${score} — functional but uneven.`,
          tomorrowsOutlook: 'Readiness: moderate. Prioritize the weakest pillar.',
        },
        red: {
          preview: `FitScore ${score} — signals are flagging. Recovery is compromised and the data suggests accumulated load without adequate restoration. Continuing at this pace widens the deficit.`,
          slides: defaultSlides,
          fitCoachTake: `FitScore ${score} — signals are flagging.`,
          tomorrowsOutlook: 'Readiness: low. Reduce intensity, extend sleep window.',
        }
      };

      return fallbacks[params.fitScoreZone] || fallbacks.yellow;
    }
  }

  /**
   * Generate FitLook morning outlook
   */
  async generateFitLook(input: FitLookGenerationInput): Promise<import('@shared/schema').FitLookPayload> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Generating FitLook for ${input.dateLocal}`);

      // Build context
      const parts: string[] = [];
      parts.push(`Date: ${input.dateLocal}`);

      if (input.recoveryPercent != null) {
        const tag = input.recoveryPercent >= 67 ? 'Green' : input.recoveryPercent >= 34 ? 'Yellow' : 'Red';
        parts.push(`Today's WHOOP recovery: ${input.recoveryPercent}% (${tag})`);
      } else {
        parts.push("Today's recovery data: not available yet");
      }
      if (input.sleepHours != null) parts.push(`Sleep last night: ${input.sleepHours}h`);
      if (input.hrv != null) parts.push(`HRV: ${input.hrv}ms`);
      if (input.strainScore != null) parts.push(`Current strain: ${input.strainScore}`);

      if (input.yesterdayFitScore != null) {
        parts.push(`Yesterday's FitScore: ${input.yesterdayFitScore}/10`);
        if (input.yesterdayBreakdown) {
          const b = input.yesterdayBreakdown;
          parts.push(`Yesterday breakdown — Recovery: ${b.recovery ?? '?'}/10, Training: ${b.training ?? '?'}/10, Nutrition: ${b.nutrition ?? '?'}/10`);
        }
      }

      if (input.fitScoreTrend3d && input.fitScoreTrend3d.length >= 2) {
        parts.push(`FitScore trend (last 3 days, newest first): ${input.fitScoreTrend3d.join(', ')}`);
      }

      if (input.plannedTraining) {
        parts.push(`Today's planned training: ${input.plannedTraining}`);
      } else {
        parts.push('No planned training session detected for today');
      }

      if (input.userGoalTitle) parts.push(`User goal: ${input.userGoalTitle}`);
      if (input.injuryNotes) parts.push(`Injury/caution notes: ${input.injuryNotes}`);

      const userPrompt = `Generate this morning's FitLook outlook.\n\nContext:\n${parts.join('\n')}\n\nReturn JSON only with the required fields: date_local, hero_text, readiness_tag, readiness_line, todays_focus, momentum_line, cta_primary, cta_secondary.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.textModel,
          messages: [
            { role: 'system', content: FITLOOK_MORNING_OUTLOOK_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          max_completion_tokens: 500,
          temperature: 0.8,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      const parsed = JSON.parse(content);

      // Validate required fields
      if (!parsed.hero_text || parsed.hero_text.length < 20) {
        throw new Error('Invalid hero_text in FitLook response');
      }
      if (!['Green', 'Yellow', 'Red'].includes(parsed.readiness_tag)) {
        // Infer from recovery if the tag is wrong
        if (input.recoveryPercent != null) {
          parsed.readiness_tag = input.recoveryPercent >= 67 ? 'Green' : input.recoveryPercent >= 34 ? 'Yellow' : 'Red';
        } else {
          parsed.readiness_tag = 'Yellow';
        }
      }

      // Enforce date
      parsed.date_local = input.dateLocal;

      // Ensure all fields exist
      parsed.readiness_line = parsed.readiness_line || 'Your body has something to say — check in with it.';
      parsed.todays_focus = parsed.todays_focus || 'Stay present and move with intent';
      parsed.momentum_line = parsed.momentum_line || '';
      parsed.cta_primary = parsed.cta_primary || 'Log breakfast';
      parsed.cta_secondary = parsed.cta_secondary || 'Review plan';

      console.log(`[OpenAI Service] FitLook generated: readiness=${parsed.readiness_tag}`);
      return parsed;

    } catch (error) {
      console.error('[OpenAI Service] FitLook generation failed:', error);

      // Return sensible fallback
      const tag = input.recoveryPercent != null
        ? (input.recoveryPercent >= 67 ? 'Green' : input.recoveryPercent >= 34 ? 'Yellow' : 'Red')
        : 'Yellow';

      return {
        date_local: input.dateLocal,
        hero_text: tag === 'Green'
          ? 'Recovery looks solid today. Yesterday set the stage, and your body responded. Use this readiness — it won\'t always be here. Show up with intent and let the work speak.'
          : tag === 'Red'
          ? 'Recovery is lower than ideal. That\'s data, not a verdict. Today is about being smart — protect the gains you\'ve made and give your system what it needs to bounce back.'
          : 'A steady day ahead. Recovery is in the middle ground — enough to work with, not enough to ignore. Be deliberate about where you spend energy today.',
        readiness_tag: tag,
        readiness_line: tag === 'Green' ? 'Your body showed up ready — now match it.' : tag === 'Red' ? 'Low recovery — be smart about today.' : 'Moderate readiness — pace yourself.',
        todays_focus: 'Move with purpose',
        momentum_line: '',
        cta_primary: 'Log breakfast',
        cta_secondary: 'Review plan',
      };
    }
  }
}

export const openAIService = new OpenAIService();
