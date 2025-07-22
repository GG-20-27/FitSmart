import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus, ExternalLink, ToggleLeft, ToggleRight, CalendarDays, Copy, Check, Edit3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserCalendar {
  id: number;
  userId: string;
  calendarUrl: string;
  calendarName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function CalendarManagement() {
  const { toast } = useToast();
  const [calendarUrl, setCalendarUrl] = useState('');
  const [calendarName, setCalendarName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingCalendar, setEditingCalendar] = useState<UserCalendar | null>(null);

  const copyToClipboard = async (text: string, id: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Copied!",
        description: "Calendar URL copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Fetch user's calendars
  const { data: calendars = [], isLoading } = useQuery<UserCalendar[]>({
    queryKey: ['/api/calendars'],
    retry: false,
  });

  // Add calendar mutation
  const addCalendarMutation = useMutation({
    mutationFn: async ({ calendarUrl, calendarName }: { calendarUrl: string; calendarName: string }) => {
      const response = await fetch('/api/calendars', {
        method: 'POST',
        body: JSON.stringify({ calendarUrl, calendarName }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add calendar');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      setCalendarUrl('');
      setCalendarName('');
      setIsAdding(false);
      toast({
        title: "Calendar Added",
        description: "Your calendar has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add calendar: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete calendar mutation
  const deleteCalendarMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/calendars/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete calendar');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      toast({
        title: "Calendar Removed",
        description: "Calendar has been removed from your account.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to remove calendar: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Update calendar mutation
  const updateCalendarMutation = useMutation({
    mutationFn: async ({ id, calendarUrl, calendarName }: { id: number; calendarUrl: string; calendarName: string }) => {
      const response = await fetch(`/api/calendars/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ calendarUrl, calendarName }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update calendar');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      setEditingCalendar(null);
      setCalendarUrl('');
      setCalendarName('');
      toast({
        title: "Calendar Updated",
        description: "Calendar has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update calendar: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Toggle calendar active status
  const toggleCalendarMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await fetch(`/api/calendars/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update calendar');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars'] });
      toast({
        title: "Calendar Updated",
        description: "Calendar status has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update calendar: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleAddCalendar = async () => {
    if (!calendarUrl.trim() || !calendarName.trim()) {
      toast({
        title: "Error",
        description: "Please provide both calendar URL and name.",
        variant: "destructive",
      });
      return;
    }

    if (!calendarUrl.includes('calendar.google.com/calendar/ical/') && !calendarUrl.includes('.ics')) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid Google Calendar ICS URL (.ics file).",
        variant: "destructive",
      });
      return;
    }

    addCalendarMutation.mutate({ calendarUrl, calendarName });
  };

  const handleUpdateCalendar = async () => {
    if (!editingCalendar || !calendarUrl.trim() || !calendarName.trim()) {
      toast({
        title: "Error",
        description: "Please provide both calendar URL and name.",
        variant: "destructive",
      });
      return;
    }

    if (!calendarUrl.includes('calendar.google.com/calendar/ical/') && !calendarUrl.includes('.ics')) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid Google Calendar ICS URL (.ics file).",
        variant: "destructive",
      });
      return;
    }

    updateCalendarMutation.mutate({ 
      id: editingCalendar.id, 
      calendarUrl, 
      calendarName 
    });
  };

  const startEditing = (calendar: UserCalendar) => {
    setEditingCalendar(calendar);
    setCalendarUrl(calendar.calendarUrl);
    setCalendarName(calendar.calendarName);
    setIsAdding(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calendar Management</CardTitle>
          <CardDescription>Loading your calendars...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <CalendarDays className="h-5 w-5" />
          Calendar Management
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
            className="ml-auto bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Calendar
          </Button>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Manage your personal calendars. Add Google Calendar ICS links to see your events in the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(isAdding || editingCalendar) && (
          <div className="p-4 border border-slate-600 rounded-lg bg-slate-900/50 space-y-3">
            <h4 className="font-medium text-white">
              {editingCalendar ? 'Edit Calendar' : 'Add New Calendar'}
            </h4>
            <p className="text-sm text-slate-400">
              To add your Google Calendar:
              <br />
              1. Go to your Google Calendar settings
              <br />
              2. Find "Integrate calendar" section
              <br />
              3. Copy the "Public URL to this calendar" (ICS format)
              <br />
              4. Paste it below along with a name for your calendar
            </p>
            <div className="space-y-2">
              <Input
                placeholder="Calendar Name (e.g., Personal, Work)"
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500"
              />
              <Input
                placeholder="Calendar ICS URL (https://calendar.google.com/calendar/ical/...)"
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button 
                  onClick={editingCalendar ? handleUpdateCalendar : handleAddCalendar}
                  disabled={editingCalendar ? updateCalendarMutation.isPending : addCalendarMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                >
                  {editingCalendar 
                    ? (updateCalendarMutation.isPending ? 'Updating...' : 'Update Calendar')
                    : (addCalendarMutation.isPending ? 'Adding...' : 'Add Calendar')
                  }
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsAdding(false);
                    setEditingCalendar(null);
                    setCalendarUrl('');
                    setCalendarName('');
                  }}
                  size="sm"
                  className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {calendars.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>No calendars configured.</p>
            <p className="text-sm">Add a calendar to see your events in the dashboard.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calendars.map((calendar) => (
              <div
                key={calendar.id}
                className="flex items-center justify-between p-3 border border-slate-600 rounded-lg bg-slate-900/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-white">{calendar.calendarName}</h4>
                    <div className="flex items-center gap-2">
                      {calendar.isActive ? (
                        <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded border border-green-600/30 whitespace-nowrap">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs bg-slate-600/20 text-slate-400 px-2 py-1 rounded border border-slate-600/30 whitespace-nowrap">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-400 truncate flex-1">
                      {calendar.calendarUrl.length > 45 
                        ? `${calendar.calendarUrl.substring(0, 45)}...`
                        : calendar.calendarUrl
                      }
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(calendar.calendarUrl, calendar.id)}
                      className="bg-transparent border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-all duration-200 p-1 h-6 w-6 shrink-0"
                      title="Copy URL"
                    >
                      {copiedId === calendar.id ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleCalendarMutation.mutate({ 
                      id: calendar.id, 
                      isActive: !calendar.isActive 
                    })}
                    disabled={toggleCalendarMutation.isPending}
                    className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                  >
                    {calendar.isActive ? (
                      <ToggleRight className="h-4 w-4" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEditing(calendar)}
                    className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(calendar.calendarUrl, '_blank')}
                    className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-all duration-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteCalendarMutation.mutate(calendar.id)}
                    disabled={deleteCalendarMutation.isPending}
                    className="bg-red-600/20 border-red-600/50 text-red-400 hover:bg-red-600/30 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}