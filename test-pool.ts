import './server/loadEnv';
console.log('✓ loadEnv imported');

import { Pool } from 'pg';
console.log('✓ pg imported');

console.log('Creating pool...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
console.log('✓ Pool created');

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

console.log('Pool created successfully!');
setTimeout(() => {
  console.log('Ending pool...');
  pool.end().then(() => {
    console.log('✓ Test complete');
    process.exit(0);
  });
}, 1000);
