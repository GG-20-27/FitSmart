import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Calendar, Activity, CheckCircle, AlertCircle, ExternalLink, Crown, Copy, Key, ChevronLeft, Shield, Info } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import SocialAuth from '@/components/social-auth';
import { CalendarManagement } from '@/components/calendar-management';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'wouter';

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
  displayName?: string;
  role?: string;
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
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: userProfile } = useQuery({
    queryKey: ['/api/users/me'],
    enabled: !!user,
  });

  const { data: authStatus, isLoading: authLoading } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 30000,
  });

  // Fetch static JWT token for Custom GPT integration
  const { data: staticJwtData } = useQuery({
    queryKey: ['/api/auth/static-jwt'],
    enabled: !!user,
    retry: 3,
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
              <User className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">User Profile & Management</h1>
              <p className="text-slate-400 text-sm sm:text-base">Manage user accounts and WHOOP connections</p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent border-2 border-[#00D4FF] text-[#00D4FF] hover:bg-gradient-to-r hover:from-[#00D4FF] hover:to-[#0099FF] hover:text-white hover:border-transparent transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]"
            >
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
                  Bearer Token for Your FitScore AI Assistant
                </CardTitle>
                <CardDescription>This token makes your FitScore AI personalized only to you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="text-sm text-slate-400 space-y-1 mb-3">
                    <p>Simply copy it and send it to the Admin. You only need to do this once.</p>
                  </div>
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
                  <div className="text-sm text-slate-400 mt-3">
                    <p>Only share this token with the Admin — it's your secure key to connect your data.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calendar Management */}
          <CalendarManagement />

          {/* Legal Section */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                Legal
              </CardTitle>
              <CardDescription>Privacy and legal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                <Link href="/privacy">
                  <div className="group flex items-start gap-3 p-4 rounded-lg bg-slate-700/30 border border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 cursor-pointer">
                    <Shield className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors duration-200">
                        Privacy Policy
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Last updated: Aug 27, 2025
                      </div>
                    </div>
                  </div>
                </Link>
                <Link href="/disclaimer">
                  <div className="group flex items-start gap-3 p-4 rounded-lg bg-slate-700/30 border border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 cursor-pointer">
                    <Info className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors duration-200">
                        Disclaimer
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Important usage notice
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>


      </div>
    </div>
  );
}