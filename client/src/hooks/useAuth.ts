import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useEffect } from 'react';

interface AuthUser {
  userId: string;
  role?: string;
}

interface AuthResponse {
  message: string;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // Invalid token format
  }
}

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Check for token in URL hash on mount (OAuth callback)
  useEffect(() => {
    const checkForToken = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#token=')) {
        const token = hash.substring(7); // Remove '#token='
        localStorage.setItem('auth_token', token);
        
        // Clear the hash and redirect to dashboard
        window.history.replaceState(null, '', '/');
        
        // Trigger a refetch of user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        
        console.log('[AUTH] JWT token received and stored');
        return;
      }
      
      // Check if current token is expired or missing
      const currentToken = localStorage.getItem('auth_token');
      if (!currentToken || isTokenExpired(currentToken)) {
        console.log('[AUTH] No valid token found, redirecting to WHOOP OAuth');
        localStorage.removeItem('auth_token');
        window.location.href = '/api/whoop/login';
        return;
      }
    };

    checkForToken();
  }, [queryClient]);

  // Query to check if user is authenticated
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: () => apiRequest<AuthUser>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Check if token exists and is valid in localStorage
  const currentToken = localStorage.getItem('auth_token');
  const hasValidToken = currentToken && !isTokenExpired(currentToken);

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<AuthResponse>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Remove JWT token from localStorage
      localStorage.removeItem('auth_token');
      queryClient.clear(); // Clear all cached data
      setLocation('/');
    },
  });

  const logout = () => {
    logoutMutation.mutate();
  };
  
  // More robust authentication logic
  const isAuthenticated = hasValidToken && !!user && !error;
  
  // Consider authenticated if we have a valid token, even if user data is still loading
  const isAuthLoading = isLoading && hasValidToken;

  return {
    user,
    isAuthenticated,
    isAuthLoading,
    logout,
    isLoggingOut: logoutMutation.isPending
  };
}