import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, LogIn, User } from 'lucide-react';
import { FaGoogle, FaApple } from 'react-icons/fa';

interface SocialAuthProps {
  onGoogleAuth?: () => void;
  onAppleAuth?: () => void;
  onWhoopAuth?: () => void;
  isLoading?: boolean;
  connectedServices?: {
    google: boolean;
    apple: boolean;
    whoop: boolean;
  };
}

export default function SocialAuth({ 
  onGoogleAuth, 
  onAppleAuth, 
  onWhoopAuth,
  isLoading = false,
  connectedServices = { google: false, apple: false, whoop: false }
}: SocialAuthProps) {
  return (
    <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <LogIn className="h-5 w-5" />
          Authentication Options
        </CardTitle>
        <CardDescription>
          Connect with your preferred authentication method
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Google Authentication */}
        <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white rounded-lg">
              <FaGoogle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-medium">Google Account</span>
                {connectedServices.google && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Connected
                  </Badge>
                )}
              </div>
              <span className="text-slate-400 text-sm">Sign in with Google</span>
            </div>
          </div>
          <Button
            onClick={onGoogleAuth}
            disabled={isLoading || connectedServices.google}
            variant="outline"
            size="sm"
            className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
          >
            {connectedServices.google ? (
              'Connected'
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-1" />
                Connect
              </>
            )}
          </Button>
        </div>

        {/* Apple Authentication */}
        <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-black rounded-lg">
              <FaApple className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-medium">Apple ID</span>
                {connectedServices.apple && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Connected
                  </Badge>
                )}
              </div>
              <span className="text-slate-400 text-sm">Sign in with Apple</span>
            </div>
          </div>
          <Button
            onClick={onAppleAuth}
            disabled={isLoading || connectedServices.apple}
            variant="outline"
            size="sm"
            className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
          >
            {connectedServices.apple ? (
              'Connected'
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-1" />
                Connect
              </>
            )}
          </Button>
        </div>

        {/* WHOOP Authentication */}
        <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-medium">WHOOP Account</span>
                {connectedServices.whoop && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Connected
                  </Badge>
                )}
              </div>
              <span className="text-slate-400 text-sm">Access health data</span>
            </div>
          </div>
          <Button
            onClick={onWhoopAuth}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
          >
            {connectedServices.whoop ? (
              'Reconnect'
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-1" />
                Connect
              </>
            )}
          </Button>
        </div>

        {/* Info Box */}
        <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200 text-sm">
            Multiple authentication options allow you to choose your preferred sign-in method. 
            WHOOP connection is required for health data access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}