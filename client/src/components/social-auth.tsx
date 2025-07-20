import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, LogIn, User } from 'lucide-react';

interface SocialAuthProps {
  onWhoopAuth?: () => void;
  isLoading?: boolean;
  connectedServices?: {
    whoop: boolean;
  };
}

export default function SocialAuth({ 
  onWhoopAuth,
  isLoading = false,
  connectedServices = { whoop: false }
}: SocialAuthProps) {
  return (
    <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <LogIn className="h-5 w-5" />
          WHOOP Authentication
        </CardTitle>
        <CardDescription className="text-slate-300">
          Connect your WHOOP account to access health data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* WHOOP Authentication Only */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg border border-slate-600">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">WHOOP Account</span>
                {connectedServices.whoop && (
                  <Badge variant="default" className="text-xs bg-green-600 text-white">
                    Connected
                  </Badge>
                )}
              </div>
              <span className="text-slate-300 text-sm">Access comprehensive health data and metrics</span>
            </div>
          </div>
          <Button
            onClick={onWhoopAuth}
            disabled={isLoading}
            variant="outline"
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 border-0 text-white hover:from-blue-700 hover:to-purple-700 font-medium px-6 py-3"
          >
            {connectedServices.whoop ? (
              'Reconnect'
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect WHOOP
              </>
            )}
          </Button>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200 text-sm">
            WHOOP connection is required to access real-time health metrics, recovery scores, 
            sleep data, and strain analytics for personalized wellness insights.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}