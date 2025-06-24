import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Heart, 
  Moon, 
  Zap,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  Clock
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { formatTime } from "@/lib/utils";
import type { WhoopTodayResponse } from "@shared/schema";

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
    const startValue = 0;
    const endValue = end;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = startValue + (endValue - startValue) * easeOutQuart;
      
      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span>{count.toFixed(decimals)}{suffix}</span>;
}

function CircularProgress({ value, max = 100, size = 120, strokeWidth = 8, color = "#3b82f6" }: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = (circumference * value) / max;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${color}40)`
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">
          <CountUp end={value} suffix="%" duration={1500} />
        </span>
      </div>
    </div>
  );
}

// FitScore logo with glowing effect
function FitScoreLogo({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img 
        src="/logo.svg" 
        alt="FitScore logo" 
        className="logo"
      />
      <span className="ml-3 text-3xl font-bold text-white">FitScore</span>
    </div>
  );
}

export default function Dashboard() {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  const { data: whoopData, isLoading: whoopLoading, refetch: refetchWhoop, error: whoopError } = useQuery<WhoopTodayResponse>({
    queryKey: ['/api/whoop/today'],
    retry: false,
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  // Set last sync when data changes
  useEffect(() => {
    if (whoopData) {
      setLastSync(new Date());
    }
  }, [whoopData]);

  const { data: whoopAuthStatus, isLoading: authLoading, error: authError } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 30000, // Check auth status every 30 seconds
  });

  const { data: whoopSummary, isLoading: summaryLoading, error: summaryError } = useQuery<WhoopSummary>({
    queryKey: ['/api/whoop/weekly'],
    enabled: whoopAuthStatus?.authenticated === true,
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    retry: 3,
  });

  const isWhoopConnected = whoopAuthStatus?.authenticated;

  const connectWhoopMutation = useMutation({
    mutationFn: () => {
      const authUrl = window.location.origin + '/api/whoop/login';
      const popup = window.open(authUrl, 'whoop-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      
      return new Promise<void>((resolve) => {
        const pollInterval = setInterval(() => {
          if (popup?.closed) {
            clearInterval(pollInterval);
            queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
            queryClient.invalidateQueries({ queryKey: ['/api/whoop/today'] });
            queryClient.invalidateQueries({ queryKey: ['/api/whoop/weekly'] });
            resolve();
          }
        }, 1000);
      });
    },
  });

  const handleRetry = () => {
    refetchWhoop();
  };

  const handleConnect = () => {
    connectWhoopMutation.mutate();
  };

  const isError = whoopError || authError;
  const isLoading = whoopLoading || authLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <FitScoreLogo className="mb-6" />
          <p className="text-slate-400 text-lg">Health Analytics Dashboard</p>
          
          {/* Sync Status */}
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
                <AlertCircle className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Connect Your WHOOP Device</h3>
                <p className="text-slate-400 mb-6">
                  Connect your WHOOP account to view your health metrics and weekly averages
                </p>
                <Button 
                  onClick={handleConnect}
                  disabled={connectWhoopMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
                >
                  {connectWhoopMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
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

        {/* Today's Metrics */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center">
              <Activity className="h-8 w-8 mr-3 text-blue-400" />
              Today's Metrics
            </h2>
            <p className="text-slate-400">Live data from your WHOOP device</p>
          </div>

          {whoopLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-slate-800/50 border-slate-700 backdrop-blur-sm animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-4 bg-slate-700 rounded w-20"></div>
                      <div className="h-8 bg-slate-700 rounded w-16"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : whoopData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Recovery Score with Circular Progress */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-md hover:from-slate-700/80 hover:to-slate-800/80 transition-all duration-300 transform hover:scale-105 animate-fade-in shadow-xl">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center justify-center space-x-2 mb-1">
                      <Heart className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-slate-300">Recovery</span>
                    </div>
                    <div className="relative">
                      {whoopData.recovery_score ? (
                        <CircularProgress 
                          value={whoopData.recovery_score} 
                          color="#3b82f6"
                          size={100}
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center">
                          <span className="text-slate-500">N/A</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Strain - Orange Theme */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-md hover:from-slate-700/80 hover:to-slate-800/80 transition-all duration-300 transform hover:scale-105 animate-fade-in shadow-xl" style={{ animationDelay: '0.1s' }}>
                <CardContent className="p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-lg">
                      <Zap className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Zap className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-medium text-slate-300">Strain</span>
                      </div>
                      <div className="text-2xl font-bold text-orange-400">
                        {whoopData.strain ? (
                          <CountUp end={whoopData.strain} decimals={1} duration={1200} />
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sleep - Purple Theme */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-md hover:from-slate-700/80 hover:to-slate-800/80 transition-all duration-300 transform hover:scale-105 animate-fade-in shadow-xl" style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                      <Moon className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Moon className="h-4 w-4 text-purple-400" />
                        <span className="text-sm font-medium text-slate-300">Sleep</span>
                      </div>
                      <div className="text-2xl font-bold text-purple-400">
                        {whoopData.sleep_score ? (
                          <><CountUp end={whoopData.sleep_score} duration={1200} />%</>
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </div>
                      {!whoopData?.sleep_score && (
                        <div className="text-xs text-slate-500 mt-1 max-w-24 text-center leading-tight">
                          No sleep data yet (WHOOP processes after wake)
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* HRV - Green Theme */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-md hover:from-slate-700/80 hover:to-slate-800/80 transition-all duration-300 transform hover:scale-105 animate-fade-in shadow-xl" style={{ animationDelay: '0.3s' }}>
                <CardContent className="p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                      <Activity className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Activity className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-slate-300">HRV</span>
                      </div>
                      <div className="text-2xl font-bold text-green-400">
                        {whoopData?.hrv ? (
                          <CountUp end={whoopData.hrv} suffix=" ms" decimals={1} duration={1200} />
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : isError ? (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Unable to load WHOOP data</h3>
                <p className="text-slate-400 mb-4">
                  There was an issue connecting to your WHOOP device. Please check your connection and try again.
                </p>
                <Button onClick={handleRetry} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Weekly Averages */}
        <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center">
              <TrendingUp className="h-8 w-8 mr-3 text-blue-400" />
              Weekly Averages
            </h2>
            <p className="text-slate-400">Averages based on real WHOOP data</p>
          </div>

          {summaryLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-slate-800/50 border-slate-700 backdrop-blur-sm animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-4 bg-slate-700 rounded w-20"></div>
                      <div className="h-8 bg-slate-700 rounded w-16"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Avg Recovery - Navy */}
              <Card 
                className="gradient-recovery border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(30, 58, 138, 0.3)'
                }}
              >
                <CardContent className="p-6 relative">
                  <div className="flex items-center space-x-3 mb-3">
                    <Heart className="h-5 w-5 text-white drop-shadow-sm" />
                    <span className="text-sm font-medium text-white/95 drop-shadow-sm">Avg Recovery</span>
                  </div>
                  <div className="text-3xl font-bold text-white drop-shadow-md">
                    {whoopSummary?.avgRecovery !== null && whoopSummary?.avgRecovery !== undefined ? (
                      <CountUp end={whoopSummary.avgRecovery} suffix="%" duration={1500} />
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Avg Strain - Crimson */}
              <Card 
                className="gradient-strain border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(185, 28, 28, 0.3)',
                  animationDelay: '0.1s'
                }}
              >
                <CardContent className="p-6 relative">
                  <div className="flex items-center space-x-3 mb-3">
                    <Zap className="h-5 w-5 text-white drop-shadow-sm" />
                    <span className="text-sm font-medium text-white/95 drop-shadow-sm">Avg Strain</span>
                  </div>
                  <div className="text-3xl font-bold text-white drop-shadow-md">
                    {whoopSummary?.avgStrain !== null && whoopSummary?.avgStrain !== undefined ? (
                      <CountUp end={whoopSummary.avgStrain} decimals={1} duration={1500} />
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Avg Sleep - Purple */}
              <Card 
                className="gradient-sleep border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(124, 58, 237, 0.3)',
                  animationDelay: '0.2s'
                }}
              >
                <CardContent className="p-6 relative">
                  <div className="flex items-center space-x-3 mb-3">
                    <Moon className="h-5 w-5 text-white drop-shadow-sm" />
                    <span className="text-sm font-medium text-white/95 drop-shadow-sm">Avg Sleep</span>
                  </div>
                  <div className="text-3xl font-bold text-white drop-shadow-md">
                    {whoopSummary?.avgSleep !== null && whoopSummary?.avgSleep !== undefined ? (
                      <CountUp end={whoopSummary.avgSleep} suffix="%" duration={1500} />
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Avg HRV - Green */}
              <Card 
                className="gradient-hrv border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(34, 197, 94, 0.3)',
                  animationDelay: '0.3s'
                }}
              >
                <CardContent className="p-6 relative">
                  <div className="flex items-center space-x-3 mb-3">
                    <Activity className="h-5 w-5 text-white drop-shadow-sm" />
                    <span className="text-sm font-medium text-white/95 drop-shadow-sm">Avg HRV</span>
                  </div>
                  <div className="text-3xl font-bold text-white drop-shadow-md">
                    {whoopSummary?.avgHRV !== null && whoopSummary?.avgHRV !== undefined ? (
                      <CountUp end={whoopSummary.avgHRV} suffix=" ms" decimals={1} duration={1500} />
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <div className="text-center mt-6">
            <p className="text-sm text-slate-500">
              Averages calculated from the past 7 days of real WHOOP data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}