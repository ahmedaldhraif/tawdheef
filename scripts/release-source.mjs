/** Identify a reviewed source checkout before any release generators run. */
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function getReleaseSource(root) {
  const locationError = 'Prepare the release from the exact root of a clean, committed Git source checkout.';
  let directory;
  try { directory = realpathSync.native(root); } catch { throw new Error(locationError); }
  // Repository overrides inherited from another command must not substitute a
  // different HEAD/index for the source directory being packaged.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/i.test(key)));
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, env, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000 });
    if (result.error || result.status !== 0) throw new Error(locationError);
    return result.stdout.trim();
  };
  let top;
  try { top = realpathSync.native(git(['rev-parse', '--show-toplevel'])); } catch { throw new Error(locationError); }
  const identity = path => process.platform === 'win32' ? path.toLowerCase() : path;
  if (identity(top) !== identity(directory)) throw new Error(locationError);
  const sourceCommit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('The reviewed source must have a full 40-character Git commit ID.');
  if (git(['status', '--porcelain=v1', '--untracked-files=normal'])) {
    throw new Error('Commit or stash reviewed source changes before preparing the release. The Git source tree must be clean; ignored private files remain ignored.');
  }
  if (git(['rev-parse', '--verify', 'HEAD^{commit}']) !== sourceCommit) {
    throw new Error('Git HEAD changed during release source verification. Freeze the reviewed checkout and retry.');
  }
  return { sourceCommit, sourceDirty: false };
}
