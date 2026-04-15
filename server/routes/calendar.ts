import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  listTodayEvents,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  updateEventAttachments,
} from '../services/calendar';
import { fetchAllFilesInFolder, extractTextFromFile } from '../services/drive';
import { generateText } from '../services/gemini';
import { summaryPrompt } from '../utils/prompts';

const router = Router();
router.use(requireAuth);

type CalendarEventsQueryInput = {
  start?: string;
  end?: string;
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
};

type CalendarCreateBodyInput = {
  title?: string;
  summary?: string;
  description?: string;
  start?: string;
  end?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  location?: string;
  patientId?: string;
  attachmentFileIds?: string[];
};

export function __test__normaliseCalendarEventsQuery(input: CalendarEventsQueryInput): {
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
} {
  const timeMin = input.start || input.timeMin;
  const timeMax = input.end || input.timeMax;
  return {
    ...(timeMin ? { timeMin } : {}),
    ...(timeMax ? { timeMax } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
  };
}

export function __test__normaliseCalendarCreateBody(input: CalendarCreateBodyInput): {
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  timeZone?: string;
  location?: string;
  patientId?: string;
  attachmentFileIds?: string[];
} {
  const title = input.title || input.summary;
  const start = input.start || input.startDateTime;
  const end = input.end || input.endDateTime;
  return {
    ...(title ? { title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.patientId ? { patientId: input.patientId } : {}),
    ...(input.attachmentFileIds ? { attachmentFileIds: input.attachmentFileIds } : {}),
  };
}

// GET /api/calendar/today — today's bookings from Google Calendar
router.get('/today', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const events = await listTodayEvents(token);
    res.json({ events });
  } catch (err) {
    console.error('Calendar today error:', err);
    res.status(500).json({ error: 'Failed to fetch today\u2019s events.' });
  }
});

// GET /api/calendar/events?start=...&end=...&timeZone=...
router.get('/events', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const normalized = __test__normaliseCalendarEventsQuery(req.query as {
      start?: string;
      end?: string;
      timeZone?: string;
      timeMin?: string;
      timeMax?: string;
    });

    if (!normalized.timeMin || !normalized.timeMax) {
      res.status(400).json({ error: 'start and end query parameters are required.' });
      return;
    }

    const events = await listEvents(token, {
      timeMin: normalized.timeMin,
      timeMax: normalized.timeMax,
      timeZone: normalized.timeZone,
    });
    res.json({ events });
  } catch (err) {
    console.error('Calendar events range error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar events.' });
  }
});

// GET /api/calendar/events/:id — fetch a single event
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const eventId = req.params.id as string;
    const event = await getEventById(token, eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    res.json({ event });
  } catch (err) {
    console.error('Calendar event fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar event.' });
  }
});

// POST /api/calendar/events — create a new event
router.post('/events', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const normalized = __test__normaliseCalendarCreateBody(req.body as {
      title?: string;
      summary?: string;
      description?: string;
      start?: string;
      end?: string;
      startDateTime?: string;
      endDateTime?: string;
      timeZone?: string;
      location?: string;
      patientId?: string;
      attachmentFileIds?: string[];
    });

    if (!normalized.title || !normalized.start || !normalized.end) {
      res.status(400).json({ error: 'title, start, and end are required.' });
      return;
    }

    const event = await createEvent(token, {
      title: normalized.title,
      description: normalized.description,
      start: normalized.start,
      end: normalized.end,
      timeZone: normalized.timeZone,
      location: normalized.location,
      patientId: normalized.patientId,
      attachmentFileIds: normalized.attachmentFileIds,
    });

    res.status(201).json({ event });
  } catch (err) {
    console.error('Calendar create event error:', err);
    res.status(500).json({ error: 'Failed to create calendar event.' });
  }
});

// PATCH /api/calendar/events/:id — partial update (time, title, etc.)
router.patch('/events/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const eventId = req.params.id as string;
    const {
      title,
      description,
      start,
      end,
      timeZone,
      location,
      patientId,
      attachmentFileIds,
    } = req.body as {
      title?: string;
      description?: string;
      start?: string;
      end?: string;
      timeZone?: string;
      location?: string;
      patientId?: string;
      attachmentFileIds?: string[];
    };

    const event = await updateEvent(token, eventId, {
      title,
      description,
      start,
      end,
      timeZone,
      location,
      patientId,
      attachmentFileIds,
    });

    res.json({ event });
  } catch (err) {
    console.error('Calendar update event error:', err);
    res.status(500).json({ error: 'Failed to update calendar event.' });
  }
});

// DELETE /api/calendar/events/:id — delete/cancel an event
router.delete('/events/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const eventId = req.params.id as string;
    await deleteEvent(token, eventId);
    res.status(204).send();
  } catch (err) {
    console.error('Calendar delete event error:', err);
    res.status(500).json({ error: 'Failed to delete calendar event.' });
  }
});

// POST /api/calendar/events/:id/attachments — update Drive attachments for an event
router.post('/events/:id/attachments', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const eventId = req.params.id as string;
    const { fileIds } = req.body as { fileIds?: string[] };

    if (!fileIds || !Array.isArray(fileIds)) {
      res.status(400).json({ error: 'fileIds array is required.' });
      return;
    }

    const event = await updateEventAttachments(token, eventId, fileIds);
    res.json({ event });
  } catch (err) {
    console.error('Calendar update attachments error:', err);
    res.status(500).json({ error: 'Failed to update event attachments.' });
  }
});

// POST /api/calendar/prep-note — light prep note for a patient before the visit
router.post('/prep-note', async (req: Request, res: Response) => {
  try {
    const { patientId, patientName } = req.body as {
      patientId?: string;
      patientName?: string;
    };

    if (!patientId || typeof patientId !== 'string') {
      res.status(400).json({ error: 'patientId is required.' });
      return;
    }

    const token = req.session.accessToken;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    // Fetch all files in the patient's folder and build a light context.
    // Note: fetchAllFilesInFolder currently returns { id, name, mimeType } without dates,
    // so we approximate \"recent\" based on name patterns only.
    const sorted = await fetchAllFilesInFolder(token, patientId);

    const recentNotes = sorted.filter(f =>
      /note/i.test(f.name)
    ).slice(0, 2);

    const recentLabs = sorted.filter(f =>
      /lab|blood|result/i.test(f.name)
    ).slice(0, 3);

    const otherFiles = sorted
      .filter(f => !recentNotes.includes(f) && !recentLabs.includes(f))
      .slice(0, 5);

    const chosenFiles = [...recentNotes, ...recentLabs, ...otherFiles];

    let fileContext = chosenFiles
      .map(f => `- ${f.name}`)
      .join('\\n');

    // Try to include short snippets of content for richer prep (small token budget)
    const contentParts: string[] = [];
    for (const file of chosenFiles.slice(0, 5)) {
      try {
        const text = await extractTextFromFile(token, file, 1200);
        if (text.trim()) {
          contentParts.push(`--- ${file.name} ---\\n${text}`);
        }
      } catch {
        // ignore extraction failures; still have filenames
      }
    }

    if (contentParts.length > 0) {
      fileContext += '\\n\\nFile Contents:\\n' + contentParts.join('\\n\\n');
    }

    const safeName = patientName || 'the patient';
    const prepText = await generateText(
      summaryPrompt(safeName, fileContext) +
      '\\n\\nPlease structure this specifically as a concise pre-visit prep note for the clinician, highlighting key history, active problems, medications, allergies, and pending follow-ups.',
      req.session.userEmail || req.session.userId || 'calendar-prep',
      'Gemini-Calendar-Prep',
      false
    );

    res.json({ prepNote: prepText });
  } catch (err) {
    console.error('Prep note error:', err);
    res.status(500).json({ error: 'Failed to generate prep note.' });
  }
});

export default router;

