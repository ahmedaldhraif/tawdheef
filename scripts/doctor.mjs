import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationStatus, runGws } from '../server/integrations.mjs';

export async function doctor(options = {}) {
  const report = await integrationStatus(options);
  let setup;
  if (report.app.running && report.app.sameDataDirectory) {
    try {
      const response = await fetch(report.app.url + '/api/setup-status', { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const value = await response.json();
        if (Array.isArray(value.steps) && value.nextStep && typeof value.ready === 'boolean') setup = value;
      }
    } catch { /* The existing runtime report remains useful during an upgrade. */ }
  }
  if (options.probe === true) {
    const google = report.integrations.find(item => item.id === 'google-cli');
    if (google.ready) {
      try {
        const status = await runGws(['auth', 'status'], options);
        google.authentication = status.auth_method && status.auth_method !== 'none' ? 'credentials_present' : 'sign_in_required';
        google.authenticationVerified = false;
      } catch { google.authentication = 'check_failed'; }
    }
  }
  return {
    ...report,
    ...(setup ? { setup } : {}),
    nextSteps: [
      ...(!report.runtime.supported ? ['Install Node.js 24 or newer, then run setup again.'] : []),
      ...(!report.app.running ? ['Run npm start to open the local tracker and enable provider actions.'] : !report.app.sameDataDirectory ? ['The running tracker uses a different data folder. Match APPLY_TRACKER_DATA and the port before provider actions.'] : []),
      ...(setup ? [`${setup.nextStep.title}: ${setup.nextStep.detail}`] : ['Open Connections to choose your accounts. Your agent can follow docs/FIRST-RUN.md. Email and calendar are optional.']),
    ],
    note: 'Installed tools and saved credentials do not prove account access or a successful send. No email, application or sign-in was started by this check.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--probe', '--json'].includes(arg))) {
    process.stderr.write('Use node scripts/doctor.mjs [--probe] [--json].\n');
    process.exitCode = 1;
  } else {
    doctor({ probe: args.includes('--probe') }).then(report => {
      process.stdout.write(`${JSON.stringify({ ok: report.runtime.supported, data: report }, null, 2)}\n`);
      if (!report.runtime.supported) process.exitCode = 1;
    }).catch(() => { process.stderr.write('Setup could not be checked. Verify the local data directory and run npm run setup.\n'); process.exitCode = 1; });
  }
}
