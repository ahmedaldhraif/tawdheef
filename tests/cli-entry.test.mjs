import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { isDirectInvocation } from '../scripts/is-direct.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function linkedFixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'tawdheef-cli-alias-'));
  const linked = join(folder, 'linked app');
  await symlink(ROOT, linked, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => rm(folder, { recursive: true, force: true, maxRetries: 5 }));
  return { folder, linked, env: { ...process.env, APPLY_TRACKER_DATA: join(folder, 'isolated data') } };
}

test('direct invocation recognizes aliases and keeps imported modules inactive', async t => {
  const { linked } = await linkedFixture(t);
  assert.equal(isDirectInvocation(import.meta.url, join(linked, 'tests/cli-entry.test.mjs')), true);
  assert.equal(isDirectInvocation(import.meta.url, join(linked, 'scripts/native-start.mjs')), false);
  assert.equal(isDirectInvocation(import.meta.url, ''), false);
  assert.equal(isDirectInvocation(import.meta.url, join(linked, 'missing-file')), false);
});

test('native startup, background and setup CLIs execute through a linked app path', async t => {
  const { linked, env } = await linkedFixture(t);
  for (const [file, args, expectedStatus, text] of [
    ['scripts/native-start.mjs', ['--invalid-fixture-option'], 1, /Only --no-open/],
    ['scripts/background.mjs', ['invalid-fixture-command'], 1, /Expected background/],
    ['scripts/setup.mjs', ['--help'], 0, /Tawdheef setup/],
  ]) {
    const result = spawnSync(process.execPath, [join(linked, file), ...args], { cwd: linked, env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.match(result.stdout + result.stderr, text, `${file} must not silently exit through a path alias`);
  }
});

test('real stdio MCP initializes through a linked app path using isolated records', { timeout: 15_000 }, async t => {
  const { linked, env } = await linkedFixture(t);
  const client = new Client({ name: 'cli-alias-fixture', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(linked, 'server/mcp.mjs')], cwd: linked, env, stderr: 'pipe' }));
    const result = await client.listTools();
    assert.ok(result.tools.some(tool => tool.name === 'get_agent_context'));
    assert.ok(result.tools.some(tool => tool.name === 'get_capabilities'));
  } finally { await client.close(); }
});
