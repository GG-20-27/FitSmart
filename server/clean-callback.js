// Clean OAuth callback implementation following exact checklist
app.get('/api/whoop/callback', async (req, res, next) => {
  try {
    console.log('[WHOOP AUTH] OAuth callback received');
    const { code, error, state } = req.query;
    
    if (error) {
      console.error('[WHOOP AUTH] OAuth error:', error);
      return res.status(400).json({ error: 'OAuth authentication failed', details: error });
    }

    if (!code) {
      console.error('[WHOOP AUTH] No authorization code received');
      return res.status(400).json({ error: 'No authorization code received' });
    }

    if (!state || !state.toString().startsWith('whoop_auth_')) {
      console.error('[WHOOP AUTH] Invalid state parameter:', state);
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    console.log('[WHOOP AUTH] Exchanging code for token...');
    const tokenResponse = await whoopApiService.exchangeCodeForToken(code as string);
    
    console.log('[WHOOP AUTH] Getting user profile...');
    const userProfile = await whoopApiService.getUserProfile(tokenResponse.access_token);
    const whoopUserId = `whoop_${userProfile.user_id}`;
    
    console.log(`[WHOOP AUTH] User authenticated: ${whoopUserId}`);

    // Store token
    await whoopTokenStorage.setToken(whoopUserId, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
      user_id: whoopUserId
    });
    
    // Store user
    await userService.createUser(`${whoopUserId}@fitscore.local`, whoopUserId);
    
    // 3. OAuth callback with session regeneration as specified
    req.session.regenerate((err) => {
      if (err) {
        console.error('[WHOOP AUTH] Session regeneration error:', err);
        return next(err);
      }
      
      // Set userId in regenerated session
      (req.session as any).userId = whoopUserId;
      
      // Save session and redirect
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[WHOOP AUTH] Session save error:', saveErr);
          return res.status(500).send('Authentication failed - session save error');
        }
        
        console.log(`[WHOOP AUTH] Session regenerated and saved: ${req.sessionID}, User: ${whoopUserId}`);
        
        // Redirect to dashboard 
        res.redirect('/');
      });
    });
    
  } catch (error) {
    console.error('[WHOOP AUTH] Callback error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});