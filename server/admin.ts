#!/usr/bin/env tsx

/**
 * Admin CLI for FitScore Health Dashboard
 * 
 * Usage:
 *   npm run admin:create-user <email>
 *   npm run admin:add-token <email> <access_token> [refresh_token] [expires_at_timestamp]
 *   npm run admin:list-users
 *   npm run admin:delete-user <email>
 */

import { userService } from './userService';

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'create-user': {
      const email = process.argv[3];
      if (!email) {
        console.error('Error: Email is required');
        console.log('Usage: npm run admin:create-user <email>');
        process.exit(1);
      }
      
      try {
        // Check if user already exists
        const existingUser = await userService.getUserByEmail(email);
        if (existingUser) {
          console.log(`User with email ${email} already exists with ID: ${existingUser.id}`);
          process.exit(0);
        }
        
        const user = await userService.createUser(email);
        console.log(`✅ User created successfully!`);
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${user.createdAt}`);
      } catch (error) {
        console.error('❌ Failed to create user:', error);
        process.exit(1);
      }
      break;
    }
    
    case 'add-token': {
      const email = process.argv[3];
      const accessToken = process.argv[4];
      const refreshToken = process.argv[5];
      const expiresAtStr = process.argv[6];
      
      if (!email || !accessToken) {
        console.error('Error: Email and access token are required');
        console.log('Usage: npm run admin:add-token <email> <access_token> [refresh_token] [expires_at_timestamp]');
        process.exit(1);
      }
      
      try {
        const user = await userService.getUserByEmail(email);
        if (!user) {
          console.error(`❌ User with email ${email} not found`);
          console.log('Use "npm run admin:create-user <email>" to create the user first');
          process.exit(1);
        }
        
        const expiresAt = expiresAtStr ? new Date(parseInt(expiresAtStr) * 1000) : undefined;
        
        await userService.addWhoopToken(user.id, accessToken, refreshToken, expiresAt);
        console.log(`✅ WHOOP token added successfully for user: ${email}`);
        console.log(`   User ID: ${user.id}`);
        console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);
        if (refreshToken) console.log(`   Refresh Token: ${refreshToken.substring(0, 20)}...`);
        if (expiresAt) console.log(`   Expires At: ${expiresAt}`);
      } catch (error) {
        console.error('❌ Failed to add WHOOP token:', error);
        process.exit(1);
      }
      break;
    }
    
    case 'list-users': {
      try {
        const users = await userService.getAllUsers();
        if (users.length === 0) {
          console.log('No users found');
          process.exit(0);
        }
        
        console.log(`\n📋 Found ${users.length} user(s):\n`);
        for (const user of users) {
          console.log(`Email: ${user.email}`);
          console.log(`ID: ${user.id}`);
          console.log(`Created: ${user.createdAt}`);
          
          // Check if user has WHOOP token
          const token = await userService.getWhoopToken(user.id);
          if (token) {
            console.log(`WHOOP Token: ✅ (expires: ${token.expiresAt || 'no expiry'})`);
          } else {
            console.log(`WHOOP Token: ❌ No token`);
          }
          console.log('─'.repeat(50));
        }
      } catch (error) {
        console.error('❌ Failed to list users:', error);
        process.exit(1);
      }
      break;
    }
    
    case 'delete-user': {
      const email = process.argv[3];
      if (!email) {
        console.error('Error: Email is required');
        console.log('Usage: npm run admin:delete-user <email>');
        process.exit(1);
      }
      
      try {
        const user = await userService.getUserByEmail(email);
        if (!user) {
          console.error(`❌ User with email ${email} not found`);
          process.exit(1);
        }
        
        await userService.deleteUser(user.id);
        console.log(`✅ User deleted successfully: ${email}`);
      } catch (error) {
        console.error('❌ Failed to delete user:', error);
        process.exit(1);
      }
      break;
    }
    
    default:
      console.log('FitScore Health Dashboard - Admin CLI\n');
      console.log('Available commands:');
      console.log('  create-user <email>                              - Create a new user');
      console.log('  add-token <email> <access_token> [refresh_token] - Add WHOOP token for user');
      console.log('  list-users                                       - List all users');
      console.log('  delete-user <email>                              - Delete a user');
      console.log('\nExamples:');
      console.log('  npm run admin:create-user user@example.com');
      console.log('  npm run admin:add-token user@example.com abc123token xyz456refresh');
      console.log('  npm run admin:list-users');
      console.log('  npm run admin:delete-user user@example.com');
      process.exit(1);
  }
  
  process.exit(0);
}

main().catch(console.error);