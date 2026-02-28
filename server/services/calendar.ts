import { config } from '../config';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEventTime {
  dateTime: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: CalendarEventTime;
  end?: CalendarEventTime;
  htmlLink?: string;
  location?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  location?: string;
}

interface ListEventsResponse {
  items?: GoogleCalendarEvent[];
}

/**
 * Make an authenticated request to the Google Calendar API.
 * Throws on non-2xx responses so callers don't silently consume errors.
 */
export async function calendarRequest<T = unknown>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`[Calendar ${res.status}] Request failed with non-JSON response`);
    }
    return {} as T;
  }

  if (!res.ok) {
    const message =
      (data as { error?: { message?: string } })?.error?.message ||
      `Calendar API error ${res.status}`;
    throw new Error(`[Calendar ${res.status}] ${message}`);
  }

  return data as T;
}

function toClientEvent(e: GoogleCalendarEvent): CalendarEvent {
  const startDateTime = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : undefined);
  const endDateTime = e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00Z` : undefined);

  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    htmlLink: e.htmlLink,
    location: e.location,
    start: startDateTime
      ? {
          dateTime: startDateTime,
          timeZone: e.start?.timeZone || config.nodeEnv === 'production' ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      : undefined,
    end: endDateTime
      ? {
          dateTime: endDateTime,
          timeZone: e.end?.timeZone || config.nodeEnv === 'production' ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      : undefined,
  };
}

export async function listEvents(
  token: string,
  {
    timeMin,
    timeMax,
    maxResults = 50,
  }: { timeMin?: string; timeMax?: string; maxResults?: number },
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams();
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');
  params.set('maxResults', String(maxResults));
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);

  const data = await calendarRequest<ListEventsResponse>(
    token,
    `/calendars/primary/events?${params.toString()}`,
  );

  const items = data.items ?? [];
  return items.map(toClientEvent);
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  location?: string;
}

export async function createEvent(token: string, input: CreateEventInput): Promise<CalendarEvent> {
  const { summary, description, startDateTime, endDateTime, timeZone, location } = input;

  const body = {
    summary,
    description,
    location,
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
  };

  const created = await calendarRequest<GoogleCalendarEvent>(token, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return toClientEvent(created);
}

