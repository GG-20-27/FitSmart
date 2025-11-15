/**
 * Minimal stub for onboarding routes.
 * This file is only meant to satisfy imports and prevent runtime failures.
 */

import express, { Router } from 'express';

const router = Router();

/**
 * GET /api/onboarding
 * Get onboarding status/data
 * Temporarily returns completed status to allow users to skip onboarding
 */
router.get('/', async (req, res) => {
  res.json({
    currentPhase: 'complete',
    nextQuestion: null,
    isPhaseComplete: true,
    progress: 100,
    totalQuestions: 0,
    answeredCount: 0,
    phase1CompletedAt: new Date().toISOString(),
    phase2CompletedAt: new Date().toISOString(),
    phase3CompletedAt: new Date().toISOString(),
    isComplete: true,
    status: 'complete',
    currentStep: 100,
    totalSteps: 100,
  });
});

/**
 * POST /api/onboarding
 * Submit onboarding data
 */
router.post('/', async (req, res) => {
  res.json({
    success: true,
    message: 'Onboarding data received',
  });
});

/**
 * GET /api/onboarding/questions
 * Get onboarding questions
 */
router.get('/questions', async (req, res) => {
  res.json({
    questions: [],
  });
});

/**
 * GET /api/onboarding/status
 * Get onboarding status
 * Temporarily returns completed status to allow users to skip onboarding
 */
router.get('/status', async (req, res) => {
  res.json({
    currentPhase: 'complete',
    nextQuestion: null,
    isPhaseComplete: true,
    progress: 100,
    totalQuestions: 0,
    answeredCount: 0,
    phase1CompletedAt: new Date().toISOString(),
    phase2CompletedAt: new Date().toISOString(),
    phase3CompletedAt: new Date().toISOString(),
    isComplete: true,
    status: 'complete',
    completed: true,
  });
});

/**
 * POST /api/onboarding/reset
 * Reset onboarding progress
 */
router.post('/reset', async (req, res) => {
  res.json({
    success: true,
    message: 'Onboarding reset',
  });
});

export default router;

