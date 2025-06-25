import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Zap, Moon, Activity, Clock, ExternalLink, TrendingUp } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { WhoopTodayResponse } from '@shared/schema';

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
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 64 48" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="heartGlow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <path 
          d="M32 36c-9-6-15-12-15-20 0-6 6-10 12-10 3 0 6 1 7 4 1-3 4-4 7-4 6 0 12 4 12 10 0 8-6 14-15 20z" 
          fill="url(#heartGradient)" 
          filter="url(#heartGlow)"
          className="animate-pulse"
          style={{ animationDuration: '4s' }}
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
    retry: 3,
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

  const isWhoopConnected = whoopAuthStatus?.authenticated;
  const isLoading = whoopLoading || authLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0 p-1">
              <FitScoreLogo size={48} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">FitScore Health Dashboard</h1>
              <p className="text-slate-400">Real-time WHOOP health analytics</p>
            </div>
          </div>
          
          <div className="flex items-center">
            {isWhoopConnected && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-600/20 border border-green-500/30 rounded-full">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400 text-sm font-medium">Connected</span>
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

        {/* Main Metrics Cards */}
        {isWhoopConnected && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Recovery Card with Circular Progress */}
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                {whoopData?.recovery_score !== null && whoopData?.recovery_score !== undefined ? (
                  <CircularProgress 
                    value={whoopData.recovery_score} 
                    color="#3B82F6"
                    size={100}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center mx-auto">
                    <span className="text-slate-500">N/A</span>
                  </div>
                )}
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
                  {whoopData?.sleep_score !== null && whoopData?.sleep_score !== undefined ? (
                    <><CountUp end={whoopData.sleep_score} duration={1200} />%</>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
                {(whoopData?.sleep_score === null || whoopData?.sleep_score === undefined) && (
                  <div className="text-xs text-slate-500 mt-1 max-w-24 text-center leading-tight">
                    No sleep data yet (WHOOP processes after wake)
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Moon className="h-5 w-5 text-purple-400" />
                <span className="text-slate-300 font-medium">Sleep</span>
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