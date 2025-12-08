import { Router } from "express";

type BasePhase = "phase_1" | "phase_2" | "phase_3";
type PhaseId = BasePhase | "complete";

interface OnboardingQuestion {
  id: string;
  phase: PhaseId;
  question: string;
  type: "text" | "number" | "select" | "multiselect" | "json" | "scale";
  options?: string[];
  required: boolean;
  fieldName: string;
  order: number;
  helperText?: string;
}

interface PhaseStatus {
  complete: boolean;
  completedAt: string | null;
}

interface OnboardingState {
  currentPhase: PhaseId;
  responses: Record<string, any>;
  phaseStatus: {
    phase_1: PhaseStatus;
    phase_2: PhaseStatus;
    phase_3: PhaseStatus;
  };
}

const router = Router();

const BASE_PHASES: BasePhase[] = ["phase_1", "phase_2", "phase_3"];
const PHASE_ORDER: PhaseId[] = [...BASE_PHASES, "complete"];
const QUESTIONS: OnboardingQuestion[] = [
  {
    id: "fitness_goal",
    phase: "phase_1",
    question: "What is your primary fitness goal?",
    type: "select",
    options: ["Improve endurance", "Build strength", "Lose weight", "General health"],
    required: true,
    fieldName: "fitness_goal",
    order: 1,
    helperText: "We use this to personalize your recommendations."
  },
  {
    id: "weekly_sessions",
    phase: "phase_1",
    question: "How many workout sessions do you complete per week?",
    type: "number",
    required: true,
    fieldName: "weekly_sessions",
    order: 2
  },
  {
    id: "sleep_hours",
    phase: "phase_2",
    question: "How many hours do you usually sleep each night?",
    type: "number",
    required: true,
    fieldName: "sleep_hours",
    order: 3
  },
  {
    id: "nutrition_focus",
    phase: "phase_2",
    question: "What nutrition area do you want to improve?",
    type: "select",
    options: ["Meal timing", "Macros", "Hydration", "Supplements"],
    required: false,
    fieldName: "nutrition_focus",
    order: 4
  },
  {
    id: "coach_access",
    phase: "phase_3",
    question: "Do you want FitScore AI to proactively check-in on your goals?",
    type: "select",
    options: ["Yes, check in daily", "Yes, check in weekly", "No reminders"],
    required: true,
    fieldName: "coach_access",
    order: 5
  }
];

const TOTAL_QUESTIONS = QUESTIONS.length;

const createDefaultState = (): OnboardingState => ({
  currentPhase: "phase_1",
  responses: {},
  phaseStatus: {
    phase_1: { complete: false, completedAt: null },
    phase_2: { complete: false, completedAt: null },
    phase_3: { complete: false, completedAt: null }
  }
});

let onboardingState: OnboardingState = createDefaultState();

const getAnsweredCount = () => Object.keys(onboardingState.responses).length;

const getNextQuestion = (): OnboardingQuestion | null => {
  const remaining = QUESTIONS
    .slice()
    .sort((a, b) => a.order - b.order)
    .find((question) => onboardingState.responses[question.fieldName] === undefined);

  if (!remaining) {
    return null;
  }

  if (remaining.phase !== onboardingState.currentPhase && remaining.phase !== "complete") {
    onboardingState.currentPhase = remaining.phase;
  }

  return remaining;
};

const buildDetailedStatus = () => {
  const answeredQuestions = getAnsweredCount();
  const isComplete =
    onboardingState.phaseStatus.phase_1.complete &&
    onboardingState.phaseStatus.phase_2.complete &&
    onboardingState.phaseStatus.phase_3.complete;

  return {
    currentPhase: isComplete ? "complete" : onboardingState.currentPhase,
    isComplete,
    phase1: onboardingState.phaseStatus.phase_1,
    phase2: onboardingState.phaseStatus.phase_2,
    phase3: onboardingState.phaseStatus.phase_3,
    answeredQuestions,
    totalQuestions: TOTAL_QUESTIONS,
    responses: onboardingState.responses
  };
};

const isBasePhase = (phase: PhaseId): phase is BasePhase => phase !== "complete";

const markPhaseStatus = (phase: PhaseId) => {
  if (!isBasePhase(phase)) return;

  const phaseQuestions = QUESTIONS.filter((q) => q.phase === phase);
  const answeredAll = phaseQuestions.every((q) => onboardingState.responses[q.fieldName] !== undefined);

  if (answeredAll && !onboardingState.phaseStatus[phase].complete) {
    onboardingState.phaseStatus[phase] = {
      complete: true,
      completedAt: new Date().toISOString()
    };
  }
};

const updatePhaseProgress = (phase: PhaseId) => {
  if (!isBasePhase(phase)) return;

  markPhaseStatus(phase);
  const currentPhaseIndex = PHASE_ORDER.indexOf(phase);
  const currentPhaseComplete = onboardingState.phaseStatus[phase].complete;

  if (currentPhaseComplete) {
    const nextPhase = PHASE_ORDER[currentPhaseIndex + 1] ?? "complete";
    onboardingState.currentPhase = nextPhase;
  } else {
    onboardingState.currentPhase = phase;
  }
};

router.get("/", (req, res) => {
  const answeredCount = getAnsweredCount();
  const nextQuestion = getNextQuestion();
  const currentPhase =
    nextQuestion?.phase && nextQuestion.phase !== "complete"
      ? nextQuestion.phase
      : onboardingState.currentPhase;
  const phaseQuestions = QUESTIONS.filter((q) => q.phase === currentPhase);
  const answeredPhaseQuestions = phaseQuestions.filter(
    (q) => onboardingState.responses[q.fieldName] !== undefined
  ).length;
  const isPhaseComplete =
    currentPhase === "complete" ||
    (phaseQuestions.length > 0 && answeredPhaseQuestions >= phaseQuestions.length);

  res.json({
    currentPhase,
    nextQuestion,
    isPhaseComplete,
    progress: TOTAL_QUESTIONS === 0 ? 0 : answeredCount / TOTAL_QUESTIONS,
    totalQuestions: TOTAL_QUESTIONS,
    answeredCount,
    phase1CompletedAt: onboardingState.phaseStatus.phase_1.completedAt,
    phase2CompletedAt: onboardingState.phaseStatus.phase_2.completedAt,
    phase3CompletedAt: onboardingState.phaseStatus.phase_3.completedAt
  });
});

router.post("/", (req, res) => {
  const { questionId, answer } = req.body as { questionId?: string; answer?: any };

  if (!questionId) {
    return res.status(400).json({ success: false, message: "questionId is required" });
  }

  const question = QUESTIONS.find((q) => q.id === questionId);
  if (!question) {
    return res.status(404).json({ success: false, message: "Question not found" });
  }

  if (question.required && (answer === undefined || answer === null || answer === "")) {
    return res.status(400).json({ success: false, message: "Answer is required for this question" });
  }

  onboardingState.responses[question.fieldName] = answer;
  updatePhaseProgress(question.phase);

  const nextQuestion = getNextQuestion();
  const phaseComplete = isBasePhase(question.phase)
    ? onboardingState.phaseStatus[question.phase].complete
    : false;

  res.json({
    success: true,
    phaseComplete,
    currentPhase: onboardingState.currentPhase,
    nextQuestion,
    message: phaseComplete ? "Phase complete" : "Answer saved"
  });
});

router.get("/questions", (req, res) => {
  res.json({
    phase: onboardingState.currentPhase,
    questions: QUESTIONS
  });
});

router.get("/status", (req, res) => {
  res.json(buildDetailedStatus());
});

router.post("/reset", (req, res) => {
  onboardingState = createDefaultState();
  res.json({
    success: true,
    message: "Onboarding progress reset",
    status: buildDetailedStatus()
  });
});

export default router;

