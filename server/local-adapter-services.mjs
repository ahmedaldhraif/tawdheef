/** Optional compatibility services. The native-client app never imports this module. */
import { ConnectionManager } from './connections.mjs';
import { createScheduler } from './scheduler.mjs';
import { createAgentRunner, checkAssistantAuthentication } from './agent-runner.mjs';
import { createSetupStatus } from './setup-status.mjs';
import { createMonitoring } from './monitoring.mjs';
import { createAgentCheck } from './agent-check.mjs';
import { readConnectedCv } from './cv-read.mjs';
import { sendEmailForRun, reconcileApplicationEmail } from './email-send.mjs';
import { calendarAction } from './calendar.mjs';
import { AppError } from './store.mjs';

export function createLocalAdapterServices({ store, port, baseUrl }) {
  const connections = new ConnectionManager({ dataDir: store.dataDir, baseUrl });
  const scheduler = createScheduler({ store, connections, baseUrl });
  const setupStatus = createSetupStatus({ store, connections, port });
  const monitoring = createMonitoring({ store, connections });
  const agentCheck = createAgentCheck({ store, port });
  const agentRunner = createAgentRunner({ store, port, checkReady: async (executable, { signal } = {}) => {
    await checkAssistantAuthentication(executable);
    signal?.throwIfAborted();
    try { await readConnectedCv({ store, connections }); }
    catch { throw new AppError('Check your CV connection, then press Run.'); }
  } });
  return {
    connections, scheduler, setupStatus, monitoring, agentCheck, agentRunner,
    readCv: () => readConnectedCv({ store, connections }),
    calendar: (action, input) => calendarAction(connections, action, input),
    sendEmail: (runId, input) => sendEmailForRun({ store, connections, runId, input }),
    reconcileEmail: applicationId => reconcileApplicationEmail({ store, connections, applicationId }),
    start: () => scheduler.start(),
    async close() {
      await agentRunner.close(); await scheduler.stop(); await agentCheck.close(); await connections.close();
    },
  };
}
