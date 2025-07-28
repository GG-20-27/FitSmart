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
    
    console.log('[AUTH] Authentication check:', { isAuthenticated, isAuthLoading, hasToken });
    
    // CRITICAL: Every user MUST authenticate with WHOOP first - no bypassing allowed
    if (!isAuthLoading && !isAuthenticated && !hasToken) {
      console.log('[AUTH] User not authenticated - MUST authenticate with WHOOP first');
      
      // Clear any existing auth data to ensure fresh authentication
      localStorage.removeItem('auth_token');
      localStorage.removeItem('whoop_token');
      
      // Force WHOOP OAuth authentication - required for all users
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

  // Only show content if user is fully authenticated with WHOOP
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">WHOOP Authentication Required</h2>
          <p className="text-slate-300 mb-4">You must authenticate with your WHOOP account to access your personal health metrics.</p>
          <p className="text-sm text-slate-400">Redirecting to WHOOP OAuth...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}