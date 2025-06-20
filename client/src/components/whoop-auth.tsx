import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface WhoopAuthStatus {
  authenticated: boolean;
  message: string;
  auth_url?: string;
  expires_at?: number;
}

export function WhoopAuth() {
  const [authWindow, setAuthWindow] = useState<Window | null>(null);

  const { data: authStatus, isLoading, error } = useQuery<WhoopAuthStatus>({
    queryKey: ['/api/whoop/status'],
    refetchInterval: 5000, // Check status every 5 seconds
  });

  const authMutation = useMutation({
    mutationFn: () => {
      const authUrl = window.location.origin + '/api/whoop/login';
      const popup = window.open(authUrl, 'whoop-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      setAuthWindow(popup);
      return Promise.resolve();
    },
    onSuccess: () => {
      // Start polling for auth completion
      const pollInterval = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollInterval);
          setAuthWindow(null);
          // Refresh auth status
          queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
        }
      }, 1000);
    }
  });

  const refreshMutation = useMutation({
    mutationFn: () => {
      return queryClient.invalidateQueries({ queryKey: ['/api/whoop/status'] });
    }
  });

  useEffect(() => {
    // Clean up auth window on unmount
    return () => {
      if (authWindow && !authWindow.closed) {
        authWindow.close();
      }
    };
  }, [authWindow]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            WHOOP Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Checking authentication status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            WHOOP Connection Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to check WHOOP authentication status. Please try again.
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => refreshMutation.mutate()} 
            disabled={refreshMutation.isPending}
            className="mt-4"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isAuthenticated = authStatus?.authenticated;
  const expiresAt = authStatus?.expires_at ? new Date(authStatus.expires_at) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {isAuthenticated ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
            WHOOP Connection
          </span>
          <Badge variant={isAuthenticated ? "default" : "secondary"}>
            {isAuthenticated ? "Connected" : "Not Connected"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {authStatus?.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAuthenticated ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connect your WHOOP account to access live health data including recovery scores, sleep metrics, and strain data.
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => authMutation.mutate()}
              disabled={authMutation.isPending}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {authMutation.isPending ? 'Opening WHOOP...' : 'Connect WHOOP Account'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Your WHOOP account is connected and ready to provide live health data.
              </AlertDescription>
            </Alert>
            {expiresAt && (
              <p className="text-sm text-muted-foreground">
                Access token expires: {expiresAt.toLocaleDateString()} at {expiresAt.toLocaleTimeString()}
              </p>
            )}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => authMutation.mutate()}
                disabled={authMutation.isPending}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Re-authenticate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}