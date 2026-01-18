import './server/loadEnv';
console.log('Testing database connection...');

import { pool } from './server/db';

console.log('Pool imported, testing query...');

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  }
  console.log('✅ Database connected:', res.rows[0]);
  pool.end();
  process.exit(0);
});

// Timeout if it hangs
setTimeout(() => {
  console.error('❌ Database connection timeout');
  process.exit(1);
}, 5000);
