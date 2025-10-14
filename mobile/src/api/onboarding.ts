import { apiRequest } from './client';

export interface OnboardingQuestion {
  id: string;
  phase: string;
  question: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'json' | 'scale';
  options?: string[];
  required: boolean;
  fieldName: string;
  order: number;
}

export interface OnboardingStatus {
  currentPhase: string;
  nextQuestion: OnboardingQuestion | null;
  isPhaseComplete: boolean;
  progress: number;
  totalQuestions: number;
  answeredCount: number;
  phase1CompletedAt: string | null;
  phase2CompletedAt: string | null;
  phase3CompletedAt: string | null;
}

export interface SubmitAnswerResponse {
  success: boolean;
  phaseComplete: boolean;
  currentPhase: string;
  nextQuestion: OnboardingQuestion | null;
  message: string;
}

export interface DetailedStatus {
  currentPhase: string;
  isComplete: boolean;
  phase1: {
    complete: boolean;
    completedAt: string | null;
  };
  phase2: {
    complete: boolean;
    completedAt: string | null;
  };
  phase3: {
    complete: boolean;
    completedAt: string | null;
  };
  answeredQuestions: number;
  totalQuestions: number;
  responses: Record<string, any>;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return apiRequest<OnboardingStatus>('/api/onboarding');
}

export async function submitAnswer(questionId: string, answer: any): Promise<SubmitAnswerResponse> {
  return apiRequest<SubmitAnswerResponse>('/api/onboarding', {
    method: 'POST',
    body: JSON.stringify({ questionId, answer })
  });
}

export async function getDetailedStatus(): Promise<DetailedStatus> {
  return apiRequest<DetailedStatus>('/api/onboarding/status');
}

export async function getAllQuestions(): Promise<{ phase: string; questions: OnboardingQuestion[] }> {
  return apiRequest<{ phase: string; questions: OnboardingQuestion[] }>('/api/onboarding/questions');
}
