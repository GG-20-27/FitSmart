/**
 * Migration script - Run database migrations using existing pool
 * Usage: tsx server/migrate.ts
 */

// Load environment variables first
import './loadEnv';

import { pool } from './db';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  const migrations = [
    '2026-add-meal-metadata.sql',
    '2026-create-training-data.sql',
    '2026-fix-meal-type-constraint.sql',
    '2026-add-training-analysis.sql'
  ];

  try {
    for (const migration of migrations) {
      const filePath = join(__dirname, '..', 'migrations', migration);
      console.log(`📄 Running: ${migration}`);

      const sql = readFileSync(filePath, 'utf-8');
      await pool.query(sql);

      console.log(`✅ Completed: ${migration}\n`);
    }

    console.log('🎉 All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
