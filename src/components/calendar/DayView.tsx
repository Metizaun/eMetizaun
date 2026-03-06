import { useEffect, useRef } from 'react';
import { HOUR_HEIGHT, DAY_START_HOUR, allDayEventsForDay } from '@/hooks/useEventLayout';
import { TimeGutter } from './TimeGutter';
import { DayColumnHeader } from './DayColumnHeader';
import { DayColumn } from './DayColumn';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface DayViewProps {
    day: Date;
    events: CalendarEvent[];
    onSelectEvent: (eventId: string) => void;
    onCreateAtTime: (day: Date, hour: number, minutes: number) => void;
}

export function DayView({ day, events, onSelectEvent, onCreateAtTime }: DayViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!scrollRef.current) return;
        const now = new Date();
        const currentHour = now.getHours();
        const scrollTarget = Math.max(0, (currentHour - DAY_START_HOUR - 1) * HOUR_HEIGHT);
        scrollRef.current.scrollTop = scrollTarget;
    }, []);

    const allDay = allDayEventsForDay(events, day);

    return (
        <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex border-b bg-card z-10 shrink-0">
                <div style={{ width: 56 }} className="shrink-0 border-r border-border/30" />
                <div className="flex-1">
                    <DayColumnHeader day={day} />
                </div>
            </div>

            {/* All-day bar */}
            {allDay.length > 0 && (
                <div className="flex border-b shrink-0">
                    <div style={{ width: 56 }} className="shrink-0 border-r border-border/30 flex items-center justify-end pr-2">
                        <span className="text-[10px] text-muted-foreground">dia todo</span>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1 p-1 min-h-[28px]">
                        {allDay.map((event) => (
                            <button
                                key={event.id}
                                type="button"
                                onClick={() => onSelectEvent(event.id)}
                                className="text-[11px] font-medium px-2 py-0.5 rounded bg-primary/10 text-primary
                  hover:bg-primary/20 transition-colors"
                            >
                                {event.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Time grid */}
            <div ref={scrollRef} className="flex overflow-y-auto overflow-x-hidden flex-1">
                <TimeGutter />
                <div className="flex-1">
                    <DayColumn
                        day={day}
                        events={events}
                        onSelectEvent={onSelectEvent}
                        onCreateAtTime={onCreateAtTime}
                    />
                </div>
            </div>
        </div>
    );
}
