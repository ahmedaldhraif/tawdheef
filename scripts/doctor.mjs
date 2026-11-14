import { integrationStatus } from '../server/integrations.mjs';
import { isDirectInvocation } from './is-direct.mjs';

export async function doctor(options = {}) {
  const mode = 'native';
  const report = await integrationStatus({ ...options, mode });
  let setup;
  if (report.app.running && report.app.sameDataDirectory) {
    try {
      const response = await fetch(report.app.url + '/api/setup-status', { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const value = await response.json();
        if ((Array.isArray(value.steps) || value.connectionMode === 'native') && value.nextStep && typeof value.ready === 'boolean') setup = value;
      }
    } catch { /* The existing runtime report remains useful during an upgrade. */ }
  }
  return {
    ...report,
    ...(setup ? { setup } : {}),
    nextSteps: [
      ...(!report.runtime.supported ? ['Install Node.js 24 or newer, then run setup again.'] : []),
      ...(!report.app.running ? ['Run npm start to open the local tracker.'] : !report.app.sameDataDirectory ? ['The running tracker uses a different data folder. Match APPLY_TRACKER_DATA and the port before starting a Run.'] : []),
      ...(setup ? [`${setup.nextStep.title}: ${setup.nextStep.detail}`] : ['Use Connections to copy a setup request into your existing Codex or Claude Code client. Its own tools handle external accounts and browser access.']),
    ],
    note: 'Installed tools and saved credentials do not prove account access or a successful send. No email, application or sign-in was started by this check.',
  };
}

if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--json'].includes(arg))) {
    process.stderr.write('Use node scripts/doctor.mjs [--json].\n');
    process.exitCode = 1;
  } else {
    doctor().then(report => {
      process.stdout.write(`${JSON.stringify({ ok: report.runtime.supported, data: report }, null, 2)}\n`);
      if (!report.runtime.supported) process.exitCode = 1;
    }).catch(() => { process.stderr.write('Setup could not be checked. Verify the local data directory and run npm run setup.\n'); process.exitCode = 1; });
  }
}
