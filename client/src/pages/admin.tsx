import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Users, Crown, Calendar, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  hasWhoopToken: boolean;
  tokenExpiresAt?: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== 'admin') {
      toast({
        title: "Unauthorized",
        description: "Admin access required to view this page.",
        variant: "destructive",
      });
      window.location.href = '/';
    }
  }, [user, toast]);

  const { data: adminUsers, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: user?.role === 'admin',
    retry: 3,
  });

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-slate-300">Admin privileges required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center">
              <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-slate-400 text-sm sm:text-base hidden sm:block">User management and system administration</p>
              <p className="text-slate-400 text-xs sm:hidden">User Management</p>
            </div>
          </div>

          <div className="flex justify-center sm:justify-end">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <Calendar className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* User Management Section */}
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-3">
              <Users className="h-5 w-5 text-blue-400" />
              <span>User Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-slate-300">Loading users...</span>
              </div>
            ) : adminUsers && adminUsers.length > 0 ? (
              <div className="space-y-4">
                {adminUsers.map((adminUser) => (
                  <div
                    key={adminUser.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-slate-700/50 rounded-lg border border-slate-600 space-y-3 sm:space-y-0"
                  >
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm sm:text-base truncate">
                          {adminUser.email 
                            ? adminUser.email.length > 25 
                              ? `${adminUser.email.substring(0, 22)}...`
                              : adminUser.email
                            : `${adminUser.id.substring(0, 20)}...`
                          }
                        </p>
                        <p className="text-slate-400 text-xs sm:text-sm">
                          Added: {new Date(adminUser.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3 flex-shrink-0">
                      <Badge
                        variant={adminUser.hasWhoopToken ? "default" : "secondary"}
                        className={`text-xs ${adminUser.hasWhoopToken ? "bg-green-600 hover:bg-green-700" : "bg-slate-600"}`}
                      >
                        {adminUser.hasWhoopToken ? "Connected" : "No Token"}
                      </Badge>
                      
                      {adminUser.hasWhoopToken && adminUser.tokenExpiresAt && (
                        <span className="text-xs text-slate-400 hidden lg:inline">
                          Expires: {new Date(adminUser.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent border-slate-500 text-slate-300 hover:bg-slate-600 hover:text-white text-xs sm:text-sm px-2 sm:px-3"
                        onClick={() => {
                          toast({
                            title: "User Details",
                            description: `WHOOP ID: ${adminUser.id}`,
                          });
                        }}
                      >
                        <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">View</span>
                        <span className="sm:hidden">•••</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">No users found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}