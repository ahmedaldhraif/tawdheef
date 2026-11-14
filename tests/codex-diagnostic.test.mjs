import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCodexDiagnostic } from '../server/codex-diagnostic.mjs';
import { createAgentCheck } from '../server/agent-check.mjs';
import { openStore } from '../server/store.mjs';

test('Codex isolation disables each inherited name, safely quotes TOML keys and retains no metadata values', async () => {
  let invocation;
  const result = await prepareCodexDiagnostic({ executable: { command: 'fixture', args: ['prefix'] }, cwd: '/fixture', env: { keep: 'same' }, runMetadata: async args => { invocation = args; return JSON.stringify([{ name: 'sentinel', transport: { env: { secret: 'private metadata' } } }, { name: 'server.with.dot' }, { name: 'quoted"name' }, { name: 'sentinel' }]); } });
  assert.equal(invocation.cwd, '/fixture'); assert.deepEqual(invocation.env, { keep: 'same' }); assert.deepEqual(invocation.args, ['prefix', '--sandbox', 'read-only', '--cd', '/fixture', 'mcp', 'list', '--json']);
  assert.match(result.serverName, /^tawdheef-check-[a-f0-9]{32}$/);
  assert.deepEqual(result.args, ['-c', 'mcp_servers={"sentinel"={enabled=false},"server.with.dot"={enabled=false},"quoted\\"name"={enabled=false}}']);
  assert.ok(!JSON.stringify(result).includes('private metadata'));
});

test('unsafe or unreadable Codex metadata fails closed without exposing its raw configuration', async () => {
  for (const raw of ['not JSON private content', '{}', '[{"name":"bad\\nname"}]', JSON.stringify(Array.from({ length: 257 }, () => ({ name: 'server' })))]) {
    await assert.rejects(prepareCodexDiagnostic({ executable: { command: 'fixture' }, cwd: '/fixture', env: {}, runMetadata: async () => raw }), error => error.configurationError === true && !error.message.includes('private content'));
  }
  await assert.rejects(prepareCodexDiagnostic({ executable: { command: 'fixture' }, cwd: '/fixture', env: {}, runMetadata: async () => { throw { stderr: 'private path: unsupported model_reasoning_effort ultra' }; } }), error => error.configurationError && error.configurationField === 'model_reasoning_effort' && !JSON.stringify(error).includes('private path'));
});

test('a subprocess fixture starts its fake global MCP sentinel without isolation, but the actual diagnostic never starts it', async t => {
  const prefix = join(tmpdir(), 'tawdheef-codex-isolation-'), root = await mkdtemp(prefix), dataDir = join(root, 'real-record-fixture'), config = join(root, 'fake-global-mcp.json'), marker = join(root, 'sentinel-started'), trace = join(root, 'trace.jsonl');
  const sentinel = join(root, 'sentinel.mjs'), cli = join(root, 'fixture-codex.mjs');
  await writeFile(sentinel, 'import {writeFileSync} from "node:fs";writeFileSync(process.argv[2],"sentinel process actually started");');
  const original = JSON.stringify([{ name: 'sentinel', command: process.execPath, args: [sentinel, marker], transport: { env: { secret: 'synthetic metadata must not be retained' } } }]);
  await writeFile(config, original);
  await writeFile(cli, `import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),servers=JSON.parse(readFileSync(process.env.TAWDHEEF_TEST_MCP_CONFIG,'utf8'));const operation=args.includes('mcp')&&args.includes('list')?'metadata':'exec';
const disabled=[];for(let i=0;i<args.length;i++)if(args[i]==='-c'){const value=args[++i];if(value.startsWith('mcp_servers={'))for(const match of value.matchAll(/("(?:\\\\.|[^"\\\\])*")=\\{enabled=false\\}/g))disabled.push(JSON.parse(match[1]));}
appendFileSync(process.env.TAWDHEEF_TEST_MCP_TRACE,JSON.stringify({operation,cwd:process.cwd(),dataDir:process.env.APPLY_TRACKER_DATA,disabled})+'\\n');
if(operation==='metadata'){process.stdout.write(JSON.stringify(servers));}else{for(const server of servers)if(!disabled.includes(server.name))execFileSync(server.command,server.args,{windowsHide:true});writeFileSync(process.env.APPLY_TRACKER_DIAGNOSTIC_RECEIPT,JSON.stringify({tools:['get_agent_context','get_capabilities'],checkedAt:new Date().toISOString()}));process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}})+'\\n');}
`);
  const keys = ['TAWDHEEF_TEST_MCP_CONFIG', 'TAWDHEEF_TEST_MCP_TRACE'], previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.TAWDHEEF_TEST_MCP_CONFIG = config; process.env.TAWDHEEF_TEST_MCP_TRACE = trace;
  const store = openStore({ dataDir, seed: false }), service = createAgentCheck({ store, port: 65532, discover: async () => [{ id: 'codex', installed: true, command: process.execPath, args: [cli] }] });
  t.after(async () => { await service.close(); store.close(); for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } assert.ok(resolve(root).startsWith(resolve(prefix))); await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  const control = join(root, 'control'); await mkdir(control);
  await promisify(execFile)(process.execPath, [cli, 'exec'], { cwd: control, env: { ...process.env, APPLY_TRACKER_DIAGNOSTIC_RECEIPT: join(control, 'proof.json') }, windowsHide: true });
  assert.equal(await readFile(marker, 'utf8'), 'sentinel process actually started'); await unlink(marker);
  const result = await service.verify({ assistant: 'codex', explicit: true }); assert.equal(result.modelAccessVerified, true);
  await assert.rejects(access(marker), { code: 'ENOENT' }); assert.equal(await readFile(config, 'utf8'), original);
  const calls = (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), metadata = calls.find(call => call.operation === 'metadata'), run = calls.at(-1);
  assert.equal(metadata.cwd, run.cwd); assert.equal(metadata.dataDir, run.dataDir); assert.deepEqual(run.disabled, ['sentinel']); assert.ok(!JSON.stringify(store.getAssistantCheck({ assistant: 'codex' })).includes('synthetic metadata'));
});

test('a metadata failure records actionable configuration status before any model subprocess', async t => {
  const prefix = join(tmpdir(), 'tawdheef-codex-metadata-fail-'), dataDir = await mkdtemp(prefix), store = openStore({ dataDir, seed: false }); let executions = 0, reasoning = false;
  const service = createAgentCheck({ store, port: 65532, discover: async () => [{ id: 'codex', installed: true, command: 'fixture' }], isolateCodex: args => prepareCodexDiagnostic({ ...args, runMetadata: async () => { throw { stderr: reasoning ? 'private config path: unsupported model_reasoning_effort ultra' : 'private config path: invalid configuration' }; } }), execute: async () => { executions++; } });
  t.after(async () => { await service.close(); store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const result = await service.verify({ assistant: 'codex', explicit: true }); assert.equal(result.category, 'configuration'); assert.equal(result.modelAccessVerified, false); assert.equal(executions, 0); assert.match(result.nextStep, /CLI settings/);
  reasoning = true;
  const reason = await service.verify({ assistant: 'codex', explicit: true }); assert.equal(reason.category, 'reasoning_setting'); assert.equal(reason.modelAccessVerified, false); assert.equal(executions, 0); assert.match(reason.nextStep, /reasoning/i);
  assert.ok(!JSON.stringify(store.getAssistantCheck({ assistant: 'codex' })).includes('private config path'));
});
