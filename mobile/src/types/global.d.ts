declare const __DEV__: boolean;

declare global {
  // Minimal process typing for React Native bundles that expose process.env at build time
  const process: {
    env?: Record<string, string | undefined>;
  };
  
  // Global refresh function for onboarding status
  var refreshOnboardingStatus: (() => void) | undefined;
}

export {};
