import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

interface WhoopUser {
  id: string;
  email: string;
  whoopUserId: string;
  created_at: string;
}

interface AuthResponse {
  message: string;
}

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Query to check if user is authenticated
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: () => apiRequest<WhoopUser>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<AuthResponse>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear(); // Clear all cached data
      setLocation('/login');
    },
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  const isAuthenticated = !!user && !error;
  const isAuthLoading = isLoading;

  return {
    user,
    isAuthenticated,
    isAuthLoading,
    logout,
    isLoggingOut: logoutMutation.isPending
  };
}