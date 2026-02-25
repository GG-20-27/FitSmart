import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                  // Support up to 50 concurrent connections (safe for 10+ users)
  idleTimeoutMillis: 30000, // Release idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if pool exhausted
  ssl: {
    rejectUnauthorized: false
  }
});

// Handle pool errors to prevent server crashes
pool.on('error', (err) => {
  console.error('[DATABASE] Unexpected database error:', err.message);
});

export const db = drizzle(pool, { schema });