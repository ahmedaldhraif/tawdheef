import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** argv may retain /var, a symlink or a Windows short path that ESM resolves. */
export function isDirectInvocation(moduleUrl, invoked = process.argv[1]) {
  if (!invoked) return false;
  try { return realpathSync(resolve(invoked)) === realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}
