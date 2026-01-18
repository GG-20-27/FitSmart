import "./server/loadEnv";
import express from "express";
import { registerRoutes } from "./server/routes";
import { whoopApiService } from "./server/whoopApiService";
import { userService } from "./server/userService";
import { jwtAuthMiddleware } from "./server/jwtAuth";

console.log('✓ All imports completed successfully');
console.log('✓ Creating Express app...');

const app = express();
app.set('trust proxy', 1);
app.use(jwtAuthMiddleware);

console.log('✓ Express app configured');
console.log('✓ Test complete!');
process.exit(0);
