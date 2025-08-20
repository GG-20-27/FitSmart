import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Calendar, Activity, RefreshCw, CheckCircle, AlertCircle, ExternalLink, Crown, Copy, Key, ChevronLeft } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { fetchJSON } from '@/lib/fetchJSON';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import SocialAuth from '@/components/social-auth';
import { CalendarManagement } from '@/components/calendar-management';
import { useAuth } from '@/hooks/useAuth';
import { Link, useLocation } from 'wouter';

function FitScoreLogo({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="30%" stopColor="#3B82F6" />
            <stop offset="70%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
        
        {/* Background circle */}
        <circle 
          cx="50" 
          cy="50" 
          r="48" 
          fill="rgba(30, 41, 59, 0.8)"
          stroke="url(#logoGradient)"
          strokeWidth="1"
        />
        
        {/* Heartbeat line */}
        <path
          d="M15 50 L20 50 L25 35 L30 65 L35 20 L40 80 L45 50 L50 40 L55 60 L60 50 L65 45 L70 55 L75 50 L85 50"
          fill="none"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        
        {/* Center pulse dot */}
        <circle
          cx="50"
          cy="50"
          r="2.5"
          fill="white"
          opacity="1"
        />
      </svg>
    </div>
  );
}

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: userProfile } = useQuery({
    queryKey: ['/api/users/me'],
    enabled: !!user,
    queryFn: async () => {
      try {
        return await fetchJSON('/api/users/me');
      } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
          toast({
            title: "Authentication required",
            description: "Please log in with WHOOP to view profile",
            variant: "destructive",
          });
          setLocation('/api/whoop/login');
          throw error;
        }
        throw error;
      }
    },
  });

  const { data: authStatus, isLoading: authLoading } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 30000,
  });

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserProfile[]>({
    queryKey: ['/api/admin/users'],
    retry: 3,
  });

  // Fetch static JWT token for Custom GPT integration
  const { data: staticJwtData } = useQuery({
    queryKey: ['/api/auth/static-jwt'],
    enabled: !!user,
    retry: 3,
    queryFn: async () => {
      try {
        return await fetchJSON('/api/auth/static-jwt');
      } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
          toast({
            title: "Authentication required",
            description: "Please log in with WHOOP to access token",
            variant: "destructive",
          });
          setLocation('/api/whoop/login');
          throw error;
        }
        throw error;
      }
    },
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
  const isAdminUser = currentUser?.email === 'admin@fitscore.local';

  // Copy JWT token to clipboard
  const copyJwtToken = () => {
    if (staticJwtData?.static_jwt) {
      navigator.clipboard.writeText(staticJwtData.static_jwt);
      toast({
        title: "Token Copied",
        description: "JWT Bearer token copied to clipboard",
        variant: "default",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
              <User className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">User Profile & Management</h1>
              <p className="text-slate-400">Manage user accounts and WHOOP connections</p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="bg-red-600/20 hover:bg-red-600/30 text-red-300 hover:text-white transition-all duration-200 border border-red-500/30">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Social Authentication */}
          <SocialAuth
            onWhoopAuth={() => authMutation.mutate()}
            connectedServices={{
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
              {userProfile ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-slate-300">WHOOP ID</Label>
                      <div className="text-white font-medium font-mono">{userProfile.whoopId || 'Not available'}</div>
                    </div>
                    <div>
                      <Label className="text-slate-300">Role</Label>
                      <div className="flex items-center space-x-2">
                        {userProfile.role === 'admin' ? (
                          <Badge className="bg-gradient-to-r from-orange-500 to-red-600 text-white">
                            <Crown className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">User</Badge>
                        )}
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

          {/* Custom GPT Bearer Token */}
          {staticJwtData?.static_jwt && (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Key className="h-5 w-5" />
                  Bearer Token for Custom GPT
                </CardTitle>
                <CardDescription>Your personal JWT token for ChatGPT integration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-slate-300">JWT Bearer Token</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 bg-slate-700/50 border border-slate-600 rounded-md p-3 font-mono text-xs text-slate-300 break-all overflow-hidden">
                      {staticJwtData.static_jwt}
                    </div>
                    <Button
                      onClick={copyJwtToken}
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                  <div className="text-sm text-slate-400 space-y-1">
                    <p>• Send this to Gustavs if he hasn't added this to your personal ChatGPT assistant.</p>
                    <p>• This token expires in 10 years and provides secure API access.</p>
                    <p>• Keep this token private - it grants access to your health data.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Management - Only show for admin users */}
          {isAdminUser && (
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
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white flex-1"
                    />
                    <Button
                      onClick={() => createUserMutation.mutate(newUserEmail)}
                      disabled={!newUserEmail || createUserMutation.isPending}
                      size="sm"
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white border-0 transition-all duration-200"
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
                      className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                    >
                      <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {users?.map((user) => (
                      <div
                        key={user.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600 space-y-2 sm:space-y-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                          className="w-full sm:w-auto bg-red-600/20 border-red-600/50 text-red-400 hover:bg-red-600/30 hover:text-red-300 transition-all duration-200"
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
          )}
          
          {/* Calendar Management */}
          <CalendarManagement />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={() => window.open('/', '_blank')}
                variant="outline"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 h-auto p-6 flex flex-col items-center space-y-3 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-pink-400 to-rose-500 opacity-30 animate-pulse"></div>
                <div className="relative flex flex-col items-center space-y-3">
                  <FitScoreLogo size={32} />
                  <span className="font-medium">Dashboard</span>
                </div>
              </Button>
              
              <Button
                onClick={() => window.open('/calendar', '_blank')}
                variant="outline"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 h-auto p-6 flex flex-col items-center space-y-3 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 opacity-30 animate-pulse"></div>
                <div className="relative flex flex-col items-center space-y-3">
                  <Calendar className="h-8 w-8" />
                  <span className="font-medium">Calendar View</span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}