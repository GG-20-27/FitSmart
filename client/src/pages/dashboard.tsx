import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Server, 
  Link, 
  Utensils, 
  Database, 
  Activity, 
  Heart, 
  Moon, 
  Zap,
  RefreshCw,
  Info,
  Upload,
  Plus
} from "lucide-react";
import { HealthMetrics } from "@/components/health-metrics";
import { MealUpload } from "@/components/meal-upload";
import { ApiStatus } from "@/components/api-status";
import type { WhoopTodayResponse, MealResponse, Meal } from "@shared/schema";

export default function Dashboard() {
  const { data: whoopData, isLoading: whoopLoading, refetch: refetchWhoop } = useQuery<WhoopTodayResponse>({
    queryKey: ['/api/whoop/today'],
  });

  const { data: todayMeals, isLoading: mealsLoading, refetch: refetchMeals } = useQuery<string[]>({
    queryKey: ['/api/meals/today'],
  });

  const { data: allMeals } = useQuery<Meal[]>({
    queryKey: ['/api/meals'],
  });

  const mealsCount = todayMeals?.length || 0;
  const totalStorage = allMeals?.reduce((acc, meal) => acc + meal.size, 0) || 0;
  const storageInMB = (totalStorage / (1024 * 1024)).toFixed(1);

  const handleRefreshData = async () => {
    await Promise.all([refetchWhoop(), refetchMeals()]);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">FitScore GPT API</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-700 font-medium">API Running</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefreshData}
                className="text-slate-500"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* API Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">API Status</p>
                  <p className="text-2xl font-bold text-green-600">✅ Online</p>
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
                  <p className="text-2xl font-bold text-blue-600">Connected</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Link className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Meals Today</p>
                  <p className="text-2xl font-bold text-amber-600">{mealsCount}</p>
                </div>
                <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Utensils className="h-6 w-6 text-amber-600" />
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
          <HealthMetrics data={whoopData} isLoading={whoopLoading} />

          {/* Meal Management */}
          <div className="space-y-8">
            <MealUpload onUploadSuccess={refetchMeals} />
            
            {/* Today's Meals */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Today's Meals</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => refetchMeals()}
                    className="text-blue-600"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {mealsLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-4 animate-pulse">
                        <div className="w-full h-32 bg-slate-200 rounded-lg mb-3"></div>
                        <div className="h-4 bg-slate-200 rounded mb-1"></div>
                        <div className="h-3 bg-slate-200 rounded w-20"></div>
                      </div>
                    ))}
                  </div>
                ) : todayMeals?.meals && todayMeals.meals.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {todayMeals.meals.map((mealUrl, index) => (
                      <div key={index} className="bg-slate-50 rounded-lg p-4">
                        <img 
                          src={mealUrl} 
                          alt={`Meal ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg mb-3"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDIwMCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNTZIMTEyVjY4SDEwMFY1NloiIGZpbGw9IiM5NEE2QkEiLz4KPHBhdGggZD0iTTEwMCA3MkgxMTJWODRIMTAwVjcyWiIgZmlsbD0iIzk0QTZCQSIvPgo8L3N2Zz4K";
                          }}
                        />
                        <div className="text-sm">
                          <p className="font-medium text-slate-900">
                            {mealUrl.split('/').pop()}
                          </p>
                          <p className="text-slate-600">
                            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {todayMeals.meals.length < 4 && (
                      <div className="bg-slate-50 rounded-lg p-4 border-2 border-dashed border-slate-300 flex items-center justify-center">
                        <div className="text-center">
                          <Plus className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">Add more meals</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Utensils className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">No meals uploaded today</p>
                    <p className="text-sm text-slate-500 mt-1">Upload some meal images to get started</p>
                  </div>
                )}

                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center text-sm text-blue-700">
                    <Info className="h-4 w-4 mr-2" />
                    <span>Images are served from <code className="bg-white px-1 rounded">/uploads/</code> directory</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* API Endpoints Documentation */}
        <ApiStatus />
      </main>
    </div>
  );
}
