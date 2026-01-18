import './server/loadEnv';
console.log('✓ loadEnv imported');

import express from 'express';
console.log('✓ express imported');

import { registerRoutes } from './server/routes';
console.log('✓ routes imported');

console.log('All imports successful!');
process.exit(0);
