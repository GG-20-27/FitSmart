import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check if we have a token in localStorage
    const hasToken = !!localStorage.getItem('auth_token');
    
    // If we don't have authentication AND auth loading is complete, redirect to WHOOP OAuth
    if (!isAuthLoading && !isAuthenticated && !hasToken) {
      console.log('[AUTH] No authentication found, redirecting to WHOOP OAuth');
      window.location.href = '/api/whoop/login';
      return;
    }
  }, [isAuthenticated, isAuthLoading]);

  // Show loading spinner while checking authentication
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Only show content if authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">Redirecting to WHOOP authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}