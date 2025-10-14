module.exports = {
  expo: {
    name: "FitScoreAI",
    slug: "fitscoreai",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/chatgpt-icon.png",
    userInterfaceStyle: "dark",
    splash: {
      backgroundColor: "#0f172a"
    },
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
        foregroundImage: "./assets/chatgpt-icon.png",
        backgroundColor: "#0f172a"
      },
      package: "com.fitscoreai.app"
    },
    web: {
      favicon: "./assets/chatgpt-icon.png"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    extra: {
      // Static JWT for authentication
      staticJwt: process.env.EXPO_PUBLIC_STATIC_JWT ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3aG9vcElkIjoid2hvb3BfMjUyODM1MjgiLCJyb2xlIjoidXNlciIsImV4cCI6MjA3NDg1MzczMywiaWF0IjoxNzU5NDkzNzMzfQ.xfwpDHuUk2YCsarUJmI661vgGhs554gVzUulFsVeT8s",

      // Backend API URL
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ||
        "https://greyson-bilgiest-sandy.ngrok-free.app",

      // Environment
      EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV || "development",

      // EAS Update configuration
      eas: {
        projectId: "d07a5ca5-63a8-4f29-ae5f-3929eeb51998"
      }
    },
    plugins: [
      "expo-asset"
    ],
    // Force tunnel mode for development
    packagerOpts: {
      dev: true
    }
  }
};

