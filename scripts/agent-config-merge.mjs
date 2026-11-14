/** Ownership-aware project setup. Unowned or edited entries are never replaced. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, unlink, lstat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const BEGIN = '# >>> Tawdheef managed MCP >>>';
const END = '# <<< Tawdheef managed MCP <<<';
const hash = value => createHash('sha256').update(value).digest('hex');
const entryHash = value => hash(JSON.stringify(canonical(value)));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const setupDirectory = root => join(root, '.tawdheef-setup');
const manifestPath = root => join(setupDirectory(root), 'manifest.json');

export async function readSetupManifest(root) {
  try {
    await assertSetupPath(root, manifestPath(root));
    const manifest = JSON.parse(await readFile(manifestPath(root), 'utf8'));
    if (manifest.version !== 1 || !manifest.clients || !manifest.files || typeof manifest.clients !== 'object' || typeof manifest.files !== 'object') throw new Error('invalid');
    const names = ['apply-tracker', 'playwright', 'tabbio', 'outlook-mcp'];
    for (const [client, owned] of Object.entries(manifest.clients)) {
      if (!['codex', 'claude-code'].includes(client) || !owned || !Array.isArray(owned.included) || owned.included.some(name => !names.includes(name))) throw new Error('invalid');
      if (client === 'codex' && !/^[a-f0-9]{64}$/.test(owned.blockHash)) throw new Error('invalid');
      if (client === 'claude-code' && (!owned.entries || Object.entries(owned.entries).some(([name, digest]) => !names.includes(name) || !/^[a-f0-9]{64}$/.test(digest)))) throw new Error('invalid');
    }
    for (const [path, digest] of Object.entries(manifest.files)) if (!/^(?:\.agents|\.claude)\/skills\/tawdheef\/.+$/.test(path) || path.includes('\\') || path.split('/').some(part => !part || part === '..' || part === '.') || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid');
    return manifest;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, clients: {}, files: {} };
    throw new Error('Tawdheef setup ownership could not be verified. Keep existing settings and review .tawdheef-setup/manifest.json; no setup files were changed.');
  }
}

export async function assertSetupPath(root, path) {
  const name = relative(root, path);
  if (!name || name.startsWith('..') || resolve(root, name) !== resolve(path)) throw new Error('Setup path must stay inside this project.');
  let current = root;
  for (const part of name.split(/[\\/]/)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing a linked setup path: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function existingFile(root, path) {
  await assertSetupPath(root, path);
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const conflict = path => new Error(`Keep your existing ${path}. Its Tawdheef entry is unowned or was edited. Export the needed entries with npm run setup -- --export-config agent-config --include playwright and merge only missing entries using docs/AGENT-GUIDE.md#connect-once. No setup files were changed.`);

function outsideHasManagedEntry(text, names) {
  // Deliberately conservative: inline/dotted/quoted ambiguous TOML requires review.
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes('mcp_servers')) continue;
    const section = line.match(/^\s*\[\s*mcp_servers\s*\.\s*(?:"([^"\\]+)"|'([^']+)'|([A-Za-z0-9_-]+))(?:\s*\.|\s*\])/);
    if (!section || names.includes(section[1] || section[2] || section[3])) return true;
  }
  return false;
}

function mergeCodex(existing, desired, ownership, names) {
  const block = `${BEGIN}\n${desired.trimEnd()}\n${END}\n`;
  if (existing === null) return { content: block, ownership: { blockHash: hash(block), included: names } };
  const start = existing.indexOf(BEGIN), end = existing.indexOf(END);
  if (start >= 0 || end >= 0) {
    if (start < 0 || end < start || existing.indexOf(BEGIN, start + BEGIN.length) >= 0 || existing.indexOf(END, end + END.length) >= 0) throw conflict('.codex/config.toml');
    let finish = end + END.length;
    if (existing[finish] === '\r') finish++;
    if (existing[finish] === '\n') finish++;
    const oldBlock = existing.slice(start, finish);
    if (ownership?.blockHash !== hash(oldBlock)) throw conflict('.codex/config.toml');
    const outside = existing.slice(0, start) + existing.slice(finish);
    if (outsideHasManagedEntry(outside, names)) throw conflict('.codex/config.toml');
    return { content: existing.slice(0, start) + block + existing.slice(finish), ownership: { blockHash: hash(block), included: names } };
  }
  if (existing.trim() === desired.trim()) return { content: block, ownership: { blockHash: hash(block), included: names } };
  if (ownership || outsideHasManagedEntry(existing, names)) throw conflict('.codex/config.toml');
  return { content: existing.replace(/\s*$/, '') + '\n\n' + block, ownership: { blockHash: hash(block), included: names } };
}

function mergeClaude(existing, desired, ownership, names) {
  let current;
  try { current = existing === null ? {} : JSON.parse(existing); }
  catch { throw conflict('.mcp.json'); }
  if (!current || typeof current !== 'object' || Array.isArray(current) || current.mcpServers !== undefined && (!current.mcpServers || typeof current.mcpServers !== 'object' || Array.isArray(current.mcpServers))) throw conflict('.mcp.json');
  const servers = { ...(current.mcpServers || {}) }, entries = { ...(ownership?.entries || {}) };
  for (const name of names) {
    if (Object.hasOwn(servers, name) && entryHash(servers[name]) !== entryHash(desired[name]) && entries[name] !== entryHash(servers[name])) throw conflict('.mcp.json');
    if (!Object.hasOwn(servers, name) && entries[name]) throw conflict('.mcp.json');
    servers[name] = desired[name]; entries[name] = entryHash(desired[name]);
  }
  return { content: JSON.stringify({ ...current, mcpServers: servers }, null, 2) + '\n', ownership: { entries, included: names } };
}

export async function planAgentSetup({ root, clients, config, skills, manifest }) {
  const next = structuredClone(manifest), files = [];
  for (const client of clients) {
    const path = join(root, client === 'codex' ? '.codex/config.toml' : '.mcp.json');
    const existing = await existingFile(root, path), names = Object.keys(config.mcpServers);
    const merged = client === 'codex' ? mergeCodex(existing, config.codexToml, manifest.clients[client], names) : mergeClaude(existing, config.mcpServers, manifest.clients[client], names);
    next.clients[client] = merged.ownership;
    files.push({ path, previous: existing, content: merged.content });
  }
  for (const skill of skills) {
    const key = relative(root, skill.path).replaceAll('\\', '/');
    const existing = await existingFile(root, skill.path);
    if (existing !== null && existing !== skill.content && manifest.files[key] !== hash(existing)) throw conflict(key);
    next.files[key] = hash(skill.content);
    files.push({ ...skill, previous: existing });
  }
  return { files, manifest: next };
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tawdheef-${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}

export async function applyAgentSetup({ root, plan, expectedManifest }) {
  const changed = plan.files.filter(file => file.previous !== file.content);
  const manifestText = JSON.stringify(plan.manifest, null, 2) + '\n';
  const state = setupDirectory(root);
  await assertSetupPath(root, join(state, 'lock'));
  await mkdir(state, { recursive: true, mode: 0o700 });
  const lock = join(state, 'lock');
  try { await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another project setup is in progress. Finish it before trying again.'); throw error; }
  let backup = null;
  const written = [];
  try {
    const actualManifest = await readSetupManifest(root);
    if (JSON.stringify(actualManifest) !== JSON.stringify(expectedManifest)) throw new Error('Setup ownership changed during preview. Run setup again; no setup files were changed.');
    for (const file of changed) if (await existingFile(root, file.path) !== file.previous) throw new Error('A setup file changed during preview. Run setup again; no setup files were changed.');
    const replacements = changed.filter(file => file.previous !== null);
    if (replacements.length) {
      backup = join(state, 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
      await assertSetupPath(root, join(backup, 'manifest.json'));
      await mkdir(backup, { recursive: true, mode: 0o700 });
      await writeFile(join(backup, 'manifest.json'), JSON.stringify(expectedManifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      for (const file of replacements) {
        const target = join(backup, relative(root, file.path));
        await assertSetupPath(root, target);
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, file.previous, { flag: 'wx', mode: 0o600 });
      }
    }
    for (const file of changed) {
      await assertSetupPath(root, file.path);
      if (await existingFile(root, file.path) !== file.previous) throw new Error('A setup file changed while updating. Review the backup and try again.');
      await mkdir(dirname(file.path), { recursive: true, mode: 0o700 });
      await atomicWrite(file.path, file.content); written.push(file);
    }
    await atomicWrite(manifestPath(root), manifestText);
    return { backup };
  } catch (error) {
    for (const file of written.reverse()) {
      // An editor may have changed a file while setup was running. Keep that edit.
      if (await existingFile(root, file.path) !== file.content) continue;
      if (file.previous === null) await unlink(file.path);
      else await atomicWrite(file.path, file.previous);
    }
    throw error;
  } finally { await unlink(lock).catch(() => {}); }
}
