import { useState, useEffect, useMemo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarIcon, MapPin, Clock, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import moment from 'moment-timezone';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Configure moment for Europe/Zurich timezone
moment.tz.setDefault('Europe/Zurich');
moment.locale('en');
const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  location?: string;
  date: string;
}

interface CalendarEventsResponse {
  events: CalendarEvent[];
  range: {
    start: string;
    end: string;
  };
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);

  // Calculate date range for API query based on current view
  const { startDate, endDate } = useMemo(() => {
    const current = moment(currentDate).tz('Europe/Zurich');
    
    switch (view) {
      case 'month':
        return {
          startDate: current.clone().startOf('month').startOf('week').format('YYYY-MM-DD'),
          endDate: current.clone().endOf('month').endOf('week').format('YYYY-MM-DD')
        };
      case 'week':
        return {
          startDate: current.clone().startOf('week').format('YYYY-MM-DD'),
          endDate: current.clone().endOf('week').format('YYYY-MM-DD')
        };
      case 'day':
        return {
          startDate: current.format('YYYY-MM-DD'),
          endDate: current.format('YYYY-MM-DD')
        };
      default:
        return {
          startDate: current.clone().startOf('month').format('YYYY-MM-DD'),
          endDate: current.clone().endOf('month').format('YYYY-MM-DD')
        };
    }
  }, [currentDate, view]);

  // Fetch calendar events
  const { data: calendarData, isLoading, error, refetch } = useQuery<CalendarEventsResponse>({
    queryKey: ['/api/calendar/events', startDate, endDate],
    queryFn: async () => {
      const response = await fetch(`/api/calendar/events?start=${startDate}&end=${endDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // Transform events for react-big-calendar
  const calendarEvents = useMemo(() => {
    if (!calendarData?.events) return [];

    return calendarData.events.map(event => ({
      id: event.id,
      title: event.title,
      start: new Date(event.start),
      end: new Date(event.end),
      resource: {
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime
      }
    }));
  }, [calendarData]);

  // Navigation handlers
  const handleNavigate = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleViewChange = (newView: 'month' | 'week' | 'day') => {
    setView(newView);
  };

  // Handle event selection
  const handleEventClick = (event: any) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  // Custom event component
  const EventComponent = ({ event }: { event: any }) => (
    <div 
      className="text-xs p-1 text-slate-200 bg-slate-700/80 hover:bg-slate-600/80 rounded cursor-pointer transition-colors duration-200 backdrop-blur-sm border border-slate-600/30"
      onClick={() => handleEventClick(event)}
    >
      <div className="font-medium truncate">{event.title}</div>
      <div className="flex items-center space-x-1 mt-1 text-slate-300">
        <Clock className="h-3 w-3" />
        <span>{event.resource.startTime}</span>
      </div>
    </div>
  );

  // Custom toolbar component
  const CustomToolbar = ({ label, onNavigate, onView }: any) => (
    <div className="flex items-center justify-between mb-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700/30 backdrop-blur-sm">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('PREV')}
          className="text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold text-white">{label}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('NEXT')}
          className="text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors duration-200"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('TODAY')}
          className="text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors duration-200"
        >
          Today
        </Button>
        <div className="flex border border-slate-600/50 rounded-md overflow-hidden">
          {['month', 'week', 'day'].map((v) => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onView(v)}
              className={`
                capitalize rounded-none border-0 transition-colors duration-200
                ${view === v 
                  ? 'bg-slate-600 text-white' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }
              `}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex items-center space-x-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading calendar...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <div className="text-red-400 mb-4">
                <CalendarIcon className="h-16 w-16 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Calendar Error</h3>
              </div>
              <p className="text-slate-400 mb-4">
                {error instanceof Error ? error.message : 'Failed to load calendar'}
              </p>
              <Button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700">
                Try Again
              </Button>
            </CardContent>
          </Card>
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
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Calendar</h1>
              <p className="text-slate-400">Your schedule in Europe/Zurich time</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="bg-slate-700 text-slate-300">
              {calendarEvents.length} events
            </Badge>
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:text-white"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Calendar */}
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="calendar-container" style={{ height: '700px' }}>
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                date={currentDate}
                view={view}
                onNavigate={handleNavigate}
                onView={handleViewChange}
                components={{
                  toolbar: CustomToolbar,
                  event: EventComponent
                }}
                views={[Views.MONTH, Views.WEEK, Views.DAY]}
                step={60}
                onSelectEvent={handleEventClick}
                eventPropGetter={() => ({
                  style: {
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'inherit'
                  }
                })}
                dayPropGetter={() => ({
                  style: {
                    backgroundColor: 'transparent'
                  }
                })}
                slotPropGetter={() => ({
                  style: {
                    backgroundColor: 'transparent'
                  }
                })}
                className="custom-calendar"
              />
            </div>
          </CardContent>
        </Card>

        {/* Event Detail Dialog */}
        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-white">
                Event Details
              </DialogTitle>
            </DialogHeader>
            {selectedEvent && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-white mb-2">
                    {selectedEvent.title}
                  </h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-300">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">Time</span>
                    </div>
                    <div className="text-white mt-1">
                      {selectedEvent.resource?.startTime} - {selectedEvent.resource?.endTime}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center space-x-2 text-slate-300">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="text-sm">Date</span>
                    </div>
                    <div className="text-white mt-1">
                      {moment(selectedEvent.start).format('MMMM Do, YYYY')}
                    </div>
                  </div>
                </div>

                {selectedEvent.resource?.location && (
                  <div>
                    <div className="flex items-center space-x-2 text-slate-300">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm">Location</span>
                    </div>
                    <div className="text-white mt-1">
                      {selectedEvent.resource.location}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-600">
                  <Button 
                    onClick={() => setShowEventDialog(false)}
                    className="w-full bg-slate-600 hover:bg-slate-500 text-white"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}