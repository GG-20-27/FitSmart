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
    // Skip auth check for login page
    if (location === '/login') {
      return;
    }

    // Check if we have a token in localStorage
    const hasToken = !!localStorage.getItem('auth_token');
    
    // Only redirect to WHOOP OAuth if we definitively don't have authentication
    // Wait for auth loading to complete AND ensure we don't have a stored token
    if (!isAuthLoading && !isAuthenticated && !hasToken) {
      // Redirect to WHOOP OAuth instead of login page
      window.location.href = '/api/whoop/login';
    }
  }, [isAuthenticated, isAuthLoading, location, setLocation]);

  // Show loading spinner while checking authentication
  if (isAuthLoading && location !== '/login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page or protected content
  return <>{children}</>;
}