import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Calendar Management
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
            className="ml-auto"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Calendar
          </Button>
        </CardTitle>
        <CardDescription>
          Manage your personal calendars. Add Google Calendar ICS links to see your events in the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
            <h4 className="font-medium">Add New Calendar</h4>
            <p className="text-sm text-muted-foreground">
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
              />
              <Input
                placeholder="Calendar ICS URL (https://calendar.google.com/calendar/ical/...)"
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
              />
              <div className="flex gap-2">
                <Button 
                  onClick={handleAddCalendar}
                  disabled={addCalendarMutation.isPending}
                  size="sm"
                >
                  {addCalendarMutation.isPending ? 'Adding...' : 'Add Calendar'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsAdding(false);
                    setCalendarUrl('');
                    setCalendarName('');
                  }}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {calendars.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No calendars configured.</p>
            <p className="text-sm">Add a calendar to see your events in the dashboard.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calendars.map((calendar) => (
              <div
                key={calendar.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{calendar.calendarName}</h4>
                    {calendar.isActive ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-md">
                    {calendar.calendarUrl}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleCalendarMutation.mutate({ 
                      id: calendar.id, 
                      isActive: !calendar.isActive 
                    })}
                    disabled={toggleCalendarMutation.isPending}
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
                    onClick={() => window.open(calendar.calendarUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteCalendarMutation.mutate(calendar.id)}
                    disabled={deleteCalendarMutation.isPending}
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