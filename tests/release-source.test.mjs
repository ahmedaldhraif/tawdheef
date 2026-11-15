import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getReleaseSource } from '../scripts/release-source.mjs';

const prefix = 'tawdheef-release-source-';
const env = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/i.test(key)));
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, env: env(), encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const commit = root => git(root, '-c', 'user.name=Release Source Fixture', '-c', 'user.email=release-source@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic reviewed source');
async function fixture(t, initialize = true) {
  const folder = await mkdtemp(join(tmpdir(), prefix)), root = join(folder, 'repo with spaces-تجربة');
  t.after(async () => {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(folder.slice(dirname(folder).length + 1).startsWith(prefix));
    await rm(folder, { recursive: true, force: true, maxRetries: 5 });
  });
  await mkdir(root);
  if (initialize) {
    git(root, 'init', '--object-format=sha1');
    await writeFile(join(root, '.gitignore'), '.local/\noutputs/\nnested/\n');
    await writeFile(join(root, 'package.json'), '{"name":"release-source-fixture","version":"0.2.0"}\n');
    await writeFile(join(root, 'app.mjs'), 'export const fixture = 1;\n');
    git(root, 'add', '.'); commit(root);
  }
  return { folder, root };
}

test('release source uses the exact clean Git root and tolerates ignored private files', async t => {
  const { root } = await fixture(t), expected = git(root, 'rev-parse', 'HEAD');
  await mkdir(join(root, '.local')); await writeFile(join(root, '.local/private.json'), '{"synthetic":true}');
  assert.deepEqual(getReleaseSource(root), { sourceCommit: expected, sourceDirty: false });
  assert.match(expected, /^[a-f0-9]{40}$/);
});

test('dirty tracked and untracked source both stop release preparation without exposing contents', async t => {
  const { root } = await fixture(t), marker = 'synthetic-private-marker-not-for-output';
  await writeFile(join(root, 'app.mjs'), marker);
  assert.throws(() => getReleaseSource(root), error => /Commit or stash/.test(error.message) && !error.message.includes(marker));
  git(root, 'restore', '--', 'app.mjs');
  await writeFile(join(root, 'unreviewed.mjs'), 'export const unreviewed = true;');
  assert.throws(() => getReleaseSource(root), /Commit or stash/);
});

test('non-Git folders and nested folders cannot borrow an enclosing repository identity', async t => {
  const standalone = await fixture(t, false);
  assert.throws(() => getReleaseSource(standalone.root), /exact root/);
  const { root } = await fixture(t); await mkdir(join(root, 'nested'));
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.throws(() => getReleaseSource(join(root, 'nested')), /exact root/);
});

test('same version at different reviewed commits produces different source provenance', async t => {
  const { root } = await fixture(t), first = getReleaseSource(root);
  await writeFile(join(root, 'app.mjs'), 'export const fixture = 2;\n'); git(root, 'add', 'app.mjs'); commit(root);
  const second = getReleaseSource(root);
  assert.notEqual(second.sourceCommit, first.sourceCommit);
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.2.0');
  assert.equal(second.sourceDirty, false);
});

test('environment metadata cannot replace the source checkout HEAD', async t => {
  const { root } = await fixture(t), other = await fixture(t), expected = git(root, 'rev-parse', 'HEAD');
  const names = ['GITHUB_SHA', 'GIT_DIR', 'GIT_WORK_TREE'], previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.GITHUB_SHA = 'f'.repeat(40);
    process.env.GIT_DIR = join(other.root, '.git'); process.env.GIT_WORK_TREE = other.root;
    assert.equal(getReleaseSource(root).sourceCommit, expected);
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});

test('a supported filesystem alias resolves to the same exact checkout root', async t => {
  const { folder, root } = await fixture(t), alias = join(folder, 'checkout alias');
  try { await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) return t.skip('Host cannot create this filesystem alias.'); throw error; }
  assert.deepEqual(getReleaseSource(alias), getReleaseSource(root));
});
