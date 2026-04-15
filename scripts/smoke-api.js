#!/usr/bin/env node

const { spawn } = require('node:child_process');

const BASE_URL = process.env.HALO_SMOKE_BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = Number(process.env.HALO_SMOKE_TIMEOUT_MS || 8000);

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const npmCliPath = process.env.npm_execpath;

    if (!npmCliPath) {
      reject(new Error('npm executable path is not available in this environment'));
      return;
    }

    const child = spawn(process.execPath, [npmCliPath, 'run', scriptName], {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script failed: npm run ${scriptName} (exit ${code})`));
      }
    });
  });
}

async function checkEndpoint(pathname, options = {}) {
  const url = `${BASE_URL}${pathname}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    const status = response.status;
    const isReachable = status !== 404 && status < 500;

    if (!isReachable) {
      throw new Error(`Endpoint check failed for ${pathname}: HTTP ${status}`);
    }

    console.log(`PASS ${pathname} -> HTTP ${status}`);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Endpoint check timed out for ${pathname} after ${REQUEST_TIMEOUT_MS}ms`);
    }

    throw new Error(`Endpoint check failed for ${pathname}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log('== HALO API smoke checks ==');
  console.log(`Base URL: ${BASE_URL}`);

  console.log('\n1) Build server');
  await runNpmScript('build:server');

  console.log('\n2) Calendar tests');
  await runNpmScript('test:calendar');
  await runNpmScript('test:calendar:routes');

  console.log('\n3) API reachability checks');
  await checkEndpoint('/api/health');
  await checkEndpoint('/api/drive/admissions-board');

  console.log('\nAll smoke checks passed.');
}

main().catch((error) => {
  console.error(`\nSmoke checks failed. ${error.message}`);
  process.exit(1);
});
