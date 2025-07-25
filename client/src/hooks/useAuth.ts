import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useEffect } from 'react';

interface AuthUser {
  userId: string;
}

interface AuthResponse {
  message: string;
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

  // Check if token exists in localStorage
  const hasToken = !!localStorage.getItem('auth_token');

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
  
  const isAuthenticated = hasToken && !!user && !error;
  const isAuthLoading = isLoading;

  return {
    user,
    isAuthenticated,
    isAuthLoading,
    logout,
    isLoggingOut: logoutMutation.isPending
  };
}