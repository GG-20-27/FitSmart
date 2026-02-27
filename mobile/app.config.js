module.exports = {
  expo: {
    name: "FitScoreAI",
    slug: "fitscoreai",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/logo.png",
    userInterfaceStyle: "dark",
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      url: "https://u.expo.dev/d07a5ca5-63a8-4f29-ae5f-3929eeb51998"
    },
    splash: {
      backgroundColor: "#0f172a"
    },
    scheme: "fitsmart",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fitscoreai.app",
      infoPlist: {
        NSCameraUsageDescription: "FitScore AI needs camera access to analyze your meals for nutrition tracking.",
        NSMicrophoneUsageDescription: "FitScore AI needs microphone access for voice message transcription.",
        NSPhotoLibraryUsageDescription: "FitScore AI needs photo library access to select meal images for analysis.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/logo.png",
        backgroundColor: "#0f172a"
      },
      package: "com.fitscoreai.app"
    },
    web: {
      favicon: "./assets/logo.png"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    extra: {
      // Static JWT for authentication (set EXPO_PUBLIC_STATIC_JWT in .env for local dev)
      staticJwt: process.env.EXPO_PUBLIC_STATIC_JWT || undefined,

      // Backend API URL
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ||
        "https://fitsmart-production.up.railway.app",

      // Environment
      EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV || "development",

      // EAS Update configuration
      eas: {
        projectId: "d07a5ca5-63a8-4f29-ae5f-3929eeb51998"
      }
    },
    plugins: [
      "expo-asset",
      "expo-web-browser"
    ],
    // Force tunnel mode for development
    packagerOpts: {
      dev: true
    }
  }
};

