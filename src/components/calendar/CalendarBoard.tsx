import { useRef } from 'react';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
  EventResizeDoneArg,
} from '@fullcalendar/core';

import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface CalendarBoardProps {
  events: CalendarEvent[];
  loading?: boolean;
  onRangeChange: (start: string, end: string) => void;
  onCreateFromSelection: (selection: { start: string; end: string; allDay: boolean }) => void;
  onSelectEvent: (eventId: string) => void;
  onMoveOrResizeEvent: (payload: {
    id: string;
    start_time: string;
    end_time: string;
    all_day: boolean;
  }) => Promise<void>;
}

const STATUS_COLORS: Record<CalendarEvent['status'], { bg: string; border: string }> = {
  scheduled: { bg: '#2563eb', border: '#1d4ed8' },
  confirmed: { bg: '#059669', border: '#047857' },
  cancelled: { bg: '#dc2626', border: '#b91c1c' },
  done: { bg: '#4b5563', border: '#374151' },
  no_show: { bg: '#d97706', border: '#b45309' },
};

const fallbackEndDate = (start: Date, allDay: boolean): Date => {
  const delta = allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(start.getTime() + delta);
};

const toEventInput = (event: CalendarEvent): EventInput => {
  const colors = STATUS_COLORS[event.status];
  return {
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    allDay: event.all_day,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    extendedProps: {
      status: event.status,
      source: event.source,
      lead_id: event.lead_id,
      contact_id: event.contact_id,
    },
  };
};

export function CalendarBoard({
  events,
  loading = false,
  onRangeChange,
  onCreateFromSelection,
  onSelectEvent,
  onMoveOrResizeEvent,
}: CalendarBoardProps) {
  const lastRangeRef = useRef<string | null>(null);

  const handleDatesSet = (arg: DatesSetArg) => {
    const nextRangeKey = `${arg.startStr}|${arg.endStr}`;
    if (lastRangeRef.current === nextRangeKey) {
      return;
    }

    lastRangeRef.current = nextRangeKey;
    onRangeChange(arg.startStr, arg.endStr);
  };

  const handleSelect = (arg: DateSelectArg) => {
    onCreateFromSelection({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
      allDay: arg.allDay,
    });
  };

  const handleEventClick = (arg: EventClickArg) => {
    onSelectEvent(arg.event.id);
  };

  const persistEventTiming = async (
    arg: EventDropArg | EventResizeDoneArg
  ) => {
    const { event } = arg;
    const start = event.start;

    if (!start) {
      arg.revert();
      return;
    }

    const end = event.end ?? fallbackEndDate(start, event.allDay);

    try {
      await onMoveOrResizeEvent({
        id: event.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: event.allDay,
      });
    } catch (error) {
      console.error('Failed to persist moved event:', error);
      arg.revert();
    }
  };

  return (
    <div className="relative rounded-lg border bg-card p-3 sm:p-4 h-[72vh]">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locales={[ptBrLocale]}
        locale="pt-br"
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        }}
        buttonText={{
          today: 'Hoje',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          list: 'Agenda',
        }}
        events={events.map(toEventInput)}
        editable
        selectable
        selectMirror
        dayMaxEvents
        nowIndicator
        height="100%"
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
        eventDrop={persistEventTiming}
        eventResize={persistEventTiming}
      />

      {loading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg flex items-center justify-center text-sm font-medium">
          Carregando eventos...
        </div>
      )}
    </div>
  );
}
