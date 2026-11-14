import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const MAX_CV_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 20 * 1024 * 1024;
const CODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pendingWrites = new Map();
const TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const CHOOSE_FILE = 'Choose your original PDF or DOCX in Connections → Your CV. Tawdheef will keep the exact file you select.';

export class CvArtifactError extends Error {
  constructor(code, message, status = 400, nextStep = CHOOSE_FILE) { super(message); Object.assign(this, { name: 'CvArtifactError', code, status, nextStep }); }
}
const invalid = message => new CvArtifactError('CV_ARTIFACT_INVALID', message);
const unsafe = () => new CvArtifactError('CV_ARTIFACT_UNSAFE_STORAGE', 'Private CV storage is unavailable or points outside its expected folder.', 409, 'Check access to Tawdheef’s private data folder, then choose your original CV again.');
const inside = (root, path) => { const part = relative(root, path); return part === '' || (part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part)); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value);

function filenameInfo(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) throw invalid('Choose a PDF or DOCX filename.');
  const leaf = value.split(/[\\/]/).pop().normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, '').trim().replace(/[. ]+$/, '');
  const extension = /\.(pdf|docx)$/i.exec(leaf)?.[0].toLowerCase();
  if (!extension) throw invalid('The selected file must be a PDF or DOCX.');
  let stem = leaf.slice(0, -extension.length).trim().replace(/[. ]+$/, '') || 'CV';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = 'CV-' + stem;
  stem = Array.from(stem).slice(0, 110).join('');
  return { filename: stem + extension, extension, mimeType: TYPES[extension] };
}

// ZIP structure and required DOCX parts only. This is not a malware scanner or PDF/Office disarmer.
const crcTable = Array.from({ length: 256 }, (_, i) => { let value = i; for (let j = 0; j < 8; j++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function xmlPrefix(bytes) {
  const prefix = bytes.subarray(0, 256);
  const encoding = (prefix[0] === 0xff && prefix[1] === 0xfe) || (prefix[0] === 0x3c && prefix[1] === 0) ? 'utf-16le'
    : (prefix[0] === 0xfe && prefix[1] === 0xff) || (prefix[0] === 0 && prefix[1] === 0x3c) ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(prefix).replace(/^\uFEFF/, '').trimStart();
}
function checkDocx(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22, minimum = Math.max(0, bytes.length - 65557); offset >= minimum; offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalid('The selected DOCX is not a supported single-file ZIP document.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count < 2 || count > 10000 || count !== bytes.readUInt16LE(end + 8) || start + size !== end) throw invalid('The selected DOCX has an unsupported or incomplete ZIP directory.');
  const required = new Set(['[Content_Types].xml', 'word/document.xml']), found = new Set(), ranges = [];
  let cursor = start;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid('The selected DOCX has an incomplete ZIP directory.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32), disk = bytes.readUInt16LE(cursor + 34), local = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (!nameSize || next > end || disk || flags & 1 || ![0, 8].includes(method) || local + 30 > start || compressed === 0xffffffff || expanded === 0xffffffff) throw invalid('The selected DOCX is encrypted, incomplete or uses an unsupported ZIP format.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize), name = nameBytes.toString('utf8');
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) & 1) throw invalid('The selected DOCX contains an invalid ZIP entry.');
    const localNameSize = bytes.readUInt16LE(local + 26), localExtraSize = bytes.readUInt16LE(local + 28), payload = local + 30 + localNameSize + localExtraSize, finish = payload + compressed;
    if (finish > start || payload > start || !nameBytes.equals(bytes.subarray(local + 30, local + 30 + localNameSize))) throw invalid('The selected DOCX contains an invalid ZIP entry.');
    ranges.push([local, finish]);
    if (required.has(name)) {
      if (found.has(name) || expanded < 1 || expanded > MAX_XML_BYTES) throw invalid('The selected DOCX has duplicate, empty or oversized document parts.');
      let xml;
      try { xml = method === 0 ? bytes.subarray(payload, finish) : inflateRawSync(bytes.subarray(payload, finish), { maxOutputLength: MAX_XML_BYTES }); }
      catch { throw invalid('The selected DOCX document parts could not be read.'); }
      if (xml.length !== expanded || crc32(xml) !== crc || !xmlPrefix(xml).startsWith('<')) throw invalid('The selected DOCX has damaged document parts.');
      found.add(name);
    }
    cursor = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (cursor !== end || found.size !== required.size || ranges.some((range, index) => index && range[0] < ranges[index - 1][1])) throw invalid('The selected DOCX is missing its document parts or has overlapping entries.');
}
function checkFormat(bytes, extension) {
  if (extension === '.pdf') { if (!/^%PDF-\d\.\d(?:\s|$)/.test(bytes.subarray(0, 16).toString('ascii'))) throw invalid('The selected file does not have a PDF header.'); }
  else { if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw invalid('The selected file is not a DOCX ZIP document.'); checkDocx(bytes); }
}

async function outsideApp(path) {
  if (/(?:^|[\\/])[^\\/]+\.app(?:[\\/]|$)/i.test(path)) throw unsafe();
  let manifest;
  try { manifest = JSON.parse(await readFile(join(CODE_ROOT, 'tawdheef-app.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw unsafe(); }
  if (manifest?.layout && inside(await realpath(CODE_ROOT), path)) throw unsafe();
}
async function privateRoot(dataDir, create) {
  if (typeof dataDir !== 'string' || !isAbsolute(dataDir) || resolve(dataDir) === parse(resolve(dataDir)).root) throw unsafe();
  const requested = resolve(dataDir), missing = [];
  let existing = requested, info;
  while (true) {
    try { info = await lstat(existing); break; }
    catch (error) { if (error.code !== 'ENOENT') throw unsafe(); missing.unshift(basename(existing)); existing = dirname(existing); }
  }
  if ((existing === requested && info.isSymbolicLink()) || !info.isDirectory()) throw unsafe();
  let canonical = await realpath(existing);
  await outsideApp(resolve(canonical, ...missing));
  if (missing.length && !create) return null;
  for (const part of missing) { canonical = await childDirectory(canonical, [part], true); }
  return canonical;
}
async function childDirectory(root, parts, create) {
  let current = root;
  for (const part of parts) {
    const target = join(current, part);
    if (!inside(root, target)) throw unsafe();
    let info;
    try { info = await lstat(target); }
    catch (error) {
      if (error.code !== 'ENOENT') throw unsafe();
      if (!create) return null;
      try { await mkdir(target, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw unsafe(); }
      info = await lstat(target);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw unsafe();
    const canonical = await realpath(target);
    if (relative(target, canonical) !== '' || !inside(root, canonical)) throw unsafe();
    if (create) await chmod(target, 0o700);
    current = canonical;
  }
  return current;
}
async function readRegular(path, maxBytes) {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile() || before.size > maxBytes) throw unsafe();
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev || info.size > maxBytes) throw unsafe();
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || bytes.length > maxBytes) throw unsafe();
    return bytes;
  } finally { await handle.close(); }
}
async function writeImmutable(directory, name, bytes, hash, repairCorrupt) {
  const path = join(directory, name), temporary = join(directory, `.cv-write-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await realpath(directory) !== directory || (await lstat(directory)).isSymbolicLink()) throw unsafe();
      try {
        // A hard-link publication is atomic and never replaces an existing name.
        // A crash before this point leaves only a private, unreferenced temp file.
        await link(temporary, path);
        return path;
      } catch (error) { if (error.code !== 'EEXIST') throw unsafe(); }
      const before = await lstat(path);
      if (before.isSymbolicLink() || !before.isFile()) throw unsafe();
      if (before.size === bytes.length) {
        const current = await readRegular(path, MAX_CV_ARTIFACT_BYTES);
        if (digest(current) === hash) return path;
      }
      if (!repairCorrupt) throw new CvArtifactError('CV_ARTIFACT_CHANGED', 'The prepared browser copy changed; start a new explicit run to prepare a fresh copy.', 409, 'Start a new explicit run to prepare a fresh browser copy. Inspect any uncertain submission before retrying. Your saved original was not changed.');
      // Repair is permitted only for an explicit original upload, or a separate
      // browser cache rebuilt from the already verified original bytes.
      // Preserve the damaged bytes privately rather than overwriting or deleting them.
      const current = await lstat(path);
      if (current.isSymbolicLink() || !current.isFile() || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs) throw unsafe();
      const quarantine = join(directory, `.corrupt-${hash}-${randomUUID()}`);
      await rename(path, quarantine);
      const moved = await lstat(quarantine);
      if (moved.isSymbolicLink() || !moved.isFile() || moved.dev !== before.dev || moved.ino !== before.ino) throw unsafe();
    }
    throw unsafe();
  } finally { await unlink(temporary).catch(() => {}); }
}
async function immutableFile(directory, name, bytes, hash, repairCorrupt = false) {
  const key = join(directory, name), previous = pendingWrites.get(key);
  if (previous) await previous;
  const operation = writeImmutable(directory, name, bytes, hash, repairCorrupt);
  pendingWrites.set(key, operation);
  try { return await operation; }
  finally { if (pendingWrites.get(key) === operation) pendingWrites.delete(key); }
}
const descriptor = metadata => ({ status: 'ready', available: true, filename: metadata.filename, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256, savedAt: metadata.savedAt, source: 'user_selected_file', contentVerified: false });
const needsYou = error => ({ status: 'needs_you', available: false, code: error?.code === 'ENOENT' ? 'CV_ARTIFACT_MISSING' : error instanceof CvArtifactError ? error.code : 'CV_ARTIFACT_UNAVAILABLE', nextStep: error instanceof CvArtifactError ? error.nextStep : CHOOSE_FILE });
async function loadArtifact(dataDir) {
  const root = await privateRoot(dataDir, false);
  const directory = root && await childDirectory(root, ['cv-artifacts'], false);
  if (!directory) throw Object.assign(new Error('CV file missing.'), { code: 'ENOENT' });
  let metadata;
  try { metadata = JSON.parse((await readRegular(join(directory, 'current.json'), 4096)).toString('utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof CvArtifactError) throw error; throw new CvArtifactError('CV_ARTIFACT_CHANGED', 'The saved CV metadata changed. Choose your original file again.', 409); }
  if (!metadata || metadata.schemaVersion !== 1 || typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !Object.hasOwn(TYPES, metadata.extension) || metadata.mimeType !== TYPES[metadata.extension] || !Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 1 || metadata.sizeBytes > MAX_CV_ARTIFACT_BYTES || typeof metadata.savedAt !== 'string' || !Number.isFinite(Date.parse(metadata.savedAt))) throw new CvArtifactError('CV_ARTIFACT_CHANGED', 'The saved CV metadata changed. Choose your original file again.', 409);
  let normalized;
  try { normalized = filenameInfo(metadata.filename); } catch { throw unsafe(); }
  if (normalized.filename !== metadata.filename || normalized.extension !== metadata.extension) throw unsafe();
  const path = join(directory, metadata.sha256 + metadata.extension), bytes = await readRegular(path, MAX_CV_ARTIFACT_BYTES);
  if (bytes.length !== metadata.sizeBytes || digest(bytes) !== metadata.sha256) throw new CvArtifactError('CV_ARTIFACT_CHANGED', 'The saved CV file changed. Choose your original file again.', 409);
  const original = await lstat(path);
  if (original.isSymbolicLink() || !original.isFile()) throw unsafe();
  return { root, metadata, bytes, original };
}

const sameInode = (first, second) => first.dev === second.dev && first.ino === second.ino;
async function browserCache(artifact) {
  const directory = await childDirectory(artifact.root, ['browser-output', 'cv', '.cache'], true), name = artifact.metadata.sha256 + artifact.metadata.extension, path = join(directory, name);
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile() || sameInode(info, artifact.original)) throw unsafe();
    if (info.size === artifact.bytes.length && digest(await readRegular(path, MAX_CV_ARTIFACT_BYTES)) === artifact.metadata.sha256) return path;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // This copy always has its own inode. Never hardlink the saved original into
  // browser output, where a changed attempt path would otherwise modify it.
  return immutableFile(directory, name, artifact.bytes, artifact.metadata.sha256, true);
}
async function linkBrowserCopy(cache, directory, artifact) {
  if (await realpath(directory) !== directory || (await lstat(directory)).isSymbolicLink() || await realpath(dirname(cache)) !== dirname(cache) || (await lstat(dirname(cache))).isSymbolicLink()) throw unsafe();
  const path = join(directory, artifact.metadata.sha256 + artifact.metadata.extension), source = await lstat(cache);
  if (source.isSymbolicLink() || !source.isFile() || sameInode(source, artifact.original)) throw unsafe();
  try { await link(cache, path); } catch (error) { if (error.code !== 'EEXIST') throw unsafe(); }
  const target = await lstat(path);
  if (target.isSymbolicLink() || !target.isFile() || sameInode(target, artifact.original)) throw unsafe();
  const bytes = await readRegular(path, MAX_CV_ARTIFACT_BYTES);
  if (bytes.length !== artifact.bytes.length || digest(bytes) !== artifact.metadata.sha256) throw new CvArtifactError('CV_ARTIFACT_CHANGED', 'The prepared browser copy changed; start a new explicit run to prepare a fresh copy.', 409, 'Start a new explicit run to prepare a fresh browser copy. Inspect any uncertain submission before retrying. Your saved original was not changed.');
  return path;
}

async function saveValidated({ dataDir, bytes, filename } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_CV_ARTIFACT_BYTES) throw invalid('Choose a nonempty PDF or DOCX up to 10 MB.');
  const copy = Buffer.from(bytes), type = filenameInfo(filename);
  checkFormat(copy, type.extension);
  const root = await privateRoot(dataDir, true), directory = await childDirectory(root, ['cv-artifacts'], true), sha256 = digest(copy);
  await immutableFile(directory, sha256 + type.extension, copy, sha256, true);
  const metadata = { schemaVersion: 1, ...type, sizeBytes: copy.length, sha256, savedAt: new Date().toISOString() };
  const target = join(directory, 'current.json'), temporary = join(directory, '.current-' + randomUUID() + '.tmp');
  try {
    try { const existing = await lstat(target); if (existing.isSymbolicLink() || !existing.isFile()) throw unsafe(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(metadata)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
  return descriptor(metadata);
}

export async function saveCvArtifact(options = {}) {
  try { return await saveValidated(options); }
  catch (error) { if (error instanceof CvArtifactError) throw error; throw new CvArtifactError('CV_ARTIFACT_UNAVAILABLE', 'The CV file could not be saved privately.', 409, 'Check access to Tawdheef’s private data folder, then choose your original CV again.'); }
}

/** Integrity/format metadata only; never return CV bytes or a provider URL here. */
export async function getCvArtifactStatus({ dataDir } = {}) {
  try { const { metadata } = await loadArtifact(dataDir); return descriptor(metadata); }
  catch (error) { return needsYou(error); }
}

/** The API/domain caller must verify active run scope and allowed purpose before staging. */
async function stageValidated({ dataDir, runId, companyId } = {}) {
  if (!id(runId) || !id(companyId)) throw invalid('Use the active run and company IDs to prepare a CV file.');
  let artifact;
  try { artifact = await loadArtifact(dataDir); } catch (error) { return needsYou(error); }
  const cache = await browserCache(artifact), directory = await childDirectory(artifact.root, ['browser-output', 'cv', runId, companyId], true);
  const path = await linkBrowserCopy(cache, directory, artifact);
  return { ...descriptor(artifact.metadata), path };
}

export async function stageCvArtifact(options = {}) {
  try { return await stageValidated(options); }
  catch (error) { if (error instanceof CvArtifactError) throw error; throw new CvArtifactError('CV_ARTIFACT_UNAVAILABLE', 'The original CV could not be prepared privately.', 409, 'Check access to Tawdheef’s private data folder, then choose your original CV again.'); }
}
