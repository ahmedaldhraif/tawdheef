/** Run this file from the trusted base checkout; proposed content is data only. */
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validatePackDefinition, validatePackSource, scanPackContent } from '../server/pack-validation.mjs';

const privatePath = /(^|\/)(?:\.local|\.codex|\.tawdheef-setup|node_modules|agent-config|token-cache|selected-account)(\/|$)|(^|\/)(?:\.env(?:\.|$)|\.mcp\.json$)|(?:^|\/)\.claude\/settings(?:\.local)?\.json$|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|log)$/i;
const executablePack = /\.(?:m?js|cjs|jsx|tsx?|py|ps1|cmd|bat|sh|exe|dll|so|dylib|wasm)$/i;
const textual = /\.(?:json|md|txt|mjs|js|jsx|tsx?|yml|yaml|toml|html|css|py|sh|cmd|bat|ps1)$/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_PUBLIC_FILE_BYTES = 80 * 1024 * 1024;

// Inspect YAML scalar tokens without executing a parser or proposal code. Exact
// event scalars are rejected even when quoted, in flow collections or anchored.
// This is deliberately conservative: an aliased event may be declared elsewhere.
function hasPrivilegedPrEvent(text) {
  const matches = raw => {
    let value = raw.trim().replace(/^(?:(?:&|!)[^\s]+\s+)+/, '');
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replaceAll("''", "'");
    else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.replace(/\\\r?\n\s*/g, '');
      try { value = JSON.parse(value); }
      catch { value = value.slice(1, -1).replace(/\\(?:x([a-f\d]{2})|u([a-f\d]{4})|U([a-f\d]{8}))/gi, (_match, x, u, big) => {
        const point = parseInt(x || u || big, 16); return point <= 0x10ffff ? String.fromCodePoint(point) : '';
      }); }
    }
    return value === 'pull_request_target';
  };
  for (let index = 0; index < text.length;) {
    if (/[\s{}\[\],:]/.test(text[index])) { index++; continue; }
    if (text[index] === '#') { while (index < text.length && text[index] !== '\n') index++; continue; }
    const start = index, quote = text[index] === '"' || text[index] === "'" ? text[index++] : null;
    if (quote) {
      while (index < text.length) {
        if (quote === '"' && text[index] === '\\') { index += 2; continue; }
        if (text[index++] === quote) { if (quote === "'" && text[index] === "'") { index++; continue; } break; }
      }
    } else {
      while (index < text.length && !/[\r\n{}\[\],:]/.test(text[index]) && !(text[index] === '#' && /\s/.test(text[index - 1] || ''))) index++;
    }
    if (matches(text.slice(start, index))) return true;
  }
  return false;
}

async function inside(root, name) {
  if (typeof name !== 'string' || name.includes('\\') || isAbsolute(name) || name.split('/').some(part => part === '..' || part === '.git')) throw new Error('Unsafe repository-relative contribution path.');
  const path = resolve(root, name), rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Contribution path escapes its checkout.');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Contribution files must be ordinary files, never symbolic links.');
  const actual = await realpath(path), base = await realpath(root), actualRel = relative(base, actual);
  if (actualRel.startsWith('..') || isAbsolute(actualRel)) throw new Error('Contribution file resolves outside its checkout.');
  if (info.size > MAX_PUBLIC_FILE_BYTES) throw new Error('Public file exceeds the 80 MiB static-review limit. Split the source with maintainer review.');
  return path;
}

/** Never executes or imports any module from root. */
export async function scanContribution({ root, baseRoot, paths } = {}) {
  root = resolve(root || '.');
  if (baseRoot) baseRoot = resolve(baseRoot);
  const findings = [], packs = [];
  const add = (path, code, message, severity = 'error', line = 1) => findings.push({ path, line, code, severity, message });
  const checked = new Set();
  const readPublic = async name => {
    const file = await inside(root, name); checked.add(name); return readFile(file);
  };
  let candidates = paths;
  if (!candidates) {
    const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Run contribution scanning inside a Git checkout, or supply explicit paths through the API.');
    candidates = result.stdout.split('\0').filter(Boolean);
  }
  for (const name of candidates) {
    if (privatePath.test(name)) { add(name, 'PRIVATE_FILE', 'Private configuration, tracking, credentials and logs cannot be contributed.'); continue; }
    if (name.startsWith('directories/') && executablePack.test(name)) { add(name, 'EXECUTABLE_PACK', 'Directory packs contain public data and guidance, never executable code.'); continue; }
    // Generated assets are checked by release tooling. Do not inflate archives here.
    if (!textual.test(name) || /^(?:directories\/[^/]+\/(?:source\.json|[^/]+-directory(?:-\d+)?\.(?:json|csv))|data\/uae-directory\.json)$/i.test(name)) continue;
    try {
      const bytes = await readPublic(name);
      if (/^\.github\/workflows\/.+\.ya?ml$/i.test(name) && hasPrivilegedPrEvent(bytes.toString('utf8'))) add(name, 'PRIVILEGED_PR_WORKFLOW', 'Privileged pull_request_target workflows are outside the community contribution policy.');
      const packContent = /^directories\/[^/]+\/(?:GUIDE\.md|pack\.json|source\.json)$/.test(name) && !name.startsWith('directories/_template/');
      const report = scanPackContent(bytes.toString('utf8'), { path: name, guidance: basename(name) === 'GUIDE.md', inspectDirectives: packContent });
      // Ordinary source/tests/policy can quote adversarial fixtures. Their code is
      // reviewed, while pack data and GUIDE.md may never grant model authority.
      findings.push(...report.findings.filter(item => packContent || item.code === 'SECRET_SIGNATURE'));
    } catch (error) { add(name, 'UNREADABLE_PUBLIC_FILE', String(error.message).slice(0, 600)); }
  }
  // Historical protection comes from the trusted checkout. A proposal cannot
  // remove its historical flag/hash, redirect its source or delete its pack to
  // opt out of preserving the original public research bytes.
  if (baseRoot) {
    const baseEntries = await readdir(join(baseRoot, 'directories'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of baseEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const path = `directories/${entry.name}/pack.json`;
      try {
        let original; try { original = JSON.parse(await readFile(await inside(baseRoot, path), 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (original.historical !== true) continue;
        validatePackDefinition(original, { folder: entry.name });
        const trustedHash = digest(await readFile(await inside(baseRoot, original.source)));
        if (original.sourceSha256 && original.sourceSha256 !== trustedHash) throw new Error('Trusted historical source does not match its pinned hash.');
        let proposedSource;
        try { proposedSource = await readPublic(original.source); }
        catch { add(original.source, 'HISTORICAL_SOURCE_CHANGED', 'The trusted historical source is missing or cannot be read. Preserve its canonical path and original bytes.'); }
        if (proposedSource && digest(proposedSource) !== trustedHash) add(original.source, 'HISTORICAL_SOURCE_CHANGED', 'Historical source differs from the trusted base. Submit corrections to a current pack.');
        let proposed;
        try { proposed = JSON.parse((await readPublic(path)).toString('utf8')); }
        catch { add(path, 'HISTORICAL_DEFINITION_CHANGED', 'The trusted historical pack definition must remain available.'); }
        if (proposed && (proposed.historical !== true || proposed.source !== original.source || proposed.sourceSha256 !== original.sourceSha256)) add(path, 'HISTORICAL_DEFINITION_CHANGED', 'Keep the trusted historical flag, canonical source path and pinned source hash unchanged.');
      } catch (error) { add(path, 'HISTORICAL_SOURCE_CHECK_FAILED', String(error.message).slice(0, 1000)); }
    }
  }
  let entries = [];
  try { entries = await readdir(join(root, 'directories'), { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const path = `directories/${entry.name}/pack.json`;
    try {
      let bytes; try { bytes = await readPublic(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const def = validatePackDefinition(JSON.parse(bytes), { folder: entry.name });
      const source = await readPublic(def.source);
      if (def.sourceSha256 && digest(source) !== def.sourceSha256) throw new Error('Pinned historical source changed; original research must remain unchanged.');
      validatePackSource(JSON.parse(source), def);
      if (def.formatVersion === 2) for (const name of [def.guide, def.changelog]) {
        const file = `directories/${def.id}/${name}`, text = (await readPublic(file)).toString('utf8');
        const report = scanPackContent(text, { path: file, guidance: name === def.guide });
        findings.push(...report.findings);
      }
      packs.push({ id: def.id, formatVersion: def.formatVersion || 1, records: JSON.parse(source).records.length });
    } catch (error) { add(path, 'INVALID_PACK', String(error.message).slice(0, 1000)); }
  }
  const unique = findings.filter((item, index) => findings.findIndex(other => other.path === item.path && other.line === item.line && other.code === item.code) === index);
  return { ok: !unique.some(item => item.severity === 'error'), files: checked.size, packs, findings: unique, limits: 'Static heuristic scanning cannot prove safety, source accuracy, rights, contributor identity or external-site compliance. Maintainers review source evidence and guidance before approving a release. No proposed code was executed.' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2); let root = '.', baseRoot;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root') root = args[++index];
    else if (args[index] === '--base-root') baseRoot = args[++index];
    else throw new Error(`Unsupported scanner argument: ${args[index]}`);
  }
  try { const report = await scanContribution({ root, baseRoot }); console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
  catch (error) { console.error(`Contribution scan failed: ${String(error.message).slice(0, 1000)}`); process.exitCode = 1; }
}
