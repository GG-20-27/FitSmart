import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Zap, Moon, Activity, Clock, ExternalLink, TrendingUp, RefreshCw, RotateCcw, Calendar } from 'lucide-react';
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
        viewBox="0 0 48 48" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <circle 
          cx="24" 
          cy="24" 
          r="22" 
          fill="url(#bgGradient)" 
          filter="url(#glow)"
          className="animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        
        <path 
          d="M24 32c-6-4-10-8-10-13 0-4 4-7 8-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 8 3 8 7 0 5-4 9-10 13z" 
          fill="white" 
          stroke="white"
          strokeWidth="0.5"
        />
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
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
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
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-12 space-y-6 lg:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0 p-1">
              <FitScoreLogo size={48} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-bold text-white">FitScore Health Dashboard</h1>
              <p className="text-slate-400 text-sm lg:text-base">Real-time WHOOP health analytics</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center lg:justify-end space-x-3">
            {/* Calendar Button */}
            <Link href="/calendar">
              <Button
                variant="outline"
                size="sm"
                className="relative overflow-hidden border-transparent bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-30 animate-pulse"></div>
                <div className="relative flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium hidden sm:inline">Calendar</span>
                  <span className="text-sm font-medium sm:hidden">Calendar</span>
                </div>
              </Button>
            </Link>
            
            {isWhoopConnected ? (
              <>
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-600/20 border border-green-500/30 rounded-full">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-green-400 text-sm font-medium">Connected</span>
                </div>
                <Button
                  onClick={() => window.open('/api/whoop/login', '_blank')}
                  variant="outline"
                  size="sm"
                  className="relative overflow-hidden border-transparent bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 opacity-30 animate-pulse"></div>
                  <div className="relative flex items-center space-x-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <RefreshCw className="h-4 w-4" />
                    <span className="text-sm font-medium hidden sm:inline">Reconnect WHOOP</span>
                    <span className="text-sm font-medium sm:hidden">Reconnect</span>
                  </div>
                </Button>
              </>
            ) : (
              <div className="flex items-center space-x-2 px-3 py-1 bg-red-600/20 border border-red-500/30 rounded-full">
                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                <span className="text-red-400 text-sm font-medium">Disconnected</span>
              </div>
            )}
          </div>
        </div>

        {/* Today's Health Metrics */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-2">Today's Health Metrics</h2>
          <p className="text-slate-400 text-lg">Live data from your WHOOP device</p>
          {lastSync && (
            <div className="flex items-center justify-center mt-4 text-sm text-slate-500">
              <Clock className="h-4 w-4 mr-2" />
              <span>Last sync: {formatTime(lastSync)}</span>
            </div>
          )}
        </div>

        {/* Authentication Status */}
        {!isWhoopConnected && !authLoading && (
          <div className="max-w-2xl mx-auto mb-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
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
          <div className="max-w-2xl mx-auto mb-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-slate-300 font-medium">WHOOP Connected</span>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => resetAuthMutation.mutate()}
                      disabled={resetAuthMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
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
                      className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Recovery Card */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Heart className="h-8 w-8 text-white" />
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
                <Heart className="h-5 w-5 text-blue-400" />
                <span className="text-slate-300 font-medium">Recovery</span>
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
                  {whoopData?.sleep_hours !== null && whoopData?.sleep_hours !== undefined ? (
                    <><CountUp end={whoopData.sleep_hours} duration={1200} decimals={1} /> hrs</>
                  ) : (
                    <span className="text-sm text-slate-500">Sleep data still syncing from WHOOP</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Moon className="h-5 w-5 text-purple-400" />
                <span className="text-slate-300 font-medium">Sleep (hrs)</span>
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

            {/* Avg Sleep */}
            <Card className="bg-gradient-to-br from-purple-400 to-purple-500 border-0 text-white hover:from-purple-300 hover:to-purple-400 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Moon className="h-4 w-4 text-white" />
                  <span className="text-sm font-medium text-white">Avg Sleep</span>
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