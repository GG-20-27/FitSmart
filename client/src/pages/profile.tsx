import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Calendar, Activity, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useState } from 'react';
import SocialAuth from '@/components/social-auth';

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  hasWhoopToken: boolean;
  tokenExpiry: string | null;
}

interface WhoopAuthStatus {
  authenticated: boolean;
  message: string;
  auth_url?: string;
  expires_at?: number;
}

export default function Profile() {
  const [newUserEmail, setNewUserEmail] = useState('');

  const { data: authStatus, isLoading: authLoading } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 30000,
  });

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserProfile[]>({
    queryKey: ['/api/admin/users'],
    retry: 3,
  });

  const createUserMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest('POST', '/api/admin/users', { email });
      return response.json();
    },
    onSuccess: () => {
      setNewUserEmail('');
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
  });

  const addTokenMutation = useMutation({
    mutationFn: async ({ userId, accessToken, refreshToken }: { userId: string, accessToken: string, refreshToken: string }) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/whoop-token`, {
        accessToken,
        refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + 3600 * 24 // 24 hours from now
      });
      return response.json();
    },
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
    },
  });

  const authMutation = useMutation({
    mutationFn: () => {
      const authUrl = window.location.origin + '/api/whoop/login';
      window.open(authUrl, 'whoop-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      return Promise.resolve();
    },
  });

  const currentUser = users?.find(user => user.hasWhoopToken) || users?.[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
            <User className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">User Profile & Management</h1>
            <p className="text-slate-400">Manage user accounts and WHOOP connections</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Social Authentication */}
          <SocialAuth
            onGoogleAuth={() => {
              // Placeholder for Google OAuth implementation
              console.log('Google authentication not yet implemented');
            }}
            onAppleAuth={() => {
              // Placeholder for Apple OAuth implementation  
              console.log('Apple authentication not yet implemented');
            }}
            onWhoopAuth={() => authMutation.mutate()}
            connectedServices={{
              google: false, // Will be implemented later
              apple: false,  // Will be implemented later
              whoop: authStatus?.authenticated || false
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Current User Profile */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <User className="h-5 w-5" />
                Current User Profile
              </CardTitle>
              <CardDescription>Your account information and WHOOP connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentUser ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-slate-300">Email</Label>
                      <div className="text-white font-medium">{currentUser.email}</div>
                    </div>
                    <div>
                      <Label className="text-slate-300">User ID</Label>
                      <div className="text-slate-400 text-sm font-mono">{currentUser.id}</div>
                    </div>
                    <div>
                      <Label className="text-slate-300">Account Created</Label>
                      <div className="text-slate-400 text-sm">
                        {new Date(currentUser.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* WHOOP Connection Status */}
                  <div className="border-t border-slate-700 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-slate-300">WHOOP Connection</Label>
                      <Badge variant={authStatus?.authenticated ? "default" : "secondary"}>
                        {authStatus?.authenticated ? "Connected" : "Not Connected"}
                      </Badge>
                    </div>
                    
                    {authStatus?.authenticated ? (
                      <Alert className="bg-green-600/20 border-green-500/30">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <AlertDescription className="text-green-200">
                          WHOOP account is connected and ready to provide live health data.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert className="bg-yellow-600/20 border-yellow-500/30">
                        <AlertCircle className="h-4 w-4 text-yellow-400" />
                        <AlertDescription className="text-yellow-200">
                          Connect your WHOOP account to access live health metrics.
                        </AlertDescription>
                      </Alert>
                    )}

                    {!authStatus?.authenticated && (
                      <Button 
                        onClick={() => authMutation.mutate()}
                        disabled={authMutation.isPending}
                        className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Connect WHOOP Account
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <User className="h-16 w-16 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400">No user profile found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Management */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Activity className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>Admin functions for managing user accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create New User */}
              <div className="space-y-3">
                <Label className="text-slate-300">Create New User</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <Button
                    onClick={() => createUserMutation.mutate(newUserEmail)}
                    disabled={!newUserEmail || createUserMutation.isPending}
                    size="sm"
                  >
                    {createUserMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              </div>

              {/* Users List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">All Users</Label>
                  <Button
                    onClick={() => refetchUsers()}
                    variant="outline"
                    size="sm"
                    disabled={usersLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {users?.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium truncate">
                            {user.email}
                          </span>
                          {user.hasWhoopToken && (
                            <Badge variant="default" className="text-xs">
                              WHOOP
                            </Badge>
                          )}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        onClick={() => deleteUserMutation.mutate(user.id)}
                        variant="destructive"
                        size="sm"
                        disabled={deleteUserMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  )) || (
                    <div className="text-center py-4 text-slate-400">
                      {usersLoading ? 'Loading users...' : 'No users found'}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and system information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => window.open('/api/health', '_blank')}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center space-y-2 bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-600/50"
              >
                <Activity className="h-6 w-6" />
                <span>API Health Check</span>
              </Button>
              
              <Button
                onClick={() => window.open('/', '_blank')}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center space-y-2 bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-600/50"
              >
                <Calendar className="h-6 w-6" />
                <span>Dashboard</span>
              </Button>
              
              <Button
                onClick={() => window.open('/calendar', '_blank')}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center space-y-2 bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-600/50"
              >
                <Calendar className="h-6 w-6" />
                <span>Calendar View</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}