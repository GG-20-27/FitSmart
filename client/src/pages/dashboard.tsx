import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Zap, Moon, Activity, Clock, ExternalLink, TrendingUp, RefreshCw, RotateCcw, Calendar, Wind, User } from 'lucide-react';
import { HealthIcon } from '@/components/HealthIcon';
import { formatTime } from '@/lib/utils';
import { WhoopTodayResponse } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';

interface WhoopAuthStatus {
  authenticated: boolean;
  message: string;
  auth_url?: string;
  expires_at?: number;
}

interface WhoopSummary {
  avgRecovery: number | null;
  avgStrain: number | null;
  avgSleep: number | null;
  avgHRV: number | null;
}

interface CountUpProps {
  end: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
}

function CountUp({ end, duration = 1000, suffix = "", decimals = 0 }: CountUpProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(end * easeOut);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration]);

  return (
    <span>
      {decimals > 0 ? count.toFixed(decimals) : Math.floor(count)}{suffix}
    </span>
  );
}

function CircularProgress({ value, max = 100, size = 120, strokeWidth = 8, color = "#3b82f6" }: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = (value / max) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out drop-shadow-sm"
          style={{
            filter: `drop-shadow(0 0 8px ${color}40)`
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">
          <CountUp end={value} suffix="%" duration={1200} />
        </span>
      </div>
    </div>
  );
}

function FitScoreLogo({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
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
          <filter id="logoGlow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Background circle with gradient fill matching the page background */}
        <circle 
          cx="50" 
          cy="50" 
          r="48" 
          fill="rgba(30, 41, 59, 0.8)"
          stroke="url(#logoGradient)"
          strokeWidth="1"
          filter="url(#logoGlow)"
        />
        
        {/* Outer ring - dashed circle */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="url(#logoGradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="120 15"
          opacity="0.9"
        />
        
        {/* Heartbeat line */}
        <path
          d="M15 50 L20 50 L25 35 L30 65 L35 20 L40 80 L45 50 L50 40 L55 60 L60 50 L65 45 L70 55 L75 50 L85 50"
          fill="none"
          stroke="url(#logoGradient)"
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
          fill="url(#logoGradient)"
          opacity="1"
        >
          <animate
            attributeName="r"
            values="2.5;4;2.5"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.6;1"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}

export default function Dashboard() {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  const { data: whoopAuthStatus, isLoading: authLoading, error: authError } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 30000, // Check auth status every 30 seconds
  });

  const { data: whoopData, isLoading: whoopLoading, refetch: refetchWhoop, error: whoopError } = useQuery<WhoopTodayResponse>({
    queryKey: ['/api/whoop/today'],
    enabled: whoopAuthStatus?.authenticated === true,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) {
        // Force refresh auth status when 401 error occurs
        queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: whoopAuthStatus?.authenticated ? 5 * 60 * 1000 : false, // Auto-refresh every 5 minutes if authenticated
  });

  // Set last sync when data changes
  useEffect(() => {
    if (whoopData) {
      setLastSync(new Date());
    }
  }, [whoopData]);

  const { data: whoopSummary, isLoading: summaryLoading } = useQuery<WhoopSummary>({
    queryKey: ['/api/whoop/weekly'],
    enabled: whoopAuthStatus?.authenticated === true,
    retry: 3,
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });

  // Reset OAuth connection mutation
  const resetAuthMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/whoop/reset');
      return response.json();
    },
    onSuccess: (data: any) => {
      console.log('WHOOP OAuth reset successful');
      if (data.auth_url) {
        // Open new OAuth window with fresh scopes
        window.open(data.auth_url, '_blank', 'width=600,height=700');
        
        // Refresh auth status after a delay
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
        }, 2000);
      }
    },
    onError: (error) => {
      console.error('Failed to reset WHOOP OAuth:', error);
    }
  });

  const isWhoopConnected = whoopAuthStatus?.authenticated;
  const isLoading = whoopLoading || authLoading;
  const hasError = whoopError || authError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 lg:mb-12 space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex-shrink-0">
              <FitScoreLogo size={40} className="sm:w-12 sm:h-12" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">FitScore Health Dashboard</h1>
              <p className="text-slate-400 text-xs sm:text-sm lg:text-base hidden sm:block">Real-time WHOOP health analytics</p>
              <p className="text-slate-400 text-xs sm:hidden">WHOOP Analytics</p>
            </div>
          </div>
          
          <div className="flex flex-row items-center justify-center lg:justify-end space-x-2 sm:space-x-3">
            {/* Navigation Buttons */}
            <Link href="/calendar">
              <Button
                variant="outline"
                size="sm"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-30 animate-pulse"></div>
                <div className="relative flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Calendar</span>
                </div>
              </Button>
            </Link>
            
            <Link href="/profile">
              <Button
                variant="outline"
                size="sm"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-indigo-500 opacity-30 animate-pulse"></div>
                <div className="relative flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Profile</span>
                </div>
              </Button>
            </Link>
            
            {isWhoopConnected && (
              <Button
                onClick={() => window.open('/api/whoop/login', '_blank')}
                variant="outline"
                size="sm"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:from-cyan-500 hover:to-blue-600"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-300 to-blue-400 opacity-30 animate-pulse"></div>
                <div className="relative flex items-center space-x-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <RefreshCw className="h-4 w-4" />
                  <span className="text-xs sm:text-sm font-medium hidden lg:inline">Reconnect WHOOP</span>
                  <span className="text-xs sm:text-sm font-medium lg:hidden">Reconnect</span>
                </div>
              </Button>
            )}
          </div>
        </div>

        {/* Today's Health Metrics */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">Today's Health Metrics</h2>
          <p className="text-slate-400 text-sm sm:text-base lg:text-lg">Live data from your WHOOP device</p>
          {lastSync && (
            <div className="flex items-center justify-center mt-3 sm:mt-4 text-xs sm:text-sm text-slate-500">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              <span>Last sync: {formatTime(lastSync)}</span>
            </div>
          )}
        </div>

        {/* Authentication Status */}
        {!isWhoopConnected && !authLoading && (
          <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="flex justify-center mb-4">
                  <FitScoreLogo size={64} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Connect Your WHOOP</h3>
                <p className="text-slate-400 mb-4">
                  Connect your WHOOP account to view real-time health metrics and analytics.
                </p>
                <Button 
                  onClick={() => window.open(whoopAuthStatus?.auth_url || '/api/whoop/login', '_blank')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Connecting...</span>
                    </div>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect WHOOP
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connection Controls - Show when connected */}
        {isWhoopConnected && (
          <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-slate-300 font-medium text-sm">WHOOP Connected</span>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => resetAuthMutation.mutate()}
                      disabled={resetAuthMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="bg-transparent border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all duration-200"
                    >
                      {resetAuthMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset Auth
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => refetchWhoop()}
                      disabled={whoopLoading}
                      variant="outline"
                      size="sm"
                      className="bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white transition-all duration-200"
                    >
                      {whoopLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Metrics Cards */}
        {isWhoopConnected && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12 lg:mb-16">
          {/* Recovery Card */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-4 sm:p-6 text-center">
              <div className="mb-3 sm:mb-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <Heart className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  {whoopData?.recovery_score !== null && whoopData?.recovery_score !== undefined ? (
                    <><CountUp end={whoopData.recovery_score} duration={1200} />%</>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Heart className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                <span className="text-slate-300 font-medium text-sm sm:text-base">Recovery</span>
              </div>
            </CardContent>
          </Card>

          {/* Strain Card */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <div className="text-2xl font-bold text-orange-400">
                  {whoopData?.strain !== null && whoopData?.strain !== undefined ? (
                    <CountUp end={whoopData.strain} decimals={1} duration={1200} />
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Zap className="h-5 w-5 text-orange-400" />
                <span className="text-slate-300 font-medium">Strain</span>
              </div>
            </CardContent>
          </Card>

          {/* Sleep Card */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Moon className="h-8 w-8 text-white" />
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {whoopData?.raw?.sleep?.score?.sleep_performance_percentage !== null && whoopData?.raw?.sleep?.score?.sleep_performance_percentage !== undefined ? (
                    <><CountUp end={whoopData.raw.sleep.score.sleep_performance_percentage} duration={1200} />%</>
                  ) : (
                    <span className="text-sm text-slate-500">Sleep data still syncing from WHOOP</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Moon className="h-5 w-5 text-purple-400" />
                <span className="text-slate-300 font-medium">Sleep Score</span>
              </div>
            </CardContent>
          </Card>

          {/* HRV Card */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Activity className="h-8 w-8 text-white" />
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {whoopData?.hrv !== null && whoopData?.hrv !== undefined ? (
                    <CountUp end={whoopData.hrv} suffix=" ms" decimals={1} duration={1200} />
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Activity className="h-5 w-5 text-green-400" />
                <span className="text-slate-300 font-medium">HRV</span>
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Additional Health Insights */}
        {isWhoopConnected && whoopData && (
          <div className="mt-16">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center">
                <TrendingUp className="h-8 w-8 mr-3 text-cyan-400" />
                Other Insights from Today
              </h2>
              <p className="text-slate-400">Detailed physiological metrics and sleep analytics</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Sleep Hours */}
              {whoopData.sleep_hours && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                        <Moon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Sleep Duration</p>
                        <p className="text-2xl font-bold text-purple-400">
                          <CountUp end={whoopData.sleep_hours} decimals={1} duration={1000} /> hrs
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Total time spent sleeping
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Resting Heart Rate */}
              {whoopData.resting_heart_rate && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                        <Heart className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Resting Heart Rate</p>
                        <p className="text-2xl font-bold text-red-400">
                          <CountUp end={whoopData.resting_heart_rate} duration={1000} /> bpm
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Your heart rate during rest periods
                    </div>
                  </CardContent>
                </Card>
              )}



              {/* Sleep Efficiency */}
              {whoopData.raw?.sleep?.score?.sleep_efficiency_percentage && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center">
                        <Activity className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Sleep Efficiency</p>
                        <p className="text-2xl font-bold text-teal-400">
                          <CountUp end={whoopData.raw.sleep.score.sleep_efficiency_percentage} decimals={1} duration={1000} />%
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Time asleep vs. time in bed
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Respiratory Rate */}
              {whoopData.raw?.sleep?.score?.respiratory_rate && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center">
                        <Wind className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Respiratory Rate</p>
                        <p className="text-2xl font-bold text-cyan-400">
                          <CountUp end={whoopData.raw.sleep.score.respiratory_rate} decimals={1} duration={1000} /> bpm
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Breaths per minute during sleep
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sleep Consistency */}
              {whoopData.raw?.sleep?.score?.sleep_consistency_percentage && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-violet-500 rounded-full flex items-center justify-center">
                        <Clock className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Sleep Consistency</p>
                        <p className="text-2xl font-bold text-violet-400">
                          <CountUp end={whoopData.raw.sleep.score.sleep_consistency_percentage} duration={1000} />%
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Consistency of sleep schedule
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sleep Cycles */}
              {whoopData.raw?.sleep?.score?.stage_summary?.sleep_cycle_count && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center">
                        <RotateCcw className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Sleep Cycles</p>
                        <p className="text-2xl font-bold text-amber-400">
                          <CountUp end={whoopData.raw.sleep.score.stage_summary.sleep_cycle_count} duration={1000} />
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Complete sleep cycles completed
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Today's Strain */}
              {whoopData.strain && (
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Zap className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Today's Strain</p>
                        <p className="text-2xl font-bold text-emerald-400">
                          <CountUp end={whoopData.strain} decimals={1} duration={1000} />
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Overall activity strain today
                    </div>
                  </CardContent>
                </Card>
              )}


            </div>

            {/* Sleep Stages Breakdown */}
            {whoopData.raw?.sleep?.score?.stage_summary && (
              <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                      <Moon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Sleep Stages Breakdown</h3>
                      <p className="text-slate-400 text-sm">Time spent in each sleep stage</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Light Sleep */}
                    <div className="text-center p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-blue-400 mb-2">
                        <CountUp 
                          end={Math.round(whoopData.raw.sleep.score.stage_summary.total_light_sleep_time_milli / (1000 * 60))} 
                          duration={1000} 
                        /> min
                      </div>
                      <p className="text-slate-300 text-sm font-medium">Light Sleep</p>
                      <p className="text-xs text-slate-500">Easy to wake from</p>
                    </div>

                    {/* Deep Sleep */}
                    <div className="text-center p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-purple-400 mb-2">
                        <CountUp 
                          end={Math.round(whoopData.raw.sleep.score.stage_summary.total_slow_wave_sleep_time_milli / (1000 * 60))} 
                          duration={1000} 
                        /> min
                      </div>
                      <p className="text-slate-300 text-sm font-medium">Deep Sleep</p>
                      <p className="text-xs text-slate-500">Physical recovery</p>
                    </div>

                    {/* REM Sleep */}
                    <div className="text-center p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-green-400 mb-2">
                        <CountUp 
                          end={Math.round(whoopData.raw.sleep.score.stage_summary.total_rem_sleep_time_milli / (1000 * 60))} 
                          duration={1000} 
                        /> min
                      </div>
                      <p className="text-slate-300 text-sm font-medium">REM Sleep</p>
                      <p className="text-xs text-slate-500">Mental recovery</p>
                    </div>

                    {/* Awake Time */}
                    <div className="text-center p-4 bg-slate-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-orange-400 mb-2">
                        <CountUp 
                          end={Math.round(whoopData.raw.sleep.score.stage_summary.total_awake_time_milli / (1000 * 60))} 
                          duration={1000} 
                        /> min
                      </div>
                      <p className="text-slate-300 text-sm font-medium">Awake</p>
                      <p className="text-xs text-slate-500">Time spent awake</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Weekly Averages */}
        {isWhoopConnected && (
          <div className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center">
              <TrendingUp className="h-8 w-8 mr-3 text-blue-400" />
              Weekly Averages
            </h2>
            <p className="text-slate-400">Averages based on real WHOOP data</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Avg Recovery */}
            <Card className="bg-gradient-to-br from-blue-400 to-blue-500 border-0 text-white hover:from-blue-300 hover:to-blue-400 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Heart className="h-4 w-4 text-white" />
                  <span className="text-sm font-medium text-white">Avg Recovery</span>
                </div>
                <div className="text-3xl font-bold">
                  {whoopSummary?.avgRecovery !== null && whoopSummary?.avgRecovery !== undefined ? (
                    <CountUp end={whoopSummary.avgRecovery} suffix="%" duration={1500} />
                  ) : (
                    "N/A"
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Avg Strain */}
            <Card className="bg-gradient-to-br from-orange-400 to-orange-500 border-0 text-white hover:from-orange-300 hover:to-orange-400 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Zap className="h-4 w-4 text-white" />
                  <span className="text-sm font-medium text-white">Avg Strain</span>
                </div>
                <div className="text-3xl font-bold">
                  {whoopSummary?.avgStrain !== null && whoopSummary?.avgStrain !== undefined ? (
                    <CountUp end={whoopSummary.avgStrain} decimals={1} duration={1500} />
                  ) : (
                    "N/A"
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Avg Sleep Score */}
            <Card className="bg-gradient-to-br from-purple-400 to-purple-500 border-0 text-white hover:from-purple-300 hover:to-purple-400 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Moon className="h-4 w-4 text-white" />
                  <span className="text-sm font-medium text-white">Avg Sleep Score</span>
                </div>
                <div className="text-3xl font-bold">
                  {whoopSummary?.avgSleep !== null && whoopSummary?.avgSleep !== undefined ? (
                    <CountUp end={whoopSummary.avgSleep} suffix="%" duration={1500} />
                  ) : (
                    "N/A"
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Avg HRV */}
            <Card className="bg-gradient-to-br from-green-400 to-green-500 border-0 text-white hover:from-green-300 hover:to-green-400 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Activity className="h-4 w-4 text-white" />
                  <span className="text-sm font-medium text-white">Avg HRV</span>
                </div>
                <div className="text-3xl font-bold">
                  {whoopSummary?.avgHRV !== null && whoopSummary?.avgHRV !== undefined ? (
                    <CountUp end={whoopSummary.avgHRV} suffix=" ms" decimals={1} duration={1500} />
                  ) : (
                    "N/A"
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="text-center mt-6">
            <p className="text-sm text-slate-500">
              Averages calculated from the past 7 days of real WHOOP data
            </p>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}