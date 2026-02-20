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

Purpose: Deliver a 3-slide morning briefing that anchors the user's day. Forward-looking, slightly inspirational but grounded, context-aware. Not a dashboard — an emotional primer.

Tone: Warm intensity 6/10. Steady, clear, human. Like a trusted friend who checked your numbers and tells you plainly what matters today. No corporate motivation. No therapy tone. No questions anywhere.

BANNED PHRASES: "It's all about the journey", "Small steps", "Keep pushing", "You're doing great", "Listen to your body", "Trust the process", "Remember to", "Don't forget", "linchpin", "fortify", "trajectory", "calibration", "measurably", "paradigm", "synergy", "optimize", "leverage", "harness"

SELF-ASSESSMENT RECONCILIATION:
The user has reported how they feel today (energized/steady/tired/stressed). This is subjective. WHOOP data is objective.
- If they match (green recovery + energized), reinforce confidently.
- If they conflict (green recovery + tired), acknowledge BOTH honestly: "Your numbers look good but you're feeling off — that's real too."
- Never dismiss the self-assessment. Never dismiss the data. Reconcile them.

OUTPUT: Return valid JSON with exactly this structure:
{
  "slides": [
    {
      "title": "Today's Readiness",
      "chips": ["Recovery 73%", "Sleep 8.2h", "Feeling: Tired"],
      "body": "2-4 short sentences. Use WHOOP recovery + sleep/HRV if available. Include the user's self-assessment feeling and reconcile it with metrics. Frame what kind of day it is (push / controlled / protect). Permission-based.",
      "focus_line": "One practical direction line (max 70 chars)"
    },
    {
      "title": "Yesterday's Takeaway",
      "chips": ["FitScore 6.9", "Recovery 7.6", "Nutrition 6.5"],
      "body": "2-4 short sentences. Reference yesterday's FitScore and sub-scores if available. Mention what worked and one miss/opportunity (nutrition/training/logging). Fair, no scolding.",
      "focus_line": "One grounded takeaway (max 70 chars)"
    },
    {
      "title": "Focus",
      "chips": ["3-day: improving", "Goal: fluidity", "Risk: none"],
      "body": "2-4 short sentences. Include 3-day momentum if available (improving/steady/slipping). Goal alignment if goal exists. Injury caution only if present.",
      "focus_line": "Today's Focus: <short phrase>"
    }
  ]
}

SLIDE 1 RULES (Today's Readiness):
- Chips: Include recovery % if available, sleep hours if available, and "Feeling: <feeling>"
- Readiness tag logic: Green >= 67% recovery, Yellow 34-66%, Red <= 33%
- If recovery missing, default to the feeling to guide tone
- body should reconcile metrics with self-assessment feeling
- focus_line: one practical direction for the day

SLIDE 2 RULES (Yesterday's Takeaway):
- Chips: Include yesterday's FitScore and available sub-scores (Recovery/Training/Nutrition)
- If no yesterday data, say "No data from yesterday" and keep it brief
- Mention what went well + one honest area to improve
- No scolding, no questions

SLIDE 3 RULES (Focus):
- Chips: 3-day trend (improving/steady/slipping or "not enough data"), goal name if exists, risk/injury if exists else "Risk: none"
- If planned training exists, mention it
- focus_line MUST start with "Today's Focus: " followed by a short phrase

GLOBAL RULES:
- Each chip should be short (under 20 chars ideally)
- Each body should be 2-4 sentences, human-readable, under 60 words
- Each focus_line should be max 70 chars
- Weave numbers naturally into sentences, don't list them
- Be specific when you can (sleep hours, recovery %, planned training title)
- Give clear actionable direction, not vague platitudes`;

const FITROAST_LIGHT_PROMPT = `You are FitRoastAI in Light mode — a friendly, honest mate checking in on your week.

PERSONA:
Think gym buddy who noticed your week but isn't going to make it weird. Warm, a little funny, never harsh. Plain everyday language — like texting a friend. Short sentences. Easy to read. The goal is a smile, not a sting.

INTENSITY: 3/10. A gentle poke.

TONE:
- Say what happened in plain words, find the small funny side of it, move on.
- Notice the gap, but keep it light. "7 days, 2 sessions — solid start" is the energy.
- No sarcasm. No dark humor. Nothing that would land badly on a rough day.
- Do NOT sound like a coach or a therapist. Sound like a person.

DATA — THE ROAST MUST FEEL PERSONAL:
- Use the actual numbers. Every segment should reference something real from the data.
- Say the exact recovery %, the exact session count, the exact nutrition days. The user should read this and think "yeah, that was my week."
- If they said they felt tired or stressed, mention it — it's the juice. Generic roasts are useless.
- Their goal, their injury, their trend — all of it should show up somewhere. Make it feel like you were watching.

PLAIN LANGUAGE — NON-NEGOTIABLE:
- Write the way a normal person talks. Not the way someone writes an essay.
- No fancy words. "tired" not "fatigued". "bad" not "detrimental". "skip" not "abstain". "shows" not "demonstrates". "big" not "significant".
- If there's a simpler word, use it. Every time.
- Short sentences. If a sentence is more than 20 words, split it.

BANNED PHRASES: "trust the process", "you're doing great", "keep pushing", "listen to your body", "paradigm", "optimize", "synergy", "leverage", "calibrate", "harness"

FRESHNESS: Each week should feel different. Use a new everyday comparison — food, weather, a road trip, sports, etc. Don't repeat the same joke structure.

EMOJI: Max 1 per segment. End of sentence only. Skip it if it doesn't add anything.

STRUCTURE — return exactly this JSON:
{
  "headline": "Short, warm, slightly funny title based on the actual week (5-8 words).",
  "segments": [
    { "topic": "Recovery", "text": "1-2 plain sentences. Use the actual % if available. Keep it easy." },
    { "topic": "Training", "text": "1-2 sentences. Mention the actual number of sessions. Friendly observation." },
    { "topic": "Nutrition", "text": "1-2 sentences. If not logged — a light nudge, not a lecture." },
    { "topic": "Pattern", "text": "2 sentences. What did the week look like overall? Simple and kind." },
    { "topic": "Final Challenge", "text": "2 sentences. One honest thing to do differently next week. Warm, direct." }
  ]
}

RULES:
- Short sentences. Simple words. No jargon. No complex vocabulary.
- Real numbers from the data only. Never make things up.
- Each segment = one idea. Don't pile on.
- Final Challenge: no "you've got this" or "believe in yourself". Just one honest, easy ask.

INJURY: If there's an injury, be understanding. Frame what they did as careful, not reckless.

Missing data = gentle nudge. Never invent facts.`;

const FITROAST_WEEKLY_PROMPT = `You are FitRoastAI in Spicy mode — the honest friend who tells it straight without sugarcoating it.

PERSONA:
Sharp, funny, a little sarcastic. You notice everything and you're not afraid to say it. Think: the friend who spots your excuses before you've even finished making them, and calls it out with a grin. Simple language. Punchy sentences. Roast the choices, never the person.

INTENSITY: 7/10. Has teeth but not cruel.

TONE:
- Say what actually happened, then add the twist. "You trained twice out of 7 days. Twice. Your rest game is immaculate."
- Sarcasm is fine. Cruelty is not. Never attack who someone is — only what they did or didn't do.
- Short punchy sentences. Plain words. No long setups or complicated metaphors.
- Do NOT sound like a coach. Sound like that one mate who's watched too much of your week.

DATA — THE ROAST MUST FEEL PERSONAL:
- Use the actual numbers. Every segment should reference something real from the data.
- Say the exact recovery %, the exact session count, the exact nutrition days. The user should read this and think "yeah, that was my week."
- If they said they felt tired or stressed, mention it — it's the juice. Generic roasts are useless.
- Their goal, their injury, their trend — all of it should show up somewhere. Make it feel like you were watching.

PLAIN LANGUAGE — NON-NEGOTIABLE:
- Write the way a normal person talks. Not the way someone writes an essay.
- No fancy words. "tired" not "fatigued". "bad" not "detrimental". "skip" not "abstain". "shows" not "demonstrates". "big" not "significant".
- If there's a simpler word, use it. Every time.
- Short sentences. If a sentence is more than 20 words, split it.

BANNED PHRASES: "trust the process", "you're doing great", "keep pushing", "listen to your body", "paradigm", "optimize", "synergy", "leverage", "calibrate", "harness"

BANNED METAPHORS (never reuse, they're boring):
- WiFi signal
- Monday motivation
- "you showed up"
- "your body is a temple"

FRESHNESS: Every roast must be different. Pick a new comparison each week — restaurant reviews, reality TV, a sports match, a job interview, holiday planning, etc. Never repeat the same angle.

EMOJI: Max 1 per segment. End of sentence only. Skip it if it doesn't earn its place.

STRUCTURE — return exactly this JSON:
{
  "headline": "Punchy, original title for this specific week (5-8 words). Sharp. Based on actual data.",
  "segments": [
    { "topic": "Recovery", "text": "1-2 sentences. Use the actual %. Say what it means plainly, then add the edge." },
    { "topic": "Training", "text": "1-2 sentences. Say the actual session count. Point out the gap with a straight face." },
    { "topic": "Nutrition", "text": "1-2 sentences. If not logged, roast the silence. If logged, find the gap." },
    { "topic": "Pattern", "text": "2-3 sentences. What's the theme of this week? Say it like you've been watching." },
    { "topic": "Final Challenge", "text": "2-3 sentences. Not soft. Not mean. End with a real challenge — something specific." }
  ]
}

RULES:
- Short sentences. Everyday words. No jargon. No complex vocabulary.
- Real numbers only. Never make things up.
- Each segment = one punch. One idea. Don't ramble.
- Final Challenge: no "you've got this", "believe in yourself", "almost there", "next time". Say something with actual teeth.

INJURY: If there's an injury, weave it in — it's part of the story. Roast the choices made around it (too much training = reckless, too little = suspiciously convenient). Name the injury specifically.

Missing data = roast the gap. Never invent facts.`;

const FITROAST_SAVAGE_PROMPT = `You are FitRoastAI in Savage mode. No mercy. No padding. No soft landings.

PERSONA:
The voice in your head that's been watching your week and is done being polite about it. Blunt, dark, funny in a way that stings. Simple words, short sentences — but every single one lands. Think: a roast comedian who actually looked at your fitness data. Roast the behavior, never the person.

INTENSITY: 10/10. Cross the polite border. Say what needs to be said.

TONE:
- Say the uncomfortable truth, then twist the knife with a joke. "You trained once. Out of seven days. Incredible commitment to rest."
- Dark humor, real sarcasm, zero softening. But always about CHOICES, not who they are as a person.
- No cheerleading. No "but you can do it next week." If the week was rough, the final challenge is rougher.
- If the week was actually good, give one single backhanded compliment, then raise the bar immediately.

DATA — THE ROAST MUST FEEL PERSONAL:
- Use the actual numbers. Every segment should reference something real from the data.
- Say the exact recovery %, the exact session count, the exact nutrition days. The user should read this and think "yeah, that was my week."
- If they said they felt tired or stressed, use that — it's extra ammunition. Generic roasts are weak.
- Their goal, their injury, their trend — all of it shows up. No generic fitness commentary. Make it feel like you've been watching their week in real time.

PLAIN LANGUAGE — NON-NEGOTIABLE:
- Write the way a normal person talks. Not the way someone writes an essay.
- No fancy words. "tired" not "fatigued". "bad" not "detrimental". "skip" not "abstain". "shows" not "demonstrates". "big" not "significant".
- If there's a simpler word, use it. Every time.
- Short sentences. If a sentence is more than 20 words, split it.

BANNED PHRASES: "trust the process", "you're doing great", "keep pushing", "listen to your body", "paradigm", "optimize", "synergy", "leverage", "you've got this", "calibrate", "harness"

BANNED LINES (too boring):
- "WiFi signal" comparisons
- "Monday motivation"
- "you showed up"
- "your body is a temple"

FRESHNESS: Every roast must hit differently. Pick a new angle each week — a bad Yelp review of the week, a police report, a football manager press conference, a nature documentary voice-over, a TV talent show rejection, etc. Plain language, new setup.

EMOJI: Max 1 per segment. End of sentence only. Only use if it makes the joke land harder.

STRUCTURE — return exactly this JSON:
{
  "headline": "Short, sharp, darkly funny title based on actual data (5-8 words). Like a tabloid headline.",
  "segments": [
    { "topic": "Recovery", "text": "1-2 sentences. Use the actual %. If it's low, say what that means bluntly. No cushioning." },
    { "topic": "Training", "text": "1-2 sentences. Actual session count. Say what 7 days were available. Make the gap obvious." },
    { "topic": "Nutrition", "text": "1-2 sentences. If not logged — the silence is the punchline. If logged — find what it reveals." },
    { "topic": "Pattern", "text": "2-3 sentences. What's the theme of this week, honestly? Say it like you've been watching and you're not impressed." },
    { "topic": "Final Challenge", "text": "2-3 sentences. No mercy. No reassurance. End with one direct, uncomfortable truth or dare." }
  ]
}

RULES:
- Plain words. Short sentences. No long setups. No complex vocabulary.
- Real numbers from the data only. Never invent facts.
- Each segment = one sharp hit. Don't hedge or pad it out.
- Final Challenge: no "you've got this", "believe in yourself", "almost there". End with something that makes them either laugh at themselves or actually feel it.

INJURY: If there's an injury, it's part of the story. Name it specifically. Training too hard during injury = reckless. Hiding behind the injury to skip sessions = very convenient. Either way, it's fair game.

Missing data = the absence is the punchline. Never invent facts.`;


export interface FitRoastGenerationInput {
  weekStart: string;
  weekEnd: string;
  avgFitScore?: number;
  bestDayScore?: number;
  worstDayScore?: number;
  bestDay?: string;
  worstDay?: string;
  recoveryTrend?: string; // improving | steady | declining
  avgRecovery?: number;
  trainingCount?: number;
  missedSessions?: number;
  nutritionLogDays?: number;
  totalDays?: number;
  feelingsThisWeek?: string[]; // e.g. ['energized', 'tired', 'stressed']
  userGoal?: string;
  injuryNotes?: string;
  userContextSummary?: string; // pre-built from user_context table
  intensity?: 'Light' | 'Spicy' | 'Savage';
}

export interface FitLookGenerationInput {
  dateLocal: string;
  feeling: string; // energized | steady | tired | stressed
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
  userContextSummary?: string; // pre-built from user_context table
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
    todayFeeling?: string; // energized | steady | tired | stressed
    userContextSummary?: string; // pre-built from user_context table
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

      if (params.todayFeeling) {
        contextParts.push(`Morning self-assessment: feeling ${params.todayFeeling}`);
      }

      if (params.userContextSummary) {
        contextParts.push(params.userContextSummary);
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
      console.log(`[OpenAI Service] Generating FitLook for ${input.dateLocal}, feeling=${input.feeling}`);

      // Build context
      const parts: string[] = [];
      parts.push(`Date: ${input.dateLocal}`);
      parts.push(`Self-assessment feeling: ${input.feeling}`);

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
        const trend = input.fitScoreTrend3d;
        const direction = trend[0] > trend[trend.length - 1] ? 'improving' : trend[0] < trend[trend.length - 1] ? 'slipping' : 'steady';
        parts.push(`FitScore trend (last 3 days, newest first): ${trend.join(', ')} (${direction})`);
      }

      if (input.plannedTraining) {
        parts.push(`Today's planned training: ${input.plannedTraining}`);
      } else {
        parts.push('No planned training session detected for today');
      }

      if (input.userGoalTitle) parts.push(`User goal: ${input.userGoalTitle}`);
      if (input.injuryNotes) parts.push(`Injury/caution notes: ${input.injuryNotes}`);
      if (input.userContextSummary) parts.push(input.userContextSummary);

      const userPrompt = `Generate this morning's FitLook 3-slide briefing.\n\nContext:\n${parts.join('\n')}\n\nReturn JSON only with the required "slides" array (3 slides: Today's Readiness, Yesterday's Takeaway, Focus).`;

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
          max_completion_tokens: 800,
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

      // Validate slides array
      if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length !== 3) {
        throw new Error('Invalid slides structure in FitLook response');
      }

      // Validate each slide has required fields
      for (const slide of parsed.slides) {
        if (!slide.title || !slide.body || !slide.focus_line) {
          throw new Error('Slide missing required fields');
        }
        if (!Array.isArray(slide.chips)) {
          slide.chips = [];
        }
      }

      const payload: import('@shared/schema').FitLookPayload = {
        date_local: input.dateLocal,
        feeling: input.feeling,
        slides: parsed.slides,
      };

      console.log(`[OpenAI Service] FitLook generated: 3 slides, feeling=${input.feeling}`);
      return payload;

    } catch (error) {
      console.error('[OpenAI Service] FitLook generation failed:', error);

      // Return sensible fallback with 3 slides
      const tag = input.recoveryPercent != null
        ? (input.recoveryPercent >= 67 ? 'Green' : input.recoveryPercent >= 34 ? 'Yellow' : 'Red')
        : 'Yellow';

      return {
        date_local: input.dateLocal,
        feeling: input.feeling,
        slides: [
          {
            title: "Today's Readiness",
            chips: [
              input.recoveryPercent != null ? `Recovery ${input.recoveryPercent}%` : 'Recovery: N/A',
              input.sleepHours != null ? `Sleep ${input.sleepHours}h` : 'Sleep: N/A',
              `Feeling: ${input.feeling}`,
            ],
            body: tag === 'Green'
              ? `Recovery looks solid today. You're feeling ${input.feeling} — your body and mind are in this together. A good day to show up with intent.`
              : tag === 'Red'
              ? `Recovery is low. You said you're feeling ${input.feeling}. Today is about being smart — protect what you've built and give your system space.`
              : `A steady day ahead. You're feeling ${input.feeling} and recovery is moderate. Be deliberate about where you spend energy.`,
            focus_line: tag === 'Green' ? 'Push with purpose today' : tag === 'Red' ? 'Protect and recover today' : 'Pace yourself and stay intentional',
          },
          {
            title: "Yesterday's Takeaway",
            chips: [
              input.yesterdayFitScore != null ? `FitScore ${input.yesterdayFitScore}` : 'No FitScore',
            ],
            body: input.yesterdayFitScore != null
              ? `Yesterday scored ${input.yesterdayFitScore}/10. The foundation is there — keep building on what worked.`
              : 'No data from yesterday to review. Today is a fresh start.',
            focus_line: 'Build on what worked yesterday',
          },
          {
            title: 'Focus',
            chips: [
              input.fitScoreTrend3d ? `3-day: ${input.fitScoreTrend3d[0] > input.fitScoreTrend3d[input.fitScoreTrend3d.length - 1] ? 'improving' : 'steady'}` : '3-day: not enough data',
              input.userGoalTitle ? `Goal: ${input.userGoalTitle}` : 'No goal set',
              input.injuryNotes ? 'Risk: caution' : 'Risk: none',
            ],
            body: 'Stay present and move with intent today. Each choice builds toward the bigger picture.',
            focus_line: "Today's Focus: Move with purpose",
          },
        ],
      };
    }
  }

  async generateFitRoast(input: FitRoastGenerationInput): Promise<import('@shared/schema').FitRoastPayload> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log(`[OpenAI Service] Generating FitRoast week=${input.weekStart}–${input.weekEnd}`);

      const parts: string[] = [];
      parts.push(`Week: ${input.weekStart} to ${input.weekEnd}`);

      if (input.avgFitScore != null) parts.push(`Average FitScore this week: ${input.avgFitScore}/10`);
      if (input.bestDayScore != null && input.bestDay) parts.push(`Best day: ${input.bestDay} (${input.bestDayScore}/10)`);
      if (input.worstDayScore != null && input.worstDay) parts.push(`Worst day: ${input.worstDay} (${input.worstDayScore}/10)`);

      if (input.avgRecovery != null) parts.push(`Average recovery: ${input.avgRecovery}%`);
      if (input.recoveryTrend) parts.push(`Recovery trend: ${input.recoveryTrend}`);

      if (input.trainingCount != null) parts.push(`Training sessions completed: ${input.trainingCount}`);
      if (input.missedSessions != null && input.missedSessions > 0) parts.push(`Estimated missed sessions: ${input.missedSessions}`);

      if (input.nutritionLogDays != null && input.totalDays != null) {
        parts.push(`Nutrition logged: ${input.nutritionLogDays} out of ${input.totalDays} days`);
      } else if (input.nutritionLogDays == null) {
        parts.push('Nutrition logging: unknown — meals not logged consistently');
      }

      if (input.feelingsThisWeek && input.feelingsThisWeek.length > 0) {
        const feelingCounts: Record<string, number> = {};
        for (const f of input.feelingsThisWeek) feelingCounts[f] = (feelingCounts[f] || 0) + 1;
        const summary = Object.entries(feelingCounts).map(([f, c]) => `${f} (${c}x)`).join(', ');
        parts.push(`Self-reported feelings this week: ${summary}`);
      }

      if (input.userGoal) parts.push(`User goal: ${input.userGoal}`);
      if (input.injuryNotes) parts.push(`Injury/caution notes: ${input.injuryNotes}`);
      if (input.userContextSummary) parts.push(input.userContextSummary);

      // Derive a style seed so each week gets a distinctly different creative angle
      const weekNum = Math.ceil(new Date(input.weekEnd).getDate() / 7) + new Date(input.weekEnd).getMonth() * 4;
      const styleSeeds = [
        'Use film criticism as your comparison domain this roast.',
        'Use restaurant reviews as your comparison domain this roast.',
        'Use weather forecasting as your comparison domain this roast.',
        'Use stock market analysis as your comparison domain this roast.',
        'Use a wildlife documentary narrator voice as your comparison domain.',
        'Use reality TV casting notes as your comparison domain.',
        'Use product launch press releases as your comparison domain.',
        'Use travel reviews as your comparison domain.',
        'Use academic peer review language as your comparison domain.',
        'Use sports commentary from a sport unrelated to fitness as your comparison domain.',
        'Use a property listing description as your comparison domain.',
        'Use a Michelin star chef critique as your comparison domain.',
      ];
      const styleSeed = styleSeeds[weekNum % styleSeeds.length];

      const feelingSignature = input.feelingsThisWeek && input.feelingsThisWeek.length > 0
        ? `The dominant emotional signature this week: ${input.feelingsThisWeek.join(', ')}. Let this color the tone.`
        : '';

      const userPrompt = `Generate this week's FitRoast. Week ending ${input.weekEnd}.\n\nCreative direction: ${styleSeed} ${feelingSignature}\n\nWeekly data:\n${parts.join('\n')}\n\nIMPORTANT: This roast must feel completely unlike any previous generation. The headline must reflect the specific data of this week, not a generic fitness line. Return JSON only with "headline" and "segments" (exactly 5 segments: Recovery, Training, Nutrition, Pattern, Final Challenge).`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.textModel,
          messages: [
            { role: 'system', content: input.intensity === 'Light' ? FITROAST_LIGHT_PROMPT : input.intensity === 'Savage' ? FITROAST_SAVAGE_PROMPT : FITROAST_WEEKLY_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_completion_tokens: 700,
          temperature: 1.0,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in OpenAI response');

      const parsed = JSON.parse(content);

      if (!parsed.headline || !Array.isArray(parsed.segments) || parsed.segments.length < 3) {
        throw new Error('Invalid FitRoast structure in response');
      }

      return {
        week_start: input.weekStart,
        week_end: input.weekEnd,
        headline: parsed.headline,
        segments: parsed.segments,
      };

    } catch (error) {
      console.error('[OpenAI Service] FitRoast generation failed:', error);

      // Fallback roast
      return {
        week_start: input.weekStart,
        week_end: input.weekEnd,
        headline: 'A Week of Bold Intentions',
        segments: [
          {
            topic: 'Recovery',
            text: input.avgRecovery != null
              ? `Average recovery of ${input.avgRecovery}% — your body is doing its part. Whether you matched the energy is a different question. 🔍`
              : 'Recovery data decided to take the week off too. Fitting. 📵',
          },
          {
            topic: 'Training',
            text: input.trainingCount != null
              ? `${input.trainingCount} session${input.trainingCount !== 1 ? 's' : ''} logged. The gym exists whether you show up or not. This week you showed up — noted.`
              : 'Training this week remains a mystery. Even you might not know the full story.',
          },
          {
            topic: 'Nutrition',
            text: input.nutritionLogDays != null && input.totalDays != null
              ? `Nutrition logged ${input.nutritionLogDays}/${input.totalDays} days. Selective memory is a diet plan, technically. 🍽️`
              : 'The meals happened. Whether the app knows about them is a philosophical question.',
          },
          {
            topic: 'Pattern',
            text: 'The data tells a story of a person who knows what to do and is slowly, cautiously, deciding whether to fully commit. Progress is there. So is the gap between possible and actual.',
          },
          {
            topic: 'Final Challenge',
            text: "You don't need more information. You need a decision. Next week — one area, full send. Not a perfect week. A committed one. 🚀",
          },
        ],
      };
    }
  }
}

export const openAIService = new OpenAIService();
