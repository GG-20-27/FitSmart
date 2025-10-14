# FitScoreAI Mobile - Setup Guide

## Environment Configuration

The mobile app is configured to use the ngrok tunnel URL by default for backend API calls.

### Configuration Files

1. **app.config.js** - Main Expo configuration
   - Contains `EXPO_PUBLIC_API_URL` pointing to ngrok tunnel
   - Contains static JWT for development
   - Supports environment variable overrides

2. **src/api/client.ts** - API client
   - Automatically resolves API URL from app.config.js
   - Logs the resolved URL on startup
   - Handles authentication tokens

### Environment Variables (Optional)

You can override default values using environment variables:

```bash
# Backend API URL
export EXPO_PUBLIC_API_URL=https://your-ngrok-url.ngrok-free.app

# Static JWT for development
export EXPO_PUBLIC_STATIC_JWT=your-jwt-token
```

## Running the App

### Quick Start (iOS Simulator)

**One command that always works:**
```bash
npm run ios
```

This will:
- Clear the cache
- Start Expo in tunnel mode
- Open the iOS simulator
- Connect via ngrok tunnel

### Other Commands

```bash
# Start dev server only (tunnel mode)
npm start

# Start with local network (no tunnel)
npm run start:local

# Android
npm run android

# Clean and reinstall
npm run clean
```

## Troubleshooting

### Issue: "Could not connect to dev server"

**Solution:**
1. Make sure backend is running at the ngrok URL
2. Clear Expo cache: `npm start` (already includes --clear)
3. Restart the simulator
4. Check logs for: `[API] Base URL resolved to https://greyson-bilgiest-sandy.ngrok-free.app`

### Issue: "Network request failed"

**Solution:**
1. Verify ngrok tunnel is active: `curl https://greyson-bilgiest-sandy.ngrok-free.app/api/health`
2. Check if the ngrok URL has changed (update app.config.js if needed)
3. Restart Expo dev server

### Issue: "Expo app closes immediately"

**Solution:**
1. Check Metro bundler logs for JavaScript errors
2. Look for "Reanimated" errors → Babel plugin is now configured
3. Verify simulator is running and not showing errors
4. Try: `npm run clean` then `npm run ios`

## Network Architecture

```
iOS Simulator
    ↓ (tunnel mode)
Expo Dev Server (Metro Bundler)
    ↓ (loads JS bundles)
React Native App
    ↓ (API calls via fetch)
ngrok Tunnel → Backend Server
```

**Key Points:**
- **Dev Server**: Uses Expo tunnel for loading JavaScript bundles
- **API Calls**: Always use ngrok URL (configured in app.config.js)
- Both connections are tunneled for remote access

## Startup Logs

On successful startup, you should see:

```
[API] ✅ Using EXPO_PUBLIC_API_URL from app.json: https://greyson-bilgiest-sandy.ngrok-free.app
[API] Base URL resolved to https://greyson-bilgiest-sandy.ngrok-free.app
[APP] Onboarding status: { ... }
```

If you see errors about missing API URL, check app.config.js.

## Configuration Changes

After modifying app.config.js or environment variables:

```bash
npm start  # This clears cache automatically
```

Or for a complete clean:

```bash
npm run clean  # Removes node_modules, .expo, reinstalls
npm run ios    # Start fresh
```

