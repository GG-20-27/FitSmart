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
  period_days: number;
  avg_recovery: number | null;
  avg_strain: number | null;
  avg_sleep: number | null;
  avg_hrv: number | null;
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

// FitScore logo as SVG component
function FitScoreLogo({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <div 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 200 200" 
        className="drop-shadow-lg"
      >
        <defs>
          <linearGradient id="fitscoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Outer circle */}
        <circle 
          cx="100" 
          cy="100" 
          r="90" 
          fill="url(#fitscoreGradient)" 
          filter="url(#glow)"
          opacity="0.9"
        />
        
        {/* Inner elements */}
        <g transform="translate(100,100)" fill="white" opacity="0.9">
          {/* Brain/AI icon (top left) */}
          <g transform="translate(-40,-40) scale(0.8)">
            <path d="M-15,-10 Q-20,-15 -10,-15 Q0,-20 10,-15 Q20,-15 15,-10 Q20,-5 15,0 Q20,5 10,10 Q0,15 -10,10 Q-20,5 -15,0 Q-20,-5 -15,-10 Z" />
            <circle cx="-8" cy="-5" r="2" fill="url(#fitscoreGradient)" />
            <circle cx="0" cy="-8" r="2" fill="url(#fitscoreGradient)" />
            <circle cx="8" cy="-5" r="2" fill="url(#fitscoreGradient)" />
          </g>
          
          {/* FS text (top right) */}
          <g transform="translate(15,-35)">
            <text fontSize="28" fontWeight="bold" textAnchor="middle" fontFamily="Inter, sans-serif">FS</text>
          </g>
          
          {/* Heart rate line (center) */}
          <g transform="translate(0,0)">
            <path 
              d="M-35,0 L-20,0 L-15,-15 L-10,15 L-5,-10 L0,0 L5,0 L10,-15 L15,15 L20,0 L35,0" 
              stroke="white" 
              strokeWidth="3" 
              fill="none"
              strokeLinecap="round"
            />
          </g>
          
          {/* Activity bars (bottom) */}
          <g transform="translate(0,35)">
            <rect x="-25" y="-5" width="6" height="10" rx="3" />
            <rect x="-15" y="-10" width="6" height="15" rx="3" />
            <rect x="-5" y="-8" width="6" height="13" rx="3" />
            <rect x="5" y="-12" width="6" height="17" rx="3" />
            <rect x="15" y="-6" width="6" height="11" rx="3" />
            <rect x="25" y="-4" width="6" height="9" rx="3" />
          </g>
        </g>
      </svg>
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

  const { data: whoopSummary, isLoading: summaryLoading } = useQuery<WhoopSummary>({
    queryKey: ['/api/whoop/summary'],
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
            queryClient.invalidateQueries({ queryKey: ['/api/whoop/summary'] });
            resolve();
          }
        }, 1000);
      });
    }
  });

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/whoop/today'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whoop/summary'] });
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
            <h2 className="text-3xl font-bold text-white mb-2">Today's Health Metrics</h2>
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
              {/* Recovery Score - Large Circle */}
              <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 transform hover:scale-105">
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

              {/* Strain Score */}
              <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 transform hover:scale-105">
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

              {/* Sleep Score */}
              <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 transform hover:scale-105">
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
                        {whoopData?.sleep_score ? (
                          <CountUp end={whoopData.sleep_score} suffix="%" duration={1200} />
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* HRV */}
              <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 transform hover:scale-105">
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
          ) : whoopSummary && (
            whoopSummary.avg_recovery !== null || 
            whoopSummary.avg_strain !== null || 
            whoopSummary.avg_sleep !== null || 
            whoopSummary.avg_hrv !== null
          ) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/50 border-blue-700/50 backdrop-blur-sm hover:from-blue-800/60 hover:to-blue-700/60 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <Heart className="h-5 w-5 text-blue-400" />
                    <span className="text-sm font-medium text-blue-300">Avg Recovery</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-400">
                    {whoopSummary.avg_recovery !== null ? (
                      <CountUp end={whoopSummary.avg_recovery} suffix="%" duration={1500} />
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-900/50 to-red-800/50 border-orange-700/50 backdrop-blur-sm hover:from-orange-800/60 hover:to-red-700/60 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <Zap className="h-5 w-5 text-orange-400" />
                    <span className="text-sm font-medium text-orange-300">Avg Strain</span>
                  </div>
                  <div className="text-3xl font-bold text-orange-400">
                    {whoopSummary.avg_strain !== null ? (
                      <CountUp end={whoopSummary.avg_strain} decimals={1} duration={1500} />
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-900/50 to-indigo-800/50 border-purple-700/50 backdrop-blur-sm hover:from-purple-800/60 hover:to-indigo-700/60 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <Moon className="h-5 w-5 text-purple-400" />
                    <span className="text-sm font-medium text-purple-300">Avg Sleep</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-400">
                    {whoopSummary.avg_sleep !== null ? (
                      <CountUp end={whoopSummary.avg_sleep} suffix="%" duration={1500} />
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-900/50 to-emerald-800/50 border-green-700/50 backdrop-blur-sm hover:from-green-800/60 hover:to-emerald-700/60 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <Activity className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-green-300">Avg HRV</span>
                  </div>
                  <div className="text-3xl font-bold text-green-400">
                    {whoopSummary.avg_hrv !== null ? (
                      <CountUp end={whoopSummary.avg_hrv} suffix=" ms" decimals={1} duration={1500} />
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <TrendingUp className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-400 mb-2">No historical data available</h3>
                <p className="text-slate-500">
                  Keep using your WHOOP device to build historical averages
                </p>
              </CardContent>
            </Card>
          )}
          
          {whoopSummary && (
            <div className="text-center mt-6">
              <p className="text-sm text-slate-500">
                Averages calculated from the past {whoopSummary.period_days} days of real WHOOP data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}