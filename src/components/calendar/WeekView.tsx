import { useCallback, useEffect, useRef } from 'react';
import { HOUR_HEIGHT, DAY_START_HOUR, GRID_HEIGHT, allDayEventsForDay } from '@/hooks/useEventLayout';
import { TimeGutter } from './TimeGutter';
import { DayColumnHeader } from './DayColumnHeader';
import { DayColumn } from './DayColumn';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { parseISO, format } from 'date-fns';

interface WeekViewProps {
    days: Date[];
    events: CalendarEvent[];
    onSelectEvent: (eventId: string) => void;
    onCreateAtTime: (day: Date, hour: number, minutes: number) => void;
}

export function WeekView({ days, events, onSelectEvent, onCreateAtTime }: WeekViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to current hour on mount
    useEffect(() => {
        if (!scrollRef.current) return;
        const now = new Date();
        const currentHour = now.getHours();
        const scrollTarget = Math.max(0, (currentHour - DAY_START_HOUR - 1) * HOUR_HEIGHT);
        scrollRef.current.scrollTop = scrollTarget;
    }, []);

    // Collect all-day events
    const hasAllDay = days.some((day) => allDayEventsForDay(events, day).length > 0);

    return (
        <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
            {/* Sticky header row */}
            <div className="flex border-b bg-card z-10 shrink-0">
                {/* Gutter spacer */}
                <div style={{ width: 56 }} className="shrink-0 border-r border-border/30" />
                {/* Day headers */}
                <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                    {days.map((day) => (
                        <DayColumnHeader key={day.toISOString()} day={day} />
                    ))}
                </div>
            </div>

            {/* All-day events bar */}
            {hasAllDay && (
                <div className="flex border-b shrink-0">
                    <div style={{ width: 56 }} className="shrink-0 border-r border-border/30 flex items-center justify-end pr-2">
                        <span className="text-[10px] text-muted-foreground">dia todo</span>
                    </div>
                    <div className="grid flex-1 gap-px p-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                        {days.map((day) => {
                            const allDay = allDayEventsForDay(events, day);
                            return (
                                <div key={day.toISOString()} className="flex flex-col gap-0.5 min-h-[24px]">
                                    {allDay.map((event) => (
                                        <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => onSelectEvent(event.id)}
                                            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary
                        truncate text-left hover:bg-primary/20 transition-colors"
                                        >
                                            {event.title}
                                        </button>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Scrollable time grid */}
            <div ref={scrollRef} className="flex overflow-y-auto overflow-x-hidden flex-1">
                <TimeGutter />
                <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                    {days.map((day) => (
                        <DayColumn
                            key={day.toISOString()}
                            day={day}
                            events={events}
                            onSelectEvent={onSelectEvent}
                            onCreateAtTime={onCreateAtTime}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
