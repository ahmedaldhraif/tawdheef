import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { isDirectInvocation } from './is-direct.mjs';

export function verifyReleaseRef({ cwd = process.cwd(), env = process.env, checkRemote = false } = {}) {
  const tag = env.RELEASE_TAG || '', expected = env.EXPECTED_RELEASE_SHA || '';
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  if (!/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(tag) || tag !== `v${pkg.version}`) throw new Error('The release tag must match the reviewed package version.');
  if (expected && !/^[a-f0-9]{40}$/i.test(expected)) throw new Error('The pinned release commit must be a full Git commit SHA.');
  if (checkRemote && !expected) throw new Error('A pinned release commit is required before checking the remote tag.');
  const git = (args, message) => {
    const result = spawnSync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', windowsHide: true, shell: false, timeout: 60_000 });
    if (result.error || result.status !== 0) throw new Error(message || 'The reviewed release tag could not be resolved.');
    return result.stdout.trim();
  };
  const commit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  const tagged = git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
  if (!/^[a-f0-9]{40}$/.test(commit) || commit !== tagged) throw new Error('The checkout is not the exact reviewed release tag.');
  if (expected && commit !== expected.toLowerCase()) throw new Error('The checkout or local tag no longer matches the pinned release commit.');
  if (checkRemote) {
    // Fetch only into FETCH_HEAD: never update a local or remote tag to make a
    // changed release appear valid. Peel annotated tags to their source commit.
    git(['fetch', '--no-tags', 'origin', `refs/tags/${tag}`], 'The remote release tag could not be checked; draft creation stopped.');
    const remote = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    if (remote !== expected.toLowerCase()) throw new Error('The remote release tag moved away from the pinned commit; draft creation stopped.');
  }
  return { tag, commit, remoteChecked: checkRemote };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 1 || args[0] !== '--remote')) throw new Error('Use verify-release-ref.mjs [--remote]; tag and expected commit come from the environment.');
    const result = verifyReleaseRef({ checkRemote: args[0] === '--remote' });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\n`);
    console.log(`Reviewed version tag ${result.tag} matches commit ${result.commit}${result.remoteChecked ? ' at origin' : ''}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
