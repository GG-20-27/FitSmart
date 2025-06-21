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
    let animationFrame: number;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(end * easeOutQuart);
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [end, duration]);
  
  return (
    <span>
      {count.toFixed(decimals)}{suffix}
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
  const circumference = radius * 2 * Math.PI;
  const progress = (value / max) * circumference;
  
  return (
    <div className="relative inline-flex items-center justify-center">
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

// FitScore logo using the real brand image
function FitScoreLogo({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img 
        src="/attached_assets/ChatGPT Image 2025. g. 11. jūn. 10_44_10_1750431009671.png" 
        alt="FitScore Logo" 
        width={size} 
        height={size}
        className="drop-shadow-lg"
        style={{ 
          filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))',
          borderRadius: '50%'
        }}
      />
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
    }
  });

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/whoop/today'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whoop/weekly'] });
    setLastSync(new Date());
  };

  if (!isWhoopConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-8 p-8 animate-fade-in">
          <div className="flex justify-center mb-8">
            <FitScoreLogo size={128} className="animate-pulse" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white">FitScore Health Dashboard</h1>
            <p className="text-xl text-slate-300">Connect your WHOOP device to get started</p>
          </div>
          
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardContent className="p-8">
              <div className="text-center space-y-6">
                <AlertCircle className="h-16 w-16 text-blue-400 mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">WHOOP Connection Required</h3>
                  <p className="text-slate-400">
                    Authenticate with your WHOOP account to access your health metrics and insights.
                  </p>
                </div>
                <Button 
                  onClick={() => connectWhoopMutation.mutate()}
                  disabled={connectWhoopMutation.isPending}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 transform hover:scale-105"
                  style={{
                    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  <ExternalLink className="h-5 w-5 mr-2" />
                  {connectWhoopMutation.isPending ? 'Connecting...' : 'Connect WHOOP'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <FitScoreLogo size={48} />
              <div>
                <h1 className="text-2xl font-bold text-white">FitScore Health Dashboard</h1>
                <p className="text-slate-300">Real-time WHOOP health analytics</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                Connected
              </Badge>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshData}
                disabled={whoopLoading || summaryLoading}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${(whoopLoading || summaryLoading) ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Live WHOOP Summary */}
        <div className="mb-12 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Hello Gustavs</h1>
            <p className="text-xl text-slate-300 mb-4 font-medium">Here are your health insights for today</p>
            <p className="text-slate-400">Live data from your WHOOP device</p>
            {lastSync && (
              <div className="flex items-center justify-center mt-2 text-sm text-slate-500">
                <Clock className="h-4 w-4 mr-1" />
                Last sync: {formatTime(lastSync)}
              </div>
            )}
          </div>
          
          {whoopLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-slate-800/50 border-slate-700 backdrop-blur-sm animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-20 h-20 bg-slate-700 rounded-full"></div>
                      <div className="h-4 bg-slate-700 rounded w-20"></div>
                      <div className="h-8 bg-slate-700 rounded w-16"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : whoopError ? (
            <Card className="bg-red-900/20 border-red-800 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-red-400 mb-2">Failed to load WHOOP data</h3>
                <p className="text-red-300 mb-4">Unable to fetch your latest health metrics</p>
                <Button 
                  onClick={() => refetchWhoop()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Recovery Score - Navy Blue Theme */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-md hover:from-slate-700/80 hover:to-slate-800/80 transition-all duration-300 transform hover:scale-105 animate-fade-in shadow-xl">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <CircularProgress 
                      value={whoopData?.recovery_score || 0} 
                      color="#3b82f6"
                      size={100}
                    />
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Heart className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium text-slate-300">Recovery</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Strain Score - Orange/Red Theme */}
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
                        <CountUp end={whoopData?.strain || 0} decimals={1} duration={1200} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sleep Score - Purple Theme */}
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
                      <div className="text-xl font-bold text-purple-400">
                        {whoopData?.sleep_score ? (
                          <CountUp end={whoopData.sleep_score} suffix="%" duration={1200} />
                        ) : (
                          <span className="text-slate-400">No sleep data yet</span>
                        )}
                      </div>
                      {!whoopData?.sleep_score && (
                        <div className="text-xs text-slate-500 mt-1 max-w-24 text-center leading-tight">
                          WHOOP processes sleep after wake
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
          )}
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
                      <span className="text-white/80">N/A</span>
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
                      <span className="text-white/80">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Avg Sleep - Purple */}
              <Card 
                className="gradient-sleep border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(109, 40, 217, 0.3)',
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
                      <span className="text-white/80">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Avg HRV - Emerald */}
              <Card 
                className="gradient-hrv border-0 backdrop-blur-sm transition-all duration-300 transform hover:scale-102 cursor-pointer shadow-lg animate-fade-in rounded-2xl"
                style={{ 
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(4, 120, 87, 0.3)',
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
                      <span className="text-white/80">N/A</span>
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
      </div>
    </div>
  );
}