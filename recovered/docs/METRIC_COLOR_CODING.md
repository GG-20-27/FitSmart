# Metric Color Coding & Comparison System

## Overview
This document details the color coding and metric comparison system recovered from the FitSmart codebase.

---

## Mobile App Color Coding

### Location
`mobile/screens/DashboardScreen_with_fitscore.tsx`

### Delta Calculation Logic

```typescript
/**
 * Calculate percentage change between today and yesterday
 * @param today - Today's metric value
 * @param yesterday - Yesterday's metric value
 * @returns Percentage change as integer, or undefined if data missing
 */
const calculateDelta = (
  today: number | undefined,
  yesterday: number | undefined
): number | undefined => {
  if (today === undefined || yesterday === undefined || yesterday === 0) {
    return undefined;
  }
  return Math.round(((today - yesterday) / yesterday) * 100);
};
```

**Example:**
- Today's Recovery: 85%
- Yesterday's Recovery: 75%
- Delta: `((85 - 75) / 75) * 100 = +13%`

### Color Coding Rules

```typescript
// For strain, no color coding (neutral). For other metrics, use color coding
const deltaColor = isStrain
  ? colors.textMuted  // Strain is always neutral
  : (delta && delta > 0 ? state.ready : delta && delta < 0 ? state.rest : colors.textMuted);
```

**Color Legend:**
- `state.ready` (Green) - **Improvement** from yesterday (positive delta)
- `state.rest` (Red) - **Decline** from yesterday (negative delta)
- `colors.textMuted` (Gray) - **Neutral** (no change or strain metric)

### Icon Selection

```typescript
const deltaIcon = delta && delta > 0 ? 'arrow-up' : delta && delta < 0 ? 'arrow-down' : 'remove';
```

**Icons:**
- `arrow-up` ↑ - Positive change
- `arrow-down` ↓ - Negative change
- `remove` − - No change or no data

### Display Format

```typescript
<View style={styles.metricDelta}>
  <Ionicons name={deltaIcon as any} size={12} color={deltaColor} />
  <Text style={[styles.metricDeltaText, { color: deltaColor }]}>
    vs. yesterday: {delta > 0 ? '+' : ''}{delta}%
  </Text>
</View>
```

**Example Outputs:**
- `vs. yesterday: +13%` (green, up arrow)
- `vs. yesterday: -8%` (red, down arrow)
- `vs. yesterday: 0%` (gray, dash)

---

## Metric Cards with Comparisons

### Sleep Metric
```typescript
<MetricCard
  icon="moon-outline"
  label="Sleep"
  value={todayMetrics?.sleep_hours ? `${todayMetrics.sleep_hours.toFixed(1)}h` : 'N/A'}
  delta={calculateDelta(todayMetrics?.sleep_score, yesterdayMetrics?.sleep_score)}
/>
```

**Color Interpretation:**
- **Green (+)**: Better sleep quality than yesterday
- **Red (-)**: Worse sleep quality than yesterday

### Recovery Metric
```typescript
<MetricCard
  icon="fitness-outline"
  label="Recovery"
  value={todayMetrics?.recovery_score ? `${todayMetrics.recovery_score}%` : 'N/A'}
  delta={calculateDelta(todayMetrics?.recovery_score, yesterdayMetrics?.recovery_score)}
/>
```

**Color Interpretation:**
- **Green (+)**: Higher recovery score than yesterday
- **Red (-)**: Lower recovery score than yesterday

### Strain Metric (Special Case)
```typescript
<MetricCard
  icon="flame-outline"
  label="Strain"
  value={todayMetrics?.strain ? `${todayMetrics.strain.toFixed(1)}` : 'N/A'}
  delta={calculateDelta(todayMetrics?.strain, yesterdayMetrics?.strain)}
  isStrain={true}  // ← Forces neutral color
/>
```

**Special Behavior:**
- **Always Gray**: Strain has no "good" or "bad" direction
- Higher strain isn't necessarily better or worse
- Still shows percentage change, just without color coding

### HRV Metric
```typescript
<MetricCard
  icon="pulse-outline"
  label="HRV"
  value={todayMetrics?.hrv ? `${Math.round(todayMetrics.hrv)} ms` : 'N/A'}
  delta={calculateDelta(todayMetrics?.hrv, yesterdayMetrics?.hrv)}
/>
```

**Color Interpretation:**
- **Green (+)**: Higher HRV than yesterday (better recovery)
- **Red (-)**: Lower HRV than yesterday (worse recovery)

---

## Web Dashboard Comparisons

### Location
`client/pages/dashboard_with_fitscore.tsx`

### Weekly Averages Section

The web dashboard displays **7-day rolling averages** for all metrics:

```typescript
const { data: whoopSummary, isLoading: summaryLoading } = useQuery<WhoopSummary>({
  queryKey: ['/api/whoop/weekly'],
  enabled: !!user,
  retry: 3,
  refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
});
```

**WhoopSummary Type:**
```typescript
interface WhoopSummary {
  avgRecovery: number | null;
  avgStrain: number | null;
  avgSleep: number | null;
  avgHRV: number | null;
}
```

### Weekly Average Display

Each weekly average is displayed in a card:

```typescript
<Card>
  <CardContent className="p-6 text-center">
    <div className="w-16 h-16 bg-blue-500 rounded-full">
      <Heart className="h-8 w-8 text-white" />
    </div>
    <div className="text-2xl font-bold text-blue-400">
      <CountUp end={whoopSummary.avgRecovery} decimals={1} duration={1200} />%
    </div>
    <span className="text-slate-300 font-medium">Avg Recovery</span>
  </CardContent>
</Card>
```

**Metrics Shown:**
1. **Avg Sleep** - Purple card
2. **Avg Recovery** - Blue card
3. **Avg Strain** - Orange card
4. **Avg HRV** - Red card

---

## Comparison Types Supported

Based on the recovered code, these comparison types were implemented:

### 1. Today vs Yesterday (Mobile Only)
- **Metric:** All WHOOP metrics
- **Calculation:** Percentage change
- **Display:** Color-coded with arrow icons
- **Location:** Mobile Dashboard metric cards

### 2. Weekly Averages (Web Only)
- **Metric:** All WHOOP metrics
- **Calculation:** 7-day rolling average
- **Display:** Separate section with animated counters
- **Location:** Web Dashboard bottom section

### 3. FitScore Trends (Missing Service Required)
From `GET /api/fitscore/history` endpoint:

```typescript
// Calculate trend (difference between last 3 days avg and first 3 days avg)
let trend = 0;
if (scores.length >= 6) {
  const firstThree = scores.slice(0, 3).reduce((sum, item) => sum + item.score, 0) / 3;
  const lastThree = scores.slice(-3).reduce((sum, item) => sum + item.score, 0) / 3;
  trend = lastThree - firstThree;
}
```

**Trend Interpretation:**
- **Positive trend (+)**: FitScore improving over the week
- **Negative trend (-)**: FitScore declining over the week
- **Zero trend (0)**: FitScore stable

---

## Theme Colors Reference

From the recovered mobile theme:

```typescript
const colors = {
  accent: '#00D4FF',      // Cyan - Primary accent
  textPrimary: '#FFFFFF', // White text
  textMuted: '#94A3B8',   // Gray text
  bgPrimary: '#0F172A',   // Dark blue background
  surfaceMute: '#334155', // Muted surface
};

const state = {
  ready: '#10B981',       // Green - Positive/Ready
  rest: '#EF4444',        // Red - Negative/Rest
  // ... other state colors
};
```

### Web Dashboard Color Palette

**Metric Colors:**
- Sleep: Purple (`#A855F7`)
- Recovery: Blue (`#3B82F6`)
- Strain: Orange (`#F97316`)
- HRV: Red (`#EF4444`)

**Gradient Colors:**
- FitScore Logo: Cyan → Blue → Purple → Pink
  ```css
  #06B6D4 → #3B82F6 → #8B5CF6 → #D946EF
  ```

---

## Visual Examples

### Mobile Metric Card States

**Good Recovery (Green):**
```
┌─────────────────────┐
│  💚  Recovery       │
│     85%            │
│  ↑ vs. yesterday: +13% │  ← Green
└─────────────────────┘
```

**Poor Sleep (Red):**
```
┌─────────────────────┐
│  🌙  Sleep          │
│     6.2h           │
│  ↓ vs. yesterday: -12% │  ← Red
└─────────────────────┘
```

**Neutral Strain (Gray):**
```
┌─────────────────────┐
│  🔥  Strain         │
│     14.8           │
│  ↑ vs. yesterday: +8%  │  ← Gray (neutral)
└─────────────────────┘
```

---

## Missing Comparison Features

Based on your description, these comparison types were likely implemented but are in the **missing service files**:

### 1. Yesterday vs 7 Days Ago
- **Status:** Not found in recovered code
- **Likely location:** Missing `fitScoreService.ts` or custom component

### 2. Weekly Avg vs Last Month
- **Status:** Not found in recovered code
- **Likely location:** Missing dashboard component or service

### 3. Triangle Breakdown Visualization
- **Status:** Not found in recovered code
- **Likely location:** Custom component (never committed to git)
- **Description needed:** How did the triangle show Sleep/Recovery/Nutrition/Strain?

---

## Recommendations

To restore full comparison functionality:

1. **Keep** the mobile Today vs Yesterday comparison (already recovered)
2. **Keep** the web weekly averages (already recovered)
3. **Recreate** yesterday vs 7 days ago comparison
4. **Recreate** weekly avg vs monthly avg comparison
5. **Recreate** triangle breakdown visualization (need design specs)

The color coding system is already well-defined and can be reused for new comparison types.

---

## Code Reusability

The `calculateDelta()` function can be reused for any comparison type:

```typescript
// Today vs Yesterday
calculateDelta(today, yesterday)

// Today vs 7 Days Ago
calculateDelta(today, sevenDaysAgo)

// Weekly Avg vs Monthly Avg
calculateDelta(weeklyAvg, monthlyAvg)
```

Just apply the same color coding rules based on the metric type and `isStrain` flag.
