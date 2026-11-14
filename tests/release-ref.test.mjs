import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyReleaseRef } from '../scripts/verify-release-ref.mjs';

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-release-ref-'), folder = await mkdtemp(prefix);
  const cwd = join(folder, 'checkout'), origin = join(folder, 'origin.git');
  await mkdir(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Release fixture');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  git('add', 'package.json'); git('commit', '--quiet', '-m', 'Synthetic release fixture');
  git('tag', '-a', 'v1.2.3', '-m', 'Synthetic reviewed tag');
  const commit = git('rev-parse', 'HEAD');
  git('init', '--bare', '--quiet', origin);
  git('remote', 'add', 'origin', origin);
  git('push', '--quiet', 'origin', 'refs/tags/v1.2.3');
  t.after(async () => {
    if (!resolve(folder).startsWith(resolve(prefix))) throw new Error('Unexpected release fixture cleanup path.');
    await rm(folder, { recursive: true, force: true, maxRetries: 5 });
  });
  return { cwd, folder, git, commit, env: { RELEASE_TAG: 'v1.2.3', EXPECTED_RELEASE_SHA: commit } };
}

test('verified annotated tag emits its immutable commit for downstream jobs', async t => {
  const { cwd, folder, commit, env } = await fixture(t);
  assert.deepEqual(verifyReleaseRef({ cwd, env }), { tag: 'v1.2.3', commit, remoteChecked: false });
  const output = join(folder, 'github-output');
  const script = fileURLToPath(new URL('../scripts/verify-release-ref.mjs', import.meta.url));
  execFileSync(process.execPath, [script], { cwd, env: { ...process.env, ...env, GITHUB_OUTPUT: output }, windowsHide: true, stdio: 'pipe' });
  assert.equal(await readFile(output, 'utf8'), `commit=${commit}\n`);
});

test('version, checkout and expected commit mismatches fail closed', async t => {
  const { cwd, git, env } = await fixture(t);
  assert.throws(() => verifyReleaseRef({ cwd, env: { ...env, RELEASE_TAG: 'v1.2.4' } }), /version/);
  assert.throws(() => verifyReleaseRef({ cwd, env: { ...env, RELEASE_TAG: 'v1.2.3; bad' } }), /version/);
  assert.throws(() => verifyReleaseRef({ cwd, env: { ...env, EXPECTED_RELEASE_SHA: 'a'.repeat(40) } }), /pinned/);
  assert.throws(() => verifyReleaseRef({ cwd, env: { RELEASE_TAG: env.RELEASE_TAG }, checkRemote: true }), /pinned/);
  await writeFile(join(cwd, 'fixture.txt'), 'Unreviewed fixture source');
  git('add', 'fixture.txt'); git('commit', '--quiet', '-m', 'Unreviewed fixture commit');
  assert.throws(() => verifyReleaseRef({ cwd, env }), /checkout/);
});

test('final remote check rejects a moved tag without changing either tag or checkout', async t => {
  const { cwd, git, commit, env } = await fixture(t);
  assert.deepEqual(verifyReleaseRef({ cwd, env, checkRemote: true }), { tag: 'v1.2.3', commit, remoteChecked: true });
  await writeFile(join(cwd, 'fixture.txt'), 'Different source with the same package version');
  git('add', 'fixture.txt'); git('commit', '--quiet', '-m', 'Different fixture source');
  const moved = git('rev-parse', 'HEAD');
  git('push', '--quiet', '--force', 'origin', `${moved}:refs/tags/v1.2.3`);
  git('checkout', '--quiet', '--detach', commit);
  assert.throws(() => verifyReleaseRef({ cwd, env, checkRemote: true }), /remote.*moved/);
  assert.equal(git('rev-parse', 'HEAD'), commit);
  assert.equal(git('rev-parse', 'refs/tags/v1.2.3^{commit}'), commit);
  assert.equal(git('ls-remote', 'origin', 'refs/tags/v1.2.3').split(/\s+/)[0], moved);
});
