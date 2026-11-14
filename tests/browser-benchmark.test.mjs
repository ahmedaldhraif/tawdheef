import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { benchmarkBrowser, resolveAppRoot } from '../scripts/browser-benchmark.mjs';

test('browser benchmark resolves extracted native Mac packages without requiring a writable app bundle', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tawdheef-browser-benchmark-layout-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  const codeRoot = join(directory, 'tawdheef/Tawdheef.app/Contents/Resources/app');
  for (const file of ['server/index.mjs', 'server/store.mjs', 'dist/index.html']) {
    await mkdir(join(codeRoot, file, '..'), { recursive: true }); await writeFile(join(codeRoot, file), 'Fixture only');
  }
  assert.equal(await resolveAppRoot(directory), codeRoot);
  assert.equal(await resolveAppRoot(join(directory, 'tawdheef/Tawdheef.app')), codeRoot);
  assert.equal(await resolveAppRoot(codeRoot), codeRoot);
  await assert.rejects(resolveAppRoot(join(directory, 'missing')), /complete built app directory/);
});

test('browser benchmark refuses existing outputs before starting an app or creating fixture records', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tawdheef-browser-benchmark-output-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  const output = join(directory, 'keep.json'); await writeFile(output, 'Existing result');
  await assert.rejects(benchmarkBrowser({ app: join(directory, 'missing'), output }), /Output already exists/);
  assert.equal(await readFile(output, 'utf8'), 'Existing result');
});
