// server/loadEnv.ts
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Minimal environment loader used across the server.
 * Ensures .env is loaded before any service that depends on it.
 */
export function loadEnv(): void {
  // Try multiple locations for .env file
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),           // Root directory
    path.resolve(process.cwd(), "server", ".env"), // Server directory
    path.resolve(__dirname, ".env"),               // Same directory as loadEnv.ts
    path.resolve(__dirname, "..", ".env"),        // Parent of server directory
  ];
  
  let loaded = false;
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath });
      
      if (result.error) {
        console.error(`[loadEnv] Error loading .env file from ${envPath}:`, result.error);
      } else {
        console.log(`[loadEnv] Successfully loaded .env file from ${envPath}`);
        loaded = true;
        break;
      }
    }
  }
  
  if (!loaded) {
    // Fallback: let dotenv search for .env automatically
    console.warn(`[loadEnv] .env file not found in any of the expected locations, trying default search...`);
    dotenv.config();
  }
  
  // Verify DATABASE_URL is loaded
  if (process.env.DATABASE_URL) {
    console.log(`[loadEnv] DATABASE_URL is set (${process.env.DATABASE_URL.substring(0, 20)}...)`);
  } else {
    console.warn(`[loadEnv] Warning: DATABASE_URL is not set in .env file`);
  }
}

// Automatically load environment variables when this module is imported
loadEnv();
