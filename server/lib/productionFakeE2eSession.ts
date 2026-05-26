/**
 * BC-6E production fake-patient E2E session gate (server-side).
 * Fail-closed; never logs tokens or connection strings.
 */

export const APPROVED_PRODUCTION_FAKE_E2E_PRACTICE_ID =
  '77777777-7777-7777-7777-777777777777';

export const PRODUCTION_FAKE_E2E_SESSION_HEADER = 'x-halo-scribe-production-fake-e2e-session';
export const PRODUCTION_FAKE_E2E_TOKEN_HEADER = 'x-halo-scribe-production-fake-e2e-token';

const REHEARSAL_EMAIL = 'production-fake-e2e@halo.rehearsal.local';
const REHEARSAL_USER_ID = 'production-fake-e2e-runner';

function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export type ProductionFakeE2eSessionRequest = {
  practiceId: string;
  sessionHeader: string;
  tokenHeader: string;
};

/**
 * @returns {string[]} refusal reasons (empty = allow)
 */
export function evaluateProductionFakeE2eSessionAllow(
  env: NodeJS.ProcessEnv,
  req: ProductionFakeE2eSessionRequest,
  { isProductionRuntime }: { isProductionRuntime: boolean }
): string[] {
  const errors: string[] = [];

  if (!isProductionRuntime) {
    errors.push('Refused: production fake E2E session route is production-runtime only.');
  }

  if (env.HALO_SCRIBE_PRODUCTION_FAKE_E2E_ALLOW_SESSION !== '1') {
    errors.push(
      'Refused: HALO_SCRIBE_PRODUCTION_FAKE_E2E_ALLOW_SESSION must be "1" on the API server.'
    );
  }

  const expectedToken = (env.HALO_SCRIBE_PRODUCTION_FAKE_E2E_SESSION_TOKEN || '').trim();
  if (!expectedToken) {
    errors.push(
      'Refused: HALO_SCRIBE_PRODUCTION_FAKE_E2E_SESSION_TOKEN must be set on the API server.'
    );
  }

  if (req.sessionHeader !== '1') {
    errors.push(
      `Refused: request header ${PRODUCTION_FAKE_E2E_SESSION_HEADER} must be "1".`
    );
  }

  if (!req.practiceId || !isPostgresUuid(req.practiceId)) {
    errors.push('Refused: practiceId must be a valid Postgres UUID.');
  } else if (req.practiceId.toLowerCase() !== APPROVED_PRODUCTION_FAKE_E2E_PRACTICE_ID) {
    errors.push('Refused: practiceId must match approved production pilot practice UUID.');
  }

  if (expectedToken && req.tokenHeader !== expectedToken) {
    errors.push(
      `Refused: request header ${PRODUCTION_FAKE_E2E_TOKEN_HEADER} does not match server token (values not logged).`
    );
  }

  return errors;
}

export function rehearsalSessionIdentity(practiceId: string): {
  email: string;
  userId: string;
  practiceId: string;
} {
  return {
    email: REHEARSAL_EMAIL,
    userId: REHEARSAL_USER_ID,
    practiceId,
  };
}
