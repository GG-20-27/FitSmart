# 🚀 FitScoreAI Mobile - Quick Start

## One Command to Run Everything

```bash
npm run ios
```

That's it! This single command will:
- ✅ Clear Expo cache
- ✅ Start Expo dev server (local mode - fastest)
- ✅ Open iOS simulator
- ✅ API calls go to: `https://greyson-bilgiest-sandy.ngrok-free.app`

**Note:** The Expo dev server runs locally (fast), but your API calls still use ngrok (configured in `app.config.js`).

## Expected Startup Logs

You should see these logs in order:

```
============================================================
🚀 FitScoreAI Mobile App Starting
============================================================
📱 Expo SDK: 54.0.12
🌐 API Base URL: https://greyson-bilgiest-sandy.ngrok-free.app
🔧 App Version: 1.0.0
📦 Platform: iOS
============================================================
[API] ✅ Using EXPO_PUBLIC_API_URL from app.json: https://greyson-bilgiest-sandy.ngrok-free.app
[API] Base URL resolved to https://greyson-bilgiest-sandy.ngrok-free.app
[APP] Onboarding status: { ... }
```

## What Changed

| File | Change |
|------|--------|
| `app.config.js` | Replaced `app.json` with JS config for env vars |
| `package.json` | All scripts now use `--tunnel` mode by default |
| `App.tsx` | Added startup logging banner |
| `babel.config.js` | Added Reanimated plugin (fixes crash) |

## Troubleshooting

### ❌ "Could not connect to dev server"

```bash
# Solution: Restart with cache clear (already included)
npm run ios
```

### ❌ App crashes on iOS simulator

```bash
# Solution: Clean everything and restart
npm run clean
npm run ios
```

### ❌ "Network request failed"

Check:
1. Backend is running at ngrok URL
2. Ngrok tunnel hasn't changed (update `app.config.js` if it has)
3. You see the startup banner with correct URL

### 🌐 Need tunnel mode for Expo dev server?

If testing on a physical device not on same WiFi:
```bash
npm run ios:tunnel
```

By default, tunnel mode is **not needed** for simulator testing.

## Configuration

Edit `mobile/app.config.js` to change:
- `EXPO_PUBLIC_API_URL` - Backend API URL
- `staticJwt` - Development JWT token

After editing, restart:
```bash
npm start
```

## All Available Commands

```bash
npm start              # Start dev server (local mode)
npm run start:tunnel   # Start with tunnel (for physical devices)
npm run ios            # Start and open iOS simulator (local)
npm run ios:tunnel     # Start and open iOS with tunnel
npm run android        # Start and open Android
npm run clean          # Clean install (fixes most issues)
```

## Understanding the Architecture

- **Expo Dev Server (Metro):** Runs locally on your Mac → Simulator (fast ⚡)
- **Backend API Calls:** App → ngrok tunnel → Backend (configured in app.config.js)

## Success Checklist

- [ ] Backend running at ngrok URL
- [ ] Run `npm run ios` from mobile directory
- [ ] See startup banner with ngrok URL
- [ ] App opens in simulator without exiting
- [ ] No "could not connect" errors

