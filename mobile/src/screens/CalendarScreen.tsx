import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import { apiRequest } from '../api/client';
import { colors, spacing, radii, typography } from '../theme';
import { Card } from '../ui/components';

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

interface MarkedDates {
  [date: string]: {
    marked?: boolean;
    dotColor?: string;
    selected?: boolean;
    selectedColor?: string;
  };
}

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);

      // Calculate date range for the month view (30 days from today)
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 30);

      const startStr = today.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      // Load upcoming events for the month view
      const upcomingResponse = await apiRequest(`/api/calendar/events?start=${startStr}&end=${endStr}`);
      setUpcomingEvents(upcomingResponse?.events || []);

      // Load events for selected date (single day range)
      const eventsResponse = await apiRequest(`/api/calendar/events?start=${selectedDate}&end=${selectedDate}`);
      setEvents(eventsResponse?.events || []);

    } catch (error) {
      console.error('Failed to load calendar events:', error);
      // Don't show alert on error - might just be no calendars configured
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  // Create marked dates for calendar
  const getMarkedDates = (): MarkedDates => {
    const marked: MarkedDates = {};
    
    // Mark selected date
    marked[selectedDate] = {
      selected: true,
      selectedColor: colors.accent,
    };

    // Mark dates with events
    upcomingEvents.forEach(event => {
      const eventDate = event.start.split('T')[0];
      if (!marked[eventDate]) {
        marked[eventDate] = {
          marked: true,
          dotColor: colors.success,
        };
      }
    });

    return marked;
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatEventTime = (start: string, end: string): string => {
    return `${formatTime(start)} – ${formatTime(end)}`;
  };

  const renderEventCard = (event: CalendarEvent, index: number) => (
    <Card key={index} style={styles.eventCard}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventTime}>
          {formatEventTime(event.start, event.end)}
        </Text>
      </View>

      {event.location && (
        <View style={styles.eventLocation}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>{event.location}</Text>
        </View>
      )}

      {event.description && (
        <Text style={styles.eventDescription} numberOfLines={2}>
          {event.description}
        </Text>
      )}
    </Card>
  );

  const renderAgendaView = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      );
    }

    if (events.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.noEventsText}>No events scheduled</Text>
          <Text style={styles.noEventsSubtext}>
            Add a calendar URL in your Profile to see events here
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.agendaContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.agendaTitle}>
          {new Date(selectedDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        
        {events.map((event, index) => renderEventCard(event, index))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <View style={styles.calendarContainer}>
        <Calendar
          current={selectedDate}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          markedDates={getMarkedDates()}
          theme={{
            backgroundColor: colors.bgSecondary,
            calendarBackground: colors.bgSecondary,
            textSectionTitleColor: colors.textPrimary,
            selectedDayBackgroundColor: colors.accent,
            selectedDayTextColor: colors.bgPrimary,
            todayTextColor: colors.accent,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.textMuted,
            dotColor: colors.success,
            selectedDotColor: colors.bgPrimary,
            arrowColor: colors.accent,
            disabledArrowColor: colors.surfaceMute,
            monthTextColor: colors.textPrimary,
            indicatorColor: colors.accent,
            textDayFontWeight: '400',
            textMonthFontWeight: '600',
            textDayHeaderFontWeight: '500',
            textDayFontSize: 16,
            textMonthFontSize: 18,
            textDayHeaderFontSize: 14,
          }}
        />
      </View>

      {renderAgendaView()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bgSecondary,
  },
  headerTitle: {
    ...typography.h1,
  },
  calendarContainer: {
    backgroundColor: colors.bgSecondary,
    paddingBottom: spacing.xl,
  },
  agendaContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  agendaTitle: {
    ...typography.title,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  eventCard: {
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  eventTitle: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.md,
  },
  eventTime: {
    ...typography.bodyMuted,
    fontWeight: '500',
  },
  eventLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  locationText: {
    ...typography.bodyMuted,
    flex: 1,
  },
  eventDescription: {
    ...typography.bodyMuted,
    lineHeight: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  noEventsText: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noEventsSubtext: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
