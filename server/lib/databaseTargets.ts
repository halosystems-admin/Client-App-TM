/**
 * Safe, non-secret labels for configured Postgres targets.
 * Main app session/auth uses DATABASE_URL only — never import getScribePool here.
 */

export type DatabaseHostKind = 'aws-rds' | 'supabase' | 'local' | 'unknown' | 'unset';

export type DatabaseTargetSummary = {
  configured: boolean;
  hostKind: DatabaseHostKind;
  /** Safe label for logs, e.g. "supabase-pooler (eu-west-1)" */
  label: string;
};

function parseHost(connectionString: string): string | null {
  try {
    const normalized = connectionString.replace(/^postgres(ql)?:\/\//i, 'https://');
    const url = new URL(normalized);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function classifyDatabaseHost(hostname: string | null): DatabaseHostKind {
  if (!hostname) return 'unset';
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return 'local';
  }
  if (host.includes('supabase.com') || host.includes('supabase.co')) {
    return 'supabase';
  }
  if (host.includes('rds.amazonaws.com') || host.includes('amazonaws.com')) {
    return 'aws-rds';
  }
  return 'unknown';
}

export function describeDatabaseTarget(connectionString: string | undefined): DatabaseTargetSummary {
  const trimmed = typeof connectionString === 'string' ? connectionString.trim() : '';
  if (!trimmed) {
    return { configured: false, hostKind: 'unset', label: 'not configured' };
  }

  const hostname = parseHost(trimmed);
  const hostKind = classifyDatabaseHost(hostname);
  const label =
    hostKind === 'supabase'
      ? `supabase (${hostname || 'unknown-host'})`
      : hostKind === 'aws-rds'
        ? `aws-rds (${hostname || 'unknown-host'})`
        : hostKind === 'local'
          ? `local (${hostname || 'localhost'})`
          : `postgres (${hostname || 'unknown-host'})`;

  return { configured: true, hostKind, label };
}

export function getMainDatabaseConnectionString(): string {
  return (process.env.DATABASE_URL || '').trim();
}

export function getMainDatabaseTarget(): DatabaseTargetSummary {
  return describeDatabaseTarget(getMainDatabaseConnectionString());
}
