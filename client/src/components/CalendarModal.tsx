import React, { useEffect, useState } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import { fetchCalendarEvents, createCalendarEvent, CalendarEventDto, ApiError } from '../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

interface NewEventForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  location: string;
}

const getDefaultForm = (): NewEventForm => ({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '09:30',
  description: '',
  location: '',
});

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

const addWeeks = (date: Date, weeks: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diff = d.getTime() - yearStart.getTime();
  return Math.ceil((diff / 86400000 + 1) / 7);
};

const buildCalendarWeeks = (month: Date): Date[][] => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstDay = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat), Sunday-start grid

  // Start grid on the Sunday of the week that contains the 1st of the month
  const startDate = new Date(year, monthIndex, 1 - firstDay);
  const weeks: Date[][] = [];
  let current = new Date(startDate);

  // Always show 6 weeks so the month view has a consistent height
  for (let w = 0; w < 6; w += 1) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
};

export const CalendarModal: React.FC<Props> = ({ isOpen, onClose, userEmail }) => {
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewEventForm>(getDefaultForm);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(today));
  const [jumpedDate, setJumpedDate] = useState<Date | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showUpcomingPanel, setShowUpcomingPanel] = useState(false);
  const [jumpExpression, setJumpExpression] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const inSevenDays = new Date(startOfDay);
        inSevenDays.setDate(inSevenDays.getDate() + 7);

        const eventsList = await fetchCalendarEvents({
          timeMin: startOfDay.toISOString(),
          timeMax: inSevenDays.toISOString(),
          maxResults: 50,
        });
        setEvents(eventsList);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Failed to load calendar events.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen]);

  // When opening the create panel, prefill date with the calendar's selected date
  useEffect(() => {
    if (!showCreatePanel) return;
    const selected = jumpedDate ?? today;
    const yyyy = selected.getFullYear();
    const mm = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    setForm((prev) => ({ ...prev, date: `${yyyy}-${mm}-${dd}` }));
  }, [showCreatePanel]);

  const handleChange =
    (field: keyof NewEventForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.startTime || !form.endTime) return;

    setSubmitting(true);
    setError(null);
    try {
      const startDateTime = new Date(`${form.date}T${form.startTime}`);
      const endDateTime = new Date(`${form.date}T${form.endTime}`);

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const created = await createCalendarEvent({
        summary: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        timeZone,
      });

      setEvents((prev) => [created, ...prev]);
      setForm(getDefaultForm());
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Failed to create event.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    setCurrentMonth((prev) => addMonths(prev, delta));
  };

  const parseJumpExpression = (expression: string): Date | null => {
    const value = expression.toLowerCase().trim();
    if (!value) return null;

    const match = value.match(/(\d+)\s*(day|days|week|weeks|month|months)/);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) return null;

    if (unit === 'day' || unit === 'days') {
      return addDays(today, amount);
    }
    if (unit === 'week' || unit === 'weeks') {
      return addWeeks(today, amount);
    }
    return addMonths(today, amount);
  };

  const handleJump = () => {
    const target = parseJumpExpression(jumpExpression);
    if (!target) {
      setError('Could not understand that jump. Try e.g. "4 weeks", "10 days", or "2 months".');
      return;
    }
    setError(null);
    setCurrentMonth(startOfMonth(target));
    setJumpedDate(target);
  };

  const handleToday = () => {
    setCurrentMonth(startOfMonth(today));
    setJumpedDate(null);
  };

  if (!isOpen) return null;

  const openInGoogleCalendar = () => {
    window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer');
  };

  const weeks = buildCalendarWeeks(currentMonth);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="halo-calendar-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-500/20 rounded-xl flex items-center justify-center">
              <CalendarIcon size={20} className="text-teal-400" />
            </div>
            <div>
              <h2 id="halo-calendar-title" className="text-white font-bold text-lg">
                Calendar
              </h2>
              <p className="text-xs text-slate-400">
                {userEmail ? `Showing events for ${userEmail}` : 'Google Calendar'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openInGoogleCalendar}
              className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-700 transition"
            >
              Open in Google <ExternalLink size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <div className="flex flex-col md:flex-row gap-6 items-stretch">
            {/* Left column: month calendar */}
            <div className="flex-1 min-w-[260px] flex flex-col">
              <div className="bg-white rounded-2xl shadow-md px-6 py-5 flex flex-col min-h-[340px]">
                {/* Card header: Select Date | dynamic date | teal icon */}
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Select Date
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Choose a day to anchor your schedule.
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 shrink-0">
                    {(jumpedDate ?? today).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
                    <CalendarIcon size={20} className="text-teal-500" />
                  </div>
                </div>

                {/* Month label with inline navigation */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => handleMonthChange(-1)}
                    className="w-7 h-7 rounded-full border border-slate-200 text-slate-600 text-xs flex items-center justify-center hover:bg-slate-100 hover:text-slate-800 transition"
                    aria-label="Previous month"
                  >
                    {'<'}
                  </button>
                  <p className="text-sm font-semibold text-slate-700">
                    {currentMonth.toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleMonthChange(1)}
                    className="w-7 h-7 rounded-full border border-slate-200 text-slate-600 text-xs flex items-center justify-center hover:bg-slate-100 hover:text-slate-800 transition"
                    aria-label="Next month"
                  >
                    {'>'}
                  </button>
                </div>

                {/* Day of week headers with week number column */}
                <div className="grid grid-cols-8 gap-1 text-[11px] font-semibold text-slate-500 mb-2 px-1">
                  <div className="text-center text-slate-400">Week</div>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="text-center uppercase tracking-wide">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Weeks */}
                <div className="space-y-1">
                  {weeks.map((week) => {
                    const weekNumber = getISOWeekNumber(week[0]);
                    return (
                      <div
                        key={week[0].toISOString()}
                        className="grid grid-cols-8 gap-1 items-center px-1"
                      >
                        <div className="text-[10px] text-slate-400 text-center font-medium">
                          {weekNumber}
                        </div>
                        {week.map((day) => {
                          const isCurrentMonth =
                            day.getMonth() === currentMonth.getMonth() &&
                            day.getFullYear() === currentMonth.getFullYear();
                          const isToday = isSameDay(day, today);
                          const isJumped = jumpedDate ? isSameDay(day, jumpedDate) : false;

                          let cellClasses =
                            'h-8 rounded-lg flex items-center justify-center text-xs cursor-pointer border transition-colors ';

                          if (isJumped) {
                            cellClasses +=
                              'bg-amber-100 border-amber-400 text-amber-900 font-semibold';
                          } else if (isToday) {
                            cellClasses +=
                              'bg-teal-600 text-white border-teal-600 font-semibold shadow-sm';
                          } else if (isCurrentMonth) {
                            cellClasses +=
                              'bg-white border-slate-200 text-slate-800 hover:bg-slate-100';
                          } else {
                            cellClasses +=
                              'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200';
                          }

                          return (
                            <button
                              key={day.toISOString()}
                              type="button"
                              className={cellClasses}
                              onClick={() => setJumpedDate(day)}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right column: controls & panels */}
            <div className="w-full md:w-72 flex flex-col gap-3">
              {/* Date jumper + Today */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
                  Jump to date
                </p>
                <input
                  type="text"
                  value={jumpExpression}
                  onChange={(e) => setJumpExpression(e.target.value)}
                  className="w-full px-3 py-2 mb-2 rounded-lg border border-slate-200 text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-100 outline-none placeholder:italic placeholder:text-slate-400"
                  placeholder="jump to date..."
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleJump}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 transition"
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <button
                type="button"
                onClick={() => setShowCreatePanel((prev) => !prev)}
                className="w-full px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 transition"
              >
                <Plus size={16} />
                Create New Event
              </button>

              <button
                type="button"
                onClick={() => setShowUpcomingPanel((prev) => !prev)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
              >
                <Clock size={16} />
                Upcoming Events (Next 7 Days)
              </button>

              {/* Create event panel */}
              {showCreatePanel && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      New event
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Add an appointment to your Google Calendar.
                    </p>
                  </div>
                  <div className="p-4">
                    {error && (
                      <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
                        {error}
                      </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                          Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={form.title}
                          onChange={handleChange('title')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                          placeholder="e.g. Follow-up consultation"
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <Clock size={12} className="text-teal-500" />
                          When
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                              <CalendarIcon size={11} className="text-slate-400" />
                              Date
                            </label>
                            <input
                              type="date"
                              value={form.date}
                              onChange={handleChange('date')}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                              <Clock size={11} className="text-slate-400" />
                              Start
                            </label>
                            <input
                              type="time"
                              value={form.startTime}
                              onChange={handleChange('startTime')}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                              <Clock size={11} className="text-slate-400" />
                              End
                            </label>
                            <input
                              type="time"
                              value={form.endTime}
                              onChange={handleChange('endTime')}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                          <MapPin size={11} className="text-slate-400" />
                          Location
                        </label>
                        <input
                          type="text"
                          value={form.location}
                          onChange={handleChange('location')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:italic placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                          placeholder="Optional"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium text-slate-600">
                          Notes
                        </label>
                        <textarea
                          value={form.description}
                          onChange={handleChange('description')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:italic placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition resize-none min-h-[72px]"
                          placeholder="Optional clinical notes or context"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={
                          submitting ||
                          !form.title.trim() ||
                          !form.date ||
                          !form.startTime ||
                          !form.endTime
                        }
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-600/20 transition"
                      >
                        {submitting ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Plus size={18} />
                        )}
                        {submitting ? 'Creating event…' : 'Add to Calendar'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Upcoming events panel */}
              {showUpcomingPanel && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-teal-600" />
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Upcoming (next 7 days)
                    </p>
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                      <Loader2 size={18} className="animate-spin text-teal-500" />
                      <span className="text-xs">Loading events…</span>
                    </div>
                  ) : events.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">
                      No events found in the next 7 days.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {events.map((event) => {
                        const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                        const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                        const dateLabel = start
                          ? start.toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '';
                        const timeLabel =
                          start && end
                            ? `${start.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} – ${end.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : 'All day';

                        return (
                          <div
                            key={event.id}
                            className="flex items-start gap-3 p-2.5 rounded-lg bg-white border border-slate-100"
                          >
                            <div className="w-10 text-center">
                              <p className="text-[10px] uppercase text-slate-400 font-semibold">
                                {dateLabel.split(' ')[0]}
                              </p>
                              <p className="text-sm font-bold text-slate-700">
                                {start ? start.getDate() : ''}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">
                                {event.summary || '(No title)'}
                              </p>
                              <p className="text-[11px] text-slate-500 mb-0.5">{timeLabel}</p>
                              {event.location && (
                                <p className="text-[11px] text-slate-500 truncate">
                                  {event.location}
                                </p>
                              )}
                              {event.description && (
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                  {event.description}
                                </p>
                              )}
                              {event.htmlLink && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
                                  }
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700"
                                >
                                  Open in Google Calendar <ExternalLink size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={openInGoogleCalendar}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-teal-600 self-start"
              >
                Open full calendar <ExternalLink size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

