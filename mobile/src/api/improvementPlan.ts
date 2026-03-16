import { apiRequest } from './client';

export type Pillar = 'nutrition' | 'training' | 'recovery';

export interface PendingPlan {
  pillar: Pillar;
  weaknessCount: number;
  unlocked: boolean; // true when weaknessCount >= 5
}

export interface ActivePlan {
  id: number;
  pillar: Pillar;
  activatedAt: string;
  currentRollingAvg?: number | null;
  daysCount?: number;
}

export async function generateFitCookMealPlan(params: {
  times?: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
  preferences?: string;
  allergies?: string;
  previousPlan?: string;
}): Promise<{ mealPlan: string }> {
  return apiRequest<{ mealPlan: string }>('/api/improvement-plan/meal-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function generateGroceryList(meals: string[]): Promise<{ groceries: string[] }> {
  return apiRequest<{ groceries: string[] }>('/api/improvement-plan/meal-plan/groceries', {
    method: 'POST',
    body: JSON.stringify({ meals }),
  });
}

export async function regenerateSingleMeal(params: {
  mealType: 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner';
  existingMeal: string;
  timing: string;
  preferences?: string;
  allergies?: string;
}): Promise<{ meal: string }> {
  return apiRequest<{ meal: string }>('/api/improvement-plan/meal-plan/single', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface CompletedPlan {
  id: number;
  pillar: Pillar;
  completedAt: string | null;
  rollingAvgAtCompletion: number | null;
  status: 'completed' | 'expired';
}

export interface ImprovementPlanStatus {
  activePlan?: ActivePlan;
  activePlans?: ActivePlan[]; // all active plans (admin may have multiple)
  pendingPlan?: PendingPlan;
  pendingPlans?: PendingPlan[]; // all pending plans (admin sees all non-active pillars)
  completedPlans: CompletedPlan[];
}

export interface PlanHabitDef {
  id: string;
  label: string;
  description?: string;
  frequency: 'daily';
}

export interface PlanContent {
  title: string;
  triggerLine: string;
  evidence: string[];   // 2-3 data bullets (may be empty if not enough history)
  targets: string[];    // 2-3 personalized targets (may be empty)
  rules: string[];
  exitCondition: string;
  planHabits: PlanHabitDef[];
  trainingDirection?: { direction: string; explanation: string }; // training pillar only
}

export interface TodayPlanHabit {
  habit_key: string;
  label: string;
  description?: string;
  checked: boolean;
}

export async function getImprovementPlanStatus(): Promise<ImprovementPlanStatus> {
  return apiRequest<ImprovementPlanStatus>('/api/improvement-plan');
}

export async function activateImprovementPlan(params: { pillar: string; bedtime?: string; wakeTime?: string }): Promise<ActivePlan> {
  return apiRequest<ActivePlan>('/api/improvement-plan/activate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getPlanContent(pillar: string): Promise<PlanContent> {
  return apiRequest<PlanContent>(`/api/improvement-plan/content?pillar=${pillar}`);
}

export async function getPlanHabitsToday(date: string): Promise<TodayPlanHabit[]> {
  const res = await apiRequest<{ planHabits: TodayPlanHabit[] }>(`/api/plan-habits/today?date=${date}`);
  return res.planHabits ?? [];
}

export async function togglePlanHabit(date: string, habit_key: string, checked: boolean): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/plan-habits/checkin', {
    method: 'POST',
    body: JSON.stringify({ date, habit_key, checked }),
  });
}

export async function generateRecoveryRoutine(params: {
  type: 'morning' | 'winddown';
  bedtime: string;
  wakeTime: string;
  variant?: string;
}): Promise<{ routine: string }> {
  return apiRequest<{ routine: string }>('/api/improvement-plan/routines', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function abandonPlan(pillar: string): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/improvement-plan/abandon', {
    method: 'POST',
    body: JSON.stringify({ pillar }),
  });
}

export async function generateTrainingSession(params: {
  goal: string;
  direction?: string;
  variant?: string;
}): Promise<{ session: string }> {
  return apiRequest<{ session: string }>('/api/improvement-plan/training-session', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export const PILLAR_LABELS: Record<Pillar, string> = {
  nutrition: 'Nutrition',
  training: 'Training',
  recovery: 'Recovery',
};
