import { realpath, lstat, open, writeFile, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

const TOOLS = new Set(['get_agent_context', 'get_capabilities']);
export async function writeAgentProof({ dataDir, receipt, tool }) {
  if (!TOOLS.has(tool) || basename(receipt) !== 'agent-model-proof.json') throw new Error('Use the isolated diagnostic receipt.');
  const rootInfo = await lstat(dataDir);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('The diagnostic directory must be a private regular directory.');
  const root = await realpath(dataDir), target = join(root, 'agent-model-proof.json');
  if (await realpath(dirname(resolve(receipt))) !== root) throw new Error('Use the isolated diagnostic receipt directory.');
  let tools = [];
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2048) throw new Error('The diagnostic receipt is not a safe regular file.');
    const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const actual = await file.stat();
      if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino) throw new Error('The diagnostic receipt changed.');
      const previous = JSON.parse(await file.readFile('utf8'));
      tools = Array.isArray(previous.tools) ? previous.tools.filter(name => TOOLS.has(name)) : [];
    } finally { await file.close(); }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(root, `.agent-proof-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ tools: [...new Set([...tools, tool])], checkedAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}
