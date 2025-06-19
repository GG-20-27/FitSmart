import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export function ApiStatus() {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-lg">API Endpoints</CardTitle>
        <p className="text-sm text-slate-600">Available endpoints for Custom GPT integration</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">GET</Badge>
                <code className="text-sm font-mono text-slate-900">/</code>
              </div>
              <Badge variant="outline" className="text-xs">Health Check</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">Returns API status confirmation</p>
            <div className="bg-slate-50 rounded p-3">
              <code className="text-xs text-green-700">"✅ FitScore GPT API is running"</code>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">GET</Badge>
                <code className="text-sm font-mono text-slate-900">/api/whoop/today</code>
              </div>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">WHOOP Data</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">Retrieves today's health metrics from WHOOP API</p>
            <div className="bg-slate-50 rounded p-3">
              <code className="text-xs text-slate-900 whitespace-pre">
{`{
  "recovery_score": 78,
  "sleep_score": 85,
  "strain_score": 12.4,
  "resting_heart_rate": 65
}`}
              </code>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">POST</Badge>
                <code className="text-sm font-mono text-slate-900">/api/meals</code>
              </div>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">Upload</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">Upload multiple meal images with multer middleware</p>
            <div className="bg-slate-50 rounded p-3">
              <code className="text-xs text-slate-900">Content-Type: multipart/form-data</code>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">GET</Badge>
                <code className="text-sm font-mono text-slate-900">/api/meals/today</code>
              </div>
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Meals List</Badge>
            </div>
            <p className="text-sm text-slate-600 mb-2">Returns list of today's uploaded meal image URLs</p>
            <div className="bg-slate-50 rounded p-3">
              <code className="text-xs text-slate-900 whitespace-pre">
{`{
  "meals": [
    "/uploads/breakfast_0845.jpg",
    "/uploads/lunch_1230.jpg"
  ]
}`}
              </code>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Implementation Notes</p>
              <ul className="text-sm text-amber-700 mt-2 space-y-1">
                <li>• WHOOP API integration uses placeholder logic with stored access token</li>
                <li>• File uploads saved to <code className="bg-amber-100 px-1 rounded">/uploads/</code> with timestamp naming</li>
                <li>• Meal metadata stored in server memory (JSON object)</li>
                <li>• Static files served from <code className="bg-amber-100 px-1 rounded">/uploads/</code> for Custom GPT access</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
