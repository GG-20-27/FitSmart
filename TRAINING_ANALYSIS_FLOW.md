# Training Analysis Data Flow

## Overview
When a training session is saved, the system:
1. Fetches live WHOOP data including strain metrics
2. Calculates a training score using the strain data
3. Generates AI analysis that references the strain values
4. Stores everything in the database
5. Returns the complete analysis when fetching training data

## 1. Save Training Endpoint (`POST /api/training`)

### Location: `server/routes.ts` lines 3720-3820

### Data Flow:

#### Step 1: Fetch WHOOP Data (line 3721)
```typescript
const whoopData = await whoopApiService.getDataForDate(userId, trainingDate);
```
Returns:
- `recoveryScore` (0-100)
- `strainScore` (0-21) ← **This is the key metric**
- `sleepScore` (0-100)
- `hrv` (milliseconds)

#### Step 2: Calculate Training Score (line 3744-3754)
```typescript
const scoreResult = trainingScoreService.calculateTrainingScore({
  type,
  duration: parseInt(duration),
  intensity: intensity || undefined,
  goal: goal || undefined,
  comment: comment || undefined,
  skipped: skipped || false,
  recoveryScore: whoopData?.recoveryScore || undefined,
  strainScore: whoopData?.strainScore || undefined, // ← Strain is used here
  fitnessGoal: fitnessGoal || undefined,
});
```

The `trainingScoreService.calculateTrainingScore()` uses strain to calculate:
- **Strain Appropriateness Score** (40% of total) - Directly uses `strainScore` to determine if the strain level was appropriate for the recovery state
- Session Quality Score (30%)
- Goal Alignment Score (20%)
- Injury Safety Modifier (10%)

**Key Algorithm** (`server/services/trainingScoreService.ts` lines 135-180):
- Compares actual strain against optimal ranges for the recovery zone
- Green zone (70-100% recovery): Optimal strain 8-18, ideal 13
- Yellow zone (40-69% recovery): Optimal strain 5-12, ideal 8.5
- Red zone (0-39% recovery): Optimal strain 0-8, ideal 4

#### Step 3: Generate GPT Analysis (line 3764-3777)
```typescript
const gptAnalysis = await openAIService.analyzeTrainingSession({
  trainingType: type,
  duration: parseInt(duration),
  intensity: intensity || undefined,
  goal: goal || undefined,
  comment: comment || undefined,
  score: scoreResult.score,
  breakdown: scoreResult.breakdown,
  recoveryScore: whoopData?.recoveryScore || undefined,
  strainScore: whoopData?.strainScore || undefined, // ← Strain is passed to GPT
  sleepScore: whoopData?.sleepScore || undefined,
  recoveryZone: scoreResult.recoveryZone,
  userGoal: fitnessGoal || undefined,
});
```

The GPT receives a prompt like:
```
Training: Run for 45 minutes at Low intensity

Overall Training Score: 7.2/10 (YELLOW ZONE)

Score Breakdown:
- Strain Appropriateness: 2.4/4.0 (40%)
- Session Quality: 2.6/3.0 (30%)
- Goal Alignment: 1.2/2.0 (20%)
- Injury Safety: 1.0/1.0 (10%)

WHOOP Metrics:
- Recovery: 65%
- Strain: 10.1  ← GPT sees this value
- Sleep: 78%

User's Fitness Goal: Improve endurance
```

The GPT is instructed to:
- "ALWAYS reference specific metrics when available (strain, recovery %, sleep scores)"
- "When strain data is provided, MUST mention the actual strain value in your analysis"
- "Relate the strain value to the strain appropriateness score"

#### Step 4: Store Analysis (line 3782-3807)
```typescript
const analysisData = {
  score: scoreResult.score,
  breakdown: scoreResult.breakdown,  // Contains all 4 components
  analysis: gptAnalysis.training_analysis,
  recoveryZone: scoreResult.recoveryZone,
  whoopData: {
    recoveryScore: whoopData?.recoveryScore,
    strainScore: whoopData?.strainScore,  // ← Strain stored for reference
    sleepScore: whoopData?.sleepScore,
  },
};

await storage.updateTrainingData(trainingEntry.id, {
  analysisResult: JSON.stringify(analysisData),  // Stored as JSON text
  trainingScore: scoreResult.score,
});
```

## 2. Fetch Training Endpoint (`GET /api/training/date/:date`)

### Location: `server/routes.ts` lines 3847-3882

### Data Flow:

```typescript
const trainingSessions = trainingData.map(training => {
  let score: number | undefined;
  let analysis: string | undefined;
  let breakdown: any | undefined;
  let recoveryZone: 'green' | 'yellow' | 'red' | undefined;

  if (training.analysisResult) {
    const parsed = JSON.parse(training.analysisResult);
    score = parsed.score;
    analysis = parsed.analysis;
    breakdown = parsed.breakdown;  // ← Breakdown is extracted
    recoveryZone = parsed.recoveryZone;
  }

  return {
    ...training,
    score,
    analysis,
    breakdown,  // ← Returned to mobile app
    recoveryZone,
  };
});
```

## 3. Mobile App Display

### Location: `mobile/src/screens/FitScoreScreen.tsx`

The breakdown is displayed in the training analysis modal (lines 1004-1031):
```typescript
{selectedTraining.breakdown && (
  <View style={styles.trainingMetricsTable}>
    <Text style={styles.trainingMetricsTitle}>Score Breakdown</Text>
    <View style={styles.trainingMetricRow}>
      <Text>Strain Appropriateness</Text>
      <Text>{selectedTraining.breakdown.strainAppropriatenessScore.toFixed(1)}/4.0</Text>
    </View>
    // ... other metrics
  </View>
)}
```

## Debugging

### Server Logs to Check:

1. **When saving training:**
   ```
   [TRAINING] WHOOP data retrieved for 2026-01-18:
   [TRAINING] - Strain: 10.1
   [TRAINING] Score calculated: 7.2/10
   [TRAINING] - Strain Appropriateness: 2.4/4.0 (using strain=10.1)
   [TRAINING] GPT analysis complete
   [TRAINING] Storing analysis data: {...}
   ```

2. **When fetching training:**
   ```
   [TRAINING FETCH] Parsed training 123: {
     hasBreakdown: true,
     breakdown: { strainAppropriatenessScore: 2.4, ... }
   }
   ```

### Mobile Logs to Check:

1. **When loading training data:**
   ```
   [TRAINING DATA] First session breakdown: { strainAppropriatenessScore: 2.4, ... }
   ```

2. **When opening analysis modal:**
   ```
   [TRAINING MODAL] Opening modal for training: {
     hasBreakdown: true,
     breakdown: { strainAppropriatenessScore: 2.4, ... }
   }
   ```

## Expected Behavior

1. **When strain data is available:**
   - Strain Appropriateness score reflects how well the actual strain matched the recovery state
   - GPT analysis mentions the specific strain value (e.g., "today's strain of 10.1")
   - All 4 breakdown metrics show in the modal

2. **When strain data is NOT available:**
   - Strain Appropriateness defaults to 2.4/4.0 (60%)
   - GPT analysis works with available data
   - All 4 breakdown metrics still show (with default values)

## Testing Checklist

- [ ] Create a new training session
- [ ] Check server logs for "using strain=X.X"
- [ ] Verify GPT analysis mentions the strain value
- [ ] Check mobile logs for breakdown data
- [ ] Open training modal and verify all 4 metrics display
- [ ] Verify strain appropriateness score matches the logged value
