import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Server, 
  Link, 
  Database, 
  Activity, 
  Heart, 
  Moon, 
  Zap,
  RefreshCw,
  Info,
  ExternalLink,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { HealthMetrics } from "@/components/health-metrics";
import { ApiStatus } from "@/components/api-status";
import { WhoopAuth } from "@/components/whoop-auth";
import type { WhoopTodayResponse, Meal } from "@shared/schema";

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

export default function Dashboard() {
  const { data: whoopData, isLoading: whoopLoading, refetch: refetchWhoop, error: whoopError } = useQuery<WhoopTodayResponse>({
    queryKey: ['/api/whoop/today'],
    retry: false,
  });

  const { data: whoopAuthStatus, isLoading: authLoading, error: authError } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 5000,
  });

  const { data: whoopSummary, isLoading: summaryLoading } = useQuery<WhoopSummary>({
    queryKey: ['/api/whoop/summary'],
    enabled: whoopAuthStatus?.authenticated === true,
  });

  const { data: allMeals } = useQuery<Meal[]>({
    queryKey: ['/api/meals'],
  });

  const isWhoopConnected = whoopAuthStatus?.authenticated;
  const totalStorage = allMeals?.reduce((acc, meal) => acc + meal.size, 0) || 0;
  const storageInMB = (totalStorage / (1024 * 1024)).toFixed(1);

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
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">FitScore GPT API</h1>
                <p className="text-sm text-slate-600">Health data hub for Custom GPT integration</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="bg-green-50 text-green-700">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                API Running
              </Badge>
              
              {!isWhoopConnected && (
                <Button 
                  onClick={() => connectWhoopMutation.mutate()}
                  disabled={connectWhoopMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect WHOOP
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshData}
                className="text-slate-600"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">API Status</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <p className="text-2xl font-bold text-green-600">Online</p>
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <Server className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">WHOOP Status</p>
                  <p className="text-2xl font-bold text-green-600">
                    {isWhoopConnected ? 'Connected' : 'Offline'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <Activity className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Storage Used</p>
                  <p className="text-2xl font-bold text-slate-900">{storageInMB} MB</p>
                </div>
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Database className="h-6 w-6 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* WHOOP Health Data */}
          <div className="space-y-6">
            <WhoopAuth />
            <HealthMetrics 
              data={whoopData} 
              isLoading={whoopLoading} 
              error={whoopError}
              onRetry={() => refetchWhoop()}
            />
          </div>

          {/* WHOOP Averages Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Your Averages
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={refreshData}
                    className="text-blue-600"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!isWhoopConnected ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 mb-4">Connect WHOOP to view your averages</p>
                    <Button 
                      onClick={() => connectWhoopMutation.mutate()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect WHOOP
                    </Button>
                  </div>
                ) : summaryLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-4 animate-pulse">
                        <div className="h-4 bg-slate-200 rounded mb-2"></div>
                        <div className="h-8 bg-slate-200 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : whoopSummary && (
                  whoopSummary.avg_recovery !== null || 
                  whoopSummary.avg_strain !== null || 
                  whoopSummary.avg_sleep !== null || 
                  whoopSummary.avg_hrv !== null
                ) ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Heart className="h-4 w-4 text-blue-600" />
                          <p className="text-sm font-medium text-slate-700">Recovery Score</p>
                        </div>
                        <p className="text-2xl font-bold text-blue-600">
                          {whoopSummary.avg_recovery !== null ? `${whoopSummary.avg_recovery}%` : 'N/A'}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Moon className="h-4 w-4 text-purple-600" />
                          <p className="text-sm font-medium text-slate-700">Sleep Score</p>
                        </div>
                        <p className="text-2xl font-bold text-purple-600">
                          {whoopSummary.avg_sleep !== null ? `${whoopSummary.avg_sleep}%` : 'N/A'}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Zap className="h-4 w-4 text-orange-600" />
                          <p className="text-sm font-medium text-slate-700">Strain Score</p>
                        </div>
                        <p className="text-2xl font-bold text-orange-600">
                          {whoopSummary.avg_strain !== null ? whoopSummary.avg_strain.toFixed(1) : 'N/A'}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Activity className="h-4 w-4 text-red-600" />
                          <p className="text-sm font-medium text-slate-700">HRV</p>
                        </div>
                        <p className="text-2xl font-bold text-red-600">
                          {whoopSummary.avg_hrv !== null ? `${whoopSummary.avg_hrv.toFixed(1)} ms` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-xs text-slate-500 text-center">
                      Averages are based on real WHOOP data from the past {whoopSummary.period_days} days.
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 mb-2">No data available yet</p>
                    <p className="text-sm text-slate-500">
                      Sync your WHOOP data to see historical averages
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Status Component */}
            <ApiStatus />
          </div>
        </div>
      </div>
    </div>
  );
}