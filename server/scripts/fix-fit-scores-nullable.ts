/**
 * Migration: drop NOT NULL on fit_scores.components and fit_scores.breakdown
 * so that the new pillar-score inserts (which don't include these legacy cols) succeed.
 */
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  // Show current nullable status
  const cols = await pool.query(`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'fit_scores'
    ORDER BY ordinal_position
  `);
  console.log('BEFORE — fit_scores columns:');
  cols.rows.forEach(r => console.log(` ${r.column_name}: nullable=${r.is_nullable}, default=${r.column_default}`));

  // Drop NOT NULL on all legacy columns not used by new pillar-score inserts
  const legacyCols = ['components', 'breakdown', 'tagline', 'updated_at', 'motivation'];
  for (const col of legacyCols) {
    try {
      await pool.query(`ALTER TABLE fit_scores ALTER COLUMN ${col} DROP NOT NULL`);
      console.log(`\n✓ Dropped NOT NULL on ${col}`);
    } catch (e: any) {
      console.log(`— ${col}: ${e.message}`);
    }
  }

  // Test insert now
  const testRes = await pool.query(`
    INSERT INTO fit_scores (user_id, date, score, calculated_at, nutrition_score, training_score, recovery_score)
    VALUES ('_test_', '_test_2', 5.0, now(), 5.0, 5.0, 5.0)
    ON CONFLICT (user_id, date) DO UPDATE SET score = EXCLUDED.score
    RETURNING user_id, date, score, nutrition_score
  `);
  console.log('\n✓ INSERT test succeeded:', JSON.stringify(testRes.rows[0]));
  await pool.query(`DELETE FROM fit_scores WHERE user_id = '_test_'`);
  console.log('✓ Cleanup done');

  await pool.end();
  console.log('\nMigration complete. FitScore inserts will now work.');
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
