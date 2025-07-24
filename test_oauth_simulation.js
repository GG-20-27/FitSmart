// Test OAuth simulation to validate session persistence
const axios = require('axios');

async function testOAuthSimulation() {
  try {
    console.log('1. Creating test user and token...');
    
    // 1. Create a test user and token
    const tokenResponse = await axios.post('http://localhost:5000/api/whoop/test-token', {
      access_token: 'test_access_token_for_session',
      refresh_token: 'test_refresh_token_for_session',
      expires_in: 3600,
      user_id: '77888999'
    });
    
    console.log('✅ Test token created:', tokenResponse.data);
    
    // 2. Now simulate a successful OAuth callback by manually setting session
    console.log('2. Testing session persistence...');
    
    // The real issue is that we need to test with a valid OAuth flow
    // Let's check current session state
    const authCheck = await axios.get('http://localhost:5000/api/auth/me', {
      validateStatus: () => true // Don't throw on 401
    });
    
    console.log('Current auth status:', authCheck.status, authCheck.data);
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testOAuthSimulation();