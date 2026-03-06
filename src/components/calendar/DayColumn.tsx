import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isToday } from 'date-fns';
import { HOUR_HEIGHT, DAY_START_HOUR, DAY_END_HOUR, GRID_HEIGHT, layoutEventsForDay } from '@/hooks/useEventLayout';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface DayColumnProps {
    day: Date;
    events: CalendarEvent[];
    onSelectEvent: (eventId: string) => void;
    onCreateAtTime: (day: Date, hour: number, minutes: number) => void;
}

export function DayColumn({ day, events, onSelectEvent, onCreateAtTime }: DayColumnProps) {
    const today = isToday(day);
    const layouts = useMemo(() => layoutEventsForDay(events, day), [events, day]);

    const handleSlotClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const rawMinutes = (y / HOUR_HEIGHT) * 60 + DAY_START_HOUR * 60;
            // Snap to 15-min intervals
            const snapped = Math.round(rawMinutes / 15) * 15;
            const hour = Math.floor(snapped / 60);
            const minutes = snapped % 60;
            onCreateAtTime(day, hour, minutes);
        },
        [day, onCreateAtTime],
    );

    // Current time indicator
    const nowIndicator = useMemo(() => {
        if (!today) return null;
        const now = new Date();
        const minutesSinceStart = (now.getHours() * 60 + now.getMinutes()) - DAY_START_HOUR * 60;
        if (minutesSinceStart < 0 || minutesSinceStart > (DAY_END_HOUR - DAY_START_HOUR) * 60) return null;
        const top = (minutesSinceStart / 60) * HOUR_HEIGHT;
        return top;
    }, [today]);

    const hours: number[] = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
        hours.push(h);
    }

    return (
        <div
            className="relative border-l border-border/30 cursor-pointer"
            style={{ height: GRID_HEIGHT }}
            onClick={handleSlotClick}
        >
            {/* Hour grid lines */}
            {hours.map((hour) => (
                <div
                    key={hour}
                    className="absolute w-full border-t border-border/30"
                    style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
                >
                    {/* Half-hour line */}
                    <div
                        className="absolute w-full border-t border-border/15"
                        style={{ top: HOUR_HEIGHT / 2 }}
                    />
                </div>
            ))}

            {/* Events */}
            {layouts.map((layout) => (
                <EventBlock
                    key={layout.event.id}
                    layout={layout}
                    onClick={onSelectEvent}
                />
            ))}

            {/* Current time indicator */}
            {nowIndicator !== null && (
                <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowIndicator }}
                >
                    <div className="flex items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-[5px] shrink-0" />
                        <div className="h-[2px] w-full bg-red-500" />
                    </div>
                </div>
            )}
        </div>
    );
}
