import { useMemo } from 'react';
import { format, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface MonthViewProps {
    weeks: Date[][];
    currentDate: Date;
    events: CalendarEvent[];
    onSelectEvent: (eventId: string) => void;
    onDayClick: (day: Date) => void;
}

const STATUS_DOT_COLORS: Record<CalendarEvent['status'], string> = {
    scheduled: '#4285F4',
    confirmed: '#0F9D58',
    cancelled: '#DB4437',
    done: '#9E9E9E',
    no_show: '#F4B400',
};

const MAX_VISIBLE_EVENTS = 3;

export function MonthView({ weeks, currentDate, events, onSelectEvent, onDayClick }: MonthViewProps) {
    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const event of events) {
            const dayKey = format(parseISO(event.start_time), 'yyyy-MM-dd');
            const existing = map.get(dayKey) || [];
            existing.push(event);
            map.set(dayKey, existing);
        }
        return map;
    }, [events]);

    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Day name headers */}
            <div className="grid grid-cols-7 border-b border-border/40 shrink-0">
                {dayNames.map((name) => (
                    <div
                        key={name}
                        className="text-center py-2 text-[11px] font-medium text-muted-foreground tracking-wider"
                    >
                        {name}
                    </div>
                ))}
            </div>

            {/* Weeks */}
            <div className="grid flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
                {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                        {week.map((day) => {
                            const dayKey = format(day, 'yyyy-MM-dd');
                            const dayEvents = eventsByDay.get(dayKey) || [];
                            const today = isToday(day);
                            const inMonth = isSameMonth(day, currentDate);
                            const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

                            return (
                                <div
                                    key={dayKey}
                                    className={`
                    border-r last:border-r-0 p-1 min-h-[80px] cursor-pointer
                    transition-colors duration-150 hover:bg-accent/30
                    ${!inMonth ? 'opacity-40' : ''}
                  `}
                                    onClick={() => onDayClick(day)}
                                >
                                    {/* Date number */}
                                    <div className="flex justify-center mb-0.5">
                                        <span
                                            className={`
                        text-xs font-medium flex items-center justify-center
                        ${today
                                                    ? 'bg-primary text-primary-foreground h-6 w-6 rounded-full'
                                                    : 'text-foreground h-6'
                                                }
                      `}
                                        >
                                            {format(day, 'd')}
                                        </span>
                                    </div>

                                    {/* Event labels */}
                                    <div className="flex flex-col gap-0.5">
                                        {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                                            <button
                                                key={event.id}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectEvent(event.id);
                                                }}
                                                className="flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded
                          hover:bg-accent/50 transition-colors truncate text-left w-full"
                                            >
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: STATUS_DOT_COLORS[event.status] }}
                                                />
                                                <span className="truncate">{event.title}</span>
                                            </button>
                                        ))}
                                        {overflow > 0 && (
                                            <span className="text-[10px] text-muted-foreground px-1 font-medium">
                                                +{overflow} mais
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
