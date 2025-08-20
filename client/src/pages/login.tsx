import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HealthIcon } from '@/components/HealthIcon';
import { Activity, ChevronLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function LoginPage() {
  const handleWhoopLogin = () => {
    window.location.href = '/api/whoop/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Back to Dashboard button */}
      <div className="fixed top-4 left-4">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:border-white/40 transition-all duration-200">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <HealthIcon className="w-16 h-16" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            Welcome to FitScore
          </CardTitle>
          <CardDescription className="text-slate-300">
            Connect your WHOOP account to access your health dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-4">
            <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-blue-400" />
              <h3 className="text-white font-medium">Secure WHOOP Integration</h3>
              <p className="text-slate-400 text-sm">
                Your WHOOP data stays secure. We only access the health metrics you share.
              </p>
            </div>
            
            <Button
              onClick={handleWhoopLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 transition-all duration-200 h-12"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5" />
                <span className="font-medium">Connect with WHOOP</span>
              </div>
            </Button>
            
            <div className="text-slate-400 text-xs space-y-1">
              <p>By connecting, you agree to share:</p>
              <ul className="text-slate-500 space-y-1">
                <li>• Recovery & sleep data</li>
                <li>• Strain & workout metrics</li>
                <li>• Heart rate variability</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}