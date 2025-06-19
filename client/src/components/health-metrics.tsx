import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Heart, Moon, Zap, Activity, RefreshCw } from "lucide-react";
import type { WhoopTodayResponse } from "@shared/schema";

interface HealthMetricsProps {
  data?: WhoopTodayResponse;
  isLoading: boolean;
}

export function HealthMetrics({ data, isLoading }: HealthMetricsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Today's Health Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="text-center animate-pulse">
                <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-3"></div>
                <div className="h-4 bg-slate-200 rounded mb-1"></div>
                <div className="h-3 bg-slate-200 rounded w-16 mx-auto"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Today's Health Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">Unable to load health data</p>
            <p className="text-sm text-slate-500 mt-1">Check WHOOP API connection</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number, max: number = 100) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number, max: number = 100) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return "Excellent";
    if (percentage >= 60) return "Good";
    return "Needs Attention";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Today's Health Metrics</CardTitle>
          <div className="flex items-center space-x-2 text-sm text-slate-600">
            <RefreshCw className="h-4 w-4" />
            <span>Auto-refresh: 5min</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* Recovery Score */}
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-3">
              <Progress 
                value={data.recovery_score} 
                className="w-20 h-20 rounded-full [&>div]:rounded-full" 
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${getScoreColor(data.recovery_score)}`}>
                  {data.recovery_score}
                </span>
              </div>
            </div>
            <p className="text-sm font-medium text-slate-900">Recovery Score</p>
            <p className="text-xs text-slate-600">{getScoreLabel(data.recovery_score)}</p>
          </div>

          {/* Sleep Score */}
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-3">
              <Progress 
                value={data.sleep_score} 
                className="w-20 h-20 rounded-full [&>div]:rounded-full [&>div]:bg-blue-500" 
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${getScoreColor(data.sleep_score)}`}>
                  {data.sleep_score}
                </span>
              </div>
            </div>
            <p className="text-sm font-medium text-slate-900">Sleep Score</p>
            <p className="text-xs text-slate-600">{getScoreLabel(data.sleep_score)}</p>
          </div>

          {/* Strain Score */}
          <div className="text-center">
            <div className="bg-amber-50 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-amber-600">{data.strain_score}</div>
            </div>
            <p className="text-sm font-medium text-slate-900">Strain Score</p>
            <p className="text-xs text-slate-600">
              {data.strain_score < 10 ? "Light Activity" : data.strain_score < 15 ? "Moderate Activity" : "High Activity"}
            </p>
          </div>

          {/* Resting Heart Rate */}
          <div className="text-center">
            <div className="bg-red-50 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-red-600">{data.resting_heart_rate}</div>
              <div className="text-xs text-slate-600 mt-1">BPM</div>
            </div>
            <p className="text-sm font-medium text-slate-900">Resting HR</p>
            <p className="text-xs text-slate-600">
              {data.resting_heart_rate < 60 ? "Athletic" : data.resting_heart_rate < 80 ? "Normal Range" : "Above Average"}
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Last sync:</span>
            <span className="font-medium text-slate-900">
              {new Date().toLocaleString([], { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
