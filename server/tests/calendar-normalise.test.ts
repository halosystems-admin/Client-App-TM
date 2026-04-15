import { __test__normaliseGoogleEvent } from '../services/calendar';

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

function run(): void {
	const fullEvent = __test__normaliseGoogleEvent({
		id: 'evt-1',
		summary: 'Ward Round',
		description: 'Morning review',
		location: 'Ward 5',
		status: 'confirmed',
		start: { dateTime: '2026-04-15T08:00:00.000Z', timeZone: 'UTC' },
		end: { dateTime: '2026-04-15T08:30:00.000Z', timeZone: 'UTC' },
		extendedProperties: {
			private: {
				patientId: 'p-123',
				customFlag: 'yes',
			},
		},
		attachments: [
			{
				fileId: 'file-1',
				title: 'lab-result.pdf',
				fileUrl: 'https://drive.google.com/file/d/file-1/view',
				mimeType: 'application/pdf',
			},
		],
	});

	assert(!!fullEvent, 'Expected a mapped event for valid dateTime event.');
	assert(fullEvent?.id === 'evt-1', 'Expected event id to be preserved.');
	assert(fullEvent?.title === 'Ward Round', 'Expected summary to map to title.');
	assert(fullEvent?.patientId === 'p-123', 'Expected patientId from private extended props.');
	assert(fullEvent?.attachments?.length === 1, 'Expected one mapped attachment.');
	assert(
		fullEvent?.extendedProps?.customFlag === 'yes',
		'Expected private extended props to be preserved.'
	);

	const allDayEvent = __test__normaliseGoogleEvent({
		id: 'evt-2',
		summary: 'All-day booking',
		start: { date: '2026-04-16' },
		end: { date: '2026-04-17' },
	});

	assert(!!allDayEvent, 'Expected date-based event to map to ISO start/end.');
	assert(
		typeof allDayEvent?.start === 'string' && allDayEvent.start.includes('T'),
		'Expected mapped start to be an ISO timestamp.'
	);

	const cancelled = __test__normaliseGoogleEvent({
		id: 'evt-3',
		status: 'cancelled',
		start: { dateTime: '2026-04-16T10:00:00.000Z' },
		end: { dateTime: '2026-04-16T10:30:00.000Z' },
	});
	assert(cancelled === null, 'Expected cancelled events to be filtered out.');

	const missingTimes = __test__normaliseGoogleEvent({
		id: 'evt-4',
		summary: 'Invalid',
		start: {},
		end: {},
	});
	assert(missingTimes === null, 'Expected events without times to be rejected.');

	console.log('calendar-normalise tests passed');
}

run();

