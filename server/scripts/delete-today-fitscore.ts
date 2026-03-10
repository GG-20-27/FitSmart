/**
 * Utility script: delete today's FitScore for a user so they can re-test.
 * Usage: tsx server/scripts/delete-today-fitscore.ts <userId>
 */
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const date = process.argv[2] || '2026-03-10';
const userId = process.argv[3];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool, { schema });

  // First, show what exists
  const rows = await db.select({
    userId: schema.fitScores.userId,
    date: schema.fitScores.date,
    score: schema.fitScores.score,
    nutritionScore: schema.fitScores.nutritionScore,
    trainingScore: schema.fitScores.trainingScore,
  }).from(schema.fitScores)
    .where(userId
      ? and(eq(schema.fitScores.date, date), eq(schema.fitScores.userId, userId))
      : eq(schema.fitScores.date, date));

  console.log(`FitScore rows for ${date}${userId ? ` (user: ${userId})` : ''}:`);
  console.log(JSON.stringify(rows, null, 2));

  if (rows.length === 0) {
    console.log('No rows found — nothing to delete.');
    await pool.end();
    return;
  }

  if (!userId) {
    console.log('\nPass a userId as second argument to delete. Example:');
    console.log(`  tsx server/scripts/delete-today-fitscore.ts ${date} ${rows[0].userId}`);
    await pool.end();
    return;
  }

  await db.delete(schema.fitScores)
    .where(and(eq(schema.fitScores.date, date), eq(schema.fitScores.userId, userId)));

  console.log(`\nDeleted FitScore row for user ${userId} on ${date}.`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
