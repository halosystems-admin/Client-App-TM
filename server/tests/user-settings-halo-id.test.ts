import { extractStoredHaloUserId } from '../services/userSettings';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(
    extractStoredHaloUserId({ haloUserId: '  102804285989670925434  ' }) === '102804285989670925434',
    'Expected stored HALO user ID to be trimmed.'
  );

  assert(
    extractStoredHaloUserId({ haloUserId: '' }) === undefined,
    'Expected blank HALO user ID to be treated as missing.'
  );

  assert(
    extractStoredHaloUserId({}) === undefined,
    'Expected missing HALO user ID to be undefined.'
  );

  assert(
    extractStoredHaloUserId(null) === undefined,
    'Expected null settings to produce undefined HALO user ID.'
  );

  console.log('user-settings-halo-id tests passed');
}

run();
