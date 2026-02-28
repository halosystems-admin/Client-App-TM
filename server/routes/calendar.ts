import { Router, Request, Response } from 'express';
import { listEvents, createEvent } from '../services/calendar';

const router = Router();

router.get('/events', async (req: Request, res: Response) => {
  const accessToken = req.session.accessToken;

  if (!accessToken) {
    res.status(401).json({ error: 'Not authenticated. Please sign in.' });
    return;
  }

  const { timeMin, timeMax, maxResults } = req.query;

  try {
    const events = await listEvents(accessToken, {
      timeMin: typeof timeMin === 'string' ? timeMin : undefined,
      timeMax: typeof timeMax === 'string' ? timeMax : undefined,
      maxResults:
        typeof maxResults === 'string' && !Number.isNaN(Number(maxResults))
          ? Number(maxResults)
          : undefined,
    });

    res.json({ events });
  } catch (err) {
    console.error('Failed to list calendar events:', err);
    res.status(500).json({ error: 'Failed to load calendar events. Please try again.' });
  }
});

router.post('/events', async (req: Request, res: Response) => {
  const accessToken = req.session.accessToken;

  if (!accessToken) {
    res.status(401).json({ error: 'Not authenticated. Please sign in.' });
    return;
  }

  const { summary, description, startDateTime, endDateTime, timeZone, location } = req.body ?? {};

  if (!summary || !startDateTime || !endDateTime) {
    res.status(400).json({ error: 'summary, startDateTime, and endDateTime are required.' });
    return;
  }

  try {
    const event = await createEvent(accessToken, {
      summary: String(summary),
      description: description ? String(description) : undefined,
      startDateTime: String(startDateTime),
      endDateTime: String(endDateTime),
      timeZone: timeZone ? String(timeZone) : undefined,
      location: location ? String(location) : undefined,
    });

    res.status(201).json({ event });
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    res.status(500).json({ error: 'Failed to create event. Please try again.' });
  }
});

export default router;

