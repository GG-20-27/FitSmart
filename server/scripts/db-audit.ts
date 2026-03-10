/**
 * DB audit script — deep dive on data integrity.
 */
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Pool } from 'pg';

async function query(pool: Pool, sql: string, label: string, params?: any[]) {
  try {
    const res = await pool.query(sql, params);
    console.log(`\n${label} (${res.rowCount} rows):`);
    if (res.rows.length === 0) {
      console.log('  (none)');
    } else {
      res.rows.forEach(r => console.log(' ', JSON.stringify(r)));
    }
    return res.rows;
  } catch (e: any) {
    console.log(`\n${label}: ERROR — ${e.message}`);
    return [];
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  console.log('=== DB AUDIT ===\n');

  // Constraints on fit_scores
  await query(pool, `
    SELECT conname, contype, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'fit_scores'::regclass
    ORDER BY contype
  `, 'fit_scores CONSTRAINTS');

  // Indexes on fit_scores
  await query(pool, `
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'fit_scores'
  `, 'fit_scores INDEXES');

  // Test insert — try a dry insert to see if it errors
  await query(pool, `
    SELECT 1 FROM fit_scores LIMIT 1
  `, 'fit_scores SELECT test');

  // Total rows
  await query(pool, `SELECT count(*) as total FROM fit_scores`, 'fit_scores TOTAL ROWS');

  // Meals — actual columns
  await query(pool, `
    SELECT user_id, count(*) as meals, max(date) as last_date,
      count(*) filter (where analysis_result is not null) as with_analysis
    FROM meals GROUP BY user_id
  `, 'MEALS per user (with analysis count)');

  // Most recent meal + analysis snippet
  await query(pool, `
    SELECT user_id, date, meal_type, left(analysis_result, 200) as analysis_preview
    FROM meals
    ORDER BY uploaded_at DESC LIMIT 3
  `, 'RECENT MEALS with analysis preview');

  // User context
  await query(pool, `
    SELECT user_id, tier1_goal, injury_type, rehab_stage,
           calorie_target, protein_target, weight_kg, macro_target_overridden
    FROM user_context
  `, 'USER_CONTEXT');

  // Improvement plans
  await query(pool, `
    SELECT user_id, pillar, status, activated_at::date,
           completed_at::date, rolling_avg_at_completion
    FROM improvement_plans ORDER BY activated_at DESC
  `, 'IMPROVEMENT_PLANS');

  // WHOOP data
  await query(pool, `
    SELECT user_id, count(*) as rows, min(date) as min_date, max(date) as max_date
    FROM whoop_data GROUP BY user_id
  `, 'WHOOP_DATA per user');

  // Daily checkins
  await query(pool, `
    SELECT user_id, count(*) as rows, min(date) as min_date, max(date) as max_date
    FROM daily_checkins GROUP BY user_id
  `, 'DAILY_CHECKINS per user');

  // Chat history
  await query(pool, `
    SELECT user_id, count(*) as messages, max(created_at)::date as last_msg
    FROM chat_history GROUP BY user_id
  `, 'CHAT_HISTORY per user');

  // Goals
  await query(pool, `
    SELECT user_id, title, priority FROM user_goals
  `, 'USER_GOALS');

  // Try an insert test to see the exact error
  console.log('\n--- INSERT TEST ---');
  try {
    const testRes = await pool.query(`
      INSERT INTO fit_scores (user_id, date, score, calculated_at)
      VALUES ('_test_', '_test_', 5.0, now())
      ON CONFLICT (user_id, date) DO UPDATE SET score = EXCLUDED.score
      RETURNING *
    `);
    console.log('INSERT test succeeded:', JSON.stringify(testRes.rows[0]));
    // Clean up
    await pool.query(`DELETE FROM fit_scores WHERE user_id = '_test_'`);
    console.log('Cleanup done.');
  } catch (e: any) {
    console.log('INSERT test FAILED:', e.message);
  }

  await pool.end();
  console.log('\n=== END AUDIT ===');
}

main().catch(err => { console.error(err); process.exit(1); });
