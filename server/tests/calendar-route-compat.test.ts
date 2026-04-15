import {
  __test__normaliseCalendarCreateBody,
  __test__normaliseCalendarEventsQuery,
} from '../routes/calendar';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  const newRange = __test__normaliseCalendarEventsQuery({
    start: '2026-04-15T00:00:00.000Z',
    end: '2026-04-16T00:00:00.000Z',
    timeZone: 'UTC',
  });
  assert(newRange.timeMin === '2026-04-15T00:00:00.000Z', 'Expected new start to map to timeMin.');
  assert(newRange.timeMax === '2026-04-16T00:00:00.000Z', 'Expected new end to map to timeMax.');
  assert(newRange.timeZone === 'UTC', 'Expected timeZone passthrough for new query shape.');

  const legacyRange = __test__normaliseCalendarEventsQuery({
    timeMin: '2026-04-15T01:00:00.000Z',
    timeMax: '2026-04-15T02:00:00.000Z',
  });
  assert(legacyRange.timeMin === '2026-04-15T01:00:00.000Z', 'Expected legacy timeMin preserved.');
  assert(legacyRange.timeMax === '2026-04-15T02:00:00.000Z', 'Expected legacy timeMax preserved.');

  const newCreate = __test__normaliseCalendarCreateBody({
    title: 'Ward Round',
    start: '2026-04-15T08:00:00.000Z',
    end: '2026-04-15T08:30:00.000Z',
    patientId: 'p-1',
    attachmentFileIds: ['f-1', 'f-2'],
  });
  assert(newCreate.title === 'Ward Round', 'Expected new title retained.');
  assert(newCreate.start === '2026-04-15T08:00:00.000Z', 'Expected new start retained.');
  assert(newCreate.end === '2026-04-15T08:30:00.000Z', 'Expected new end retained.');
  assert(newCreate.patientId === 'p-1', 'Expected patientId passthrough.');
  assert(newCreate.attachmentFileIds?.length === 2, 'Expected attachment ids passthrough.');

  const legacyCreate = __test__normaliseCalendarCreateBody({
    summary: 'Legacy booking',
    startDateTime: '2026-04-15T09:00:00.000Z',
    endDateTime: '2026-04-15T09:15:00.000Z',
  });
  assert(legacyCreate.title === 'Legacy booking', 'Expected legacy summary to map to title.');
  assert(legacyCreate.start === '2026-04-15T09:00:00.000Z', 'Expected legacy startDateTime to map to start.');
  assert(legacyCreate.end === '2026-04-15T09:15:00.000Z', 'Expected legacy endDateTime to map to end.');

  const mixedCreate = __test__normaliseCalendarCreateBody({
    title: 'New wins',
    summary: 'Old fallback',
    start: '2026-04-15T10:00:00.000Z',
    startDateTime: '2026-04-15T09:00:00.000Z',
    end: '2026-04-15T10:30:00.000Z',
    endDateTime: '2026-04-15T09:30:00.000Z',
  });
  assert(mixedCreate.title === 'New wins', 'Expected title to take precedence over summary.');
  assert(mixedCreate.start === '2026-04-15T10:00:00.000Z', 'Expected start to take precedence over startDateTime.');
  assert(mixedCreate.end === '2026-04-15T10:30:00.000Z', 'Expected end to take precedence over endDateTime.');

  console.log('calendar-route-compat tests passed');
}

run();
