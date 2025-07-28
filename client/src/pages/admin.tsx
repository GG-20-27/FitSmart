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
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-slate-400">User management and system administration</p>
            </div>
          </div>

          <div className="flex space-x-3">
            <Link href="/">
              <Button
                variant="outline"
                className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Dashboard
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
                    className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {adminUser.email || `WHOOP ID: ${adminUser.id}`}
                        </p>
                        <p className="text-slate-400 text-sm">
                          Added: {new Date(adminUser.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Badge
                        variant={adminUser.hasWhoopToken ? "default" : "secondary"}
                        className={adminUser.hasWhoopToken ? "bg-green-600 hover:bg-green-700" : "bg-slate-600"}
                      >
                        {adminUser.hasWhoopToken ? "Connected" : "No Token"}
                      </Badge>
                      
                      {adminUser.hasWhoopToken && adminUser.tokenExpiresAt && (
                        <span className="text-xs text-slate-400">
                          Expires: {new Date(adminUser.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent border-slate-500 text-slate-300 hover:bg-slate-600 hover:text-white"
                        onClick={() => {
                          toast({
                            title: "User Details",
                            description: `WHOOP ID: ${adminUser.id}`,
                          });
                        }}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View
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