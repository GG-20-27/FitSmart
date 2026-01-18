import './server/loadEnv';
console.log('✓ loadEnv imported');

console.log('Importing whoopApiService...');
import { whoopApiService } from './server/whoopApiService';
console.log('✓ whoopApiService imported');

console.log('Importing userService...');
import { userService } from './server/userService';
console.log('✓ userService imported');

console.log('Importing jwtAuth...');
import { jwtAuthMiddleware } from './server/jwtAuth';
console.log('✓ jwtAuth imported');

console.log('All services imported successfully!');
process.exit(0);
