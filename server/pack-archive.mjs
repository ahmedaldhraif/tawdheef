import JSZip from 'jszip';

export const MAX_PACK_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const MAX_PACK_SOURCE_BYTES = 80 * 1024 * 1024;

/** Archive names are inspected before JSZip can normalise traversal or collapse duplicates. */
export function inspectArchive(buffer, { maxBytes = MAX_PACK_ARCHIVE_BYTES, maxEntries = 2000, maxDeclaredBytes = 256 * 1024 * 1024, flat = false } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > maxBytes || buffer.length < 22) throw new Error('Choose a ZIP file within the allowed size.');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('This archive is not a supported single-volume ZIP.');
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16);
  if (offset + buffer.readUInt32LE(end + 12) !== end) throw new Error('This archive has unsupported or inconsistent directory metadata.');
  if (count === 0xffff || count > maxEntries || offset === 0xffffffff) throw new Error('This archive contains too many files or uses unsupported ZIP64 metadata.');
  const names = new Set(); let position = offset, declaredBytes = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || buffer.readUInt32LE(position) !== 0x02014b50) throw new Error('This archive has invalid file metadata.');
    const flags = buffer.readUInt16LE(position + 8), length = buffer.readUInt16LE(position + 28), extra = buffer.readUInt16LE(position + 30), comment = buffer.readUInt16LE(position + 32);
    const unixMode = buffer.readUInt32LE(position + 38) >>> 16;
    if (flags & 1 || (unixMode & 0xf000) === 0xa000 || position + 46 + length + extra + comment > end) throw new Error('Encrypted files and symbolic links are not supported.');
    const name = buffer.subarray(position + 46, position + 46 + length).toString('utf8');
    if (!name || /[\\\x00-\x1f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some(part => part === '..' || part === '.') || names.has(name)) throw new Error('Archive paths must be unique and stay inside the pack.');
    if (flat && (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/.test(name) || !/\.(json|csv|tsv|md|txt)$/i.test(name))) throw new Error('Directory packs contain only root-level JSON, CSV, Markdown and text files.');
    names.add(name); declaredBytes += buffer.readUInt32LE(position + 24);
    if (declaredBytes > maxDeclaredBytes) throw new Error('This archive expands beyond the allowed size.');
    position += 46 + length + extra + comment;
  }
  if (position !== end) throw new Error('Archive entry count does not match its directory metadata.');
  return { names, declaredBytes };
}

export async function openBoundedArchive(buffer, options) {
  inspectArchive(buffer, options);
  return JSZip.loadAsync(buffer);
}

/** The limit is charged against actual emitted chunks, never trusted ZIP size declarations. */
export async function readArchiveFile(zip, name, { maxBytes = MAX_PACK_SOURCE_BYTES, budget = { used: 0, max: 100 * 1024 * 1024 } } = {}) {
  const file = zip.file(name);
  if (!file || file.dir) throw new Error(`Archive file missing: ${name}`);
  return new Promise((accept, reject) => {
    let size = 0, finished = false; const chunks = [];
    const stream = file.internalStream('nodebuffer');
    const fail = error => { if (finished) return; finished = true; stream.pause(); chunks.length = 0; reject(error); };
    stream.on('data', chunk => {
      if (finished) return;
      size += chunk.length; budget.used += chunk.length;
      if (size > maxBytes || budget.used > budget.max) return fail(new Error('This archive exceeds the actual decompressed-size limit. Use a smaller file.'));
      chunks.push(chunk);
    });
    stream.on('error', fail);
    stream.on('end', () => { if (!finished) { finished = true; accept(Buffer.concat(chunks, size)); } });
    stream.resume();
  });
}
