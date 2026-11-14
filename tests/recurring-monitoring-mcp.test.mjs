import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openStore } from '../server/store.mjs';
import { MONITOR_READ_TOOLS } from '../server/operator-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const unpack = result => result.structuredContent || JSON.parse(result.content[0].text);

test('real notify-only stdio catalog exposes discovery records and rejects sending, profile writes and other companies', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-monitor-stdio-'));
  const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'monitor', name: 'Monitor' });
  const [companyId, otherId] = store.addCompanies('monitor', [{ name: 'Employer', careersUrl: 'https://careers.example.test/jobs' }, { name: 'Other employer' }]).ids;
  let rule = store.saveMonitoringRule({ directoryId: 'monitor', companyIds: [companyId], mode: 'notify' });
  rule = store.setMonitoringRuleStatus({ id: rule.id, enabled: true, explicit: true, expectedRevision: rule.revision });
  const run = store.startMonitoringRun(rule.id);
  store.beginRunTarget(run.id, companyId);
  const client = new Client({ name: 'notify-fixture', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'server/mcp.mjs')], env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: '65532', APPLY_TRACKER_OPERATOR_RUN: run.id, APPLY_TRACKER_OPERATOR_COMPANY: companyId }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.deepEqual([...names].sort(), [...MONITOR_READ_TOOLS].sort());
    const capabilities = unpack(await client.callTool({ name: 'get_capabilities', arguments: {} })).data;
    assert.deepEqual(capabilities.toolNames, names);
    assert.ok(!names.includes('send_application_email'));
    assert.ok(!names.includes('prepare_form_submission'));
    assert.ok(!names.includes('log_application'));
    assert.ok(!names.includes('save_monitoring_rule'));
    const context = unpack(await client.callTool({ name: 'get_agent_context', arguments: {} })).data;
    assert.match(context.instructions, /read-only discovery/);
    assert.match(context.workflow.join(' '), /Do not submit/);
    for (const name of ['send_application_email', 'prepare_form_submission', 'log_application', 'update_company']) assert.equal((await client.callTool({ name, arguments: { companyId, runId: run.id, role: 'Engineer' } })).isError, true);
    assert.equal((await client.callTool({ name: 'record_monitored_jobs', arguments: { runId: run.id, companyId: otherId, sourceUrl: 'https://careers.example.test/jobs', status: 'checked', jobs: [] } })).isError, true);
    const checked = unpack(await client.callTool({ name: 'record_monitored_jobs', arguments: { runId: run.id, companyId, sourceUrl: 'https://careers.example.test/jobs', status: 'checked', jobs: [{ title: 'Engineer', url: 'https://careers.example.test/jobs/42', location: 'Dubai', matchesCV: false, reason: 'The real CV does not establish the required eligibility.', evidence: 'Official posting requires an eligibility the candidate has not supplied.' }] } }));
    assert.equal(checked.ok, true);
    assert.equal(checked.data.jobsFound, 1);
    assert.equal(store.getMonitoringResults({ matchedOnly: false }).total, 1);
    assert.equal(store.listApplications(companyId).length, 0);
    store.setMonitoringRuleStatus({ id: rule.id, enabled: false });
    assert.equal((await client.callTool({ name: 'get_company', arguments: { id: companyId } })).isError, true);
  } finally {
    await client.close();
    store.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
});
