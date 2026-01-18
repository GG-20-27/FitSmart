import './server/loadEnv';
console.log('✓ loadEnv imported');

console.log('Importing schema...');
import * as schema from './shared/schema';
console.log('✓ schema imported');

console.log('Test complete!');
process.exit(0);
