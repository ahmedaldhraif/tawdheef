import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { saveCvArtifact, getCvArtifactStatus, stageCvArtifact, MAX_CV_ARTIFACT_BYTES } from '../server/cv-artifacts.mjs';

const pdf = Buffer.from('%PDF-1.7\nExact private original fixture bytes, never a generated candidate CV.\n%%EOF\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-cv-file-'));
  t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'tawdheef-cv-file-'))); return rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  return { root, dataDir: join(root, 'private') };
}
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; } return (value ^ 0xffffffff) >>> 0; }
function docx({ compressed = false, omitDocument = false, utf16 = false } = {}) {
  const locals = [], central = []; let offset = 0;
  const entries = [['[Content_Types].xml', '<Types><Override PartName="/word/document.xml"/></Types>'], ...omitDocument ? [] : [['word/document.xml', '<w:document><w:body><w:p>Exact fixture</w:p></w:body></w:document>']]];
  for (const [name, text] of entries) {
    const filename = Buffer.from(name), bytes = utf16 ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) : Buffer.from(text), payload = compressed ? deflateRawSync(bytes) : bytes, crc = crc32(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(compressed ? 8 : 0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(compressed ? 8 : 0, 10); header.writeUInt32LE(crc, 16); header.writeUInt32LE(payload.length, 20); header.writeUInt32LE(bytes.length, 24); header.writeUInt16LE(filename.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local, filename, payload); central.push(header, filename); offset += local.length + filename.length + payload.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('chosen PDF is stored privately, reports metadata only and stages exactly the original bytes', async t => {
  const { dataDir } = await fixture(t);
  const saved = await saveCvArtifact({ dataDir, bytes: pdf, filename: '..\\..\\My CV.PDF' });
  assert.equal(saved.status, 'ready'); assert.equal(saved.filename, 'My CV.pdf'); assert.equal(saved.sha256, hash(pdf)); assert.equal(saved.sizeBytes, pdf.length);
  assert.equal(saved.mimeType, 'application/pdf'); assert.equal(saved.source, 'user_selected_file'); assert.equal(saved.contentVerified, false);
  assert.deepEqual(await getCvArtifactStatus({ dataDir }), saved); assert.ok(!JSON.stringify(saved).includes('Exact private'));
  const staged = await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' });
  assert.deepEqual(await readFile(staged.path), pdf); assert.equal(staged.path, join(await realpath(dataDir), 'browser-output/cv/run_fixture/company_fixture', hash(pdf) + '.pdf'));
  assert.deepEqual(await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' }), staged);
  if (process.platform !== 'win32') { assert.equal((await stat(staged.path)).mode & 0o777, 0o600); assert.equal((await stat(join(dataDir, 'cv-artifacts'))).mode & 0o777, 0o700); }
});

test('PDF and DOCX validation rejects empty, oversized, mismatched and damaged files before changing the selected file', async t => {
  const { dataDir } = await fixture(t); await saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' });
  const before = await readFile(join(dataDir, 'cv-artifacts/current.json'), 'utf8');
  for (const [bytes, filename] of [[Buffer.alloc(0), 'empty.pdf'], [Buffer.alloc(MAX_CV_ARTIFACT_BYTES + 1), 'huge.pdf'], [Buffer.from('not PDF'), 'fake.pdf'], [pdf, 'fake.docx'], [docx(), 'fake.pdf'], [pdf, 'cv.exe'], [docx({ omitDocument: true }), 'missing.docx']]) await assert.rejects(saveCvArtifact({ dataDir, bytes, filename }), error => error.code === 'CV_ARTIFACT_INVALID');
  const damaged = docx(); damaged[40] ^= 1;
  await assert.rejects(saveCvArtifact({ dataDir, bytes: damaged, filename: 'damaged.docx' }), error => error.code === 'CV_ARTIFACT_INVALID');
  assert.equal(await readFile(join(dataDir, 'cv-artifacts/current.json'), 'utf8'), before);
});

test('both stored and deflated DOCX ZIPs retain their exact bytes and declared MIME', async t => {
  const { dataDir } = await fixture(t);
  for (const options of [{ compressed: false }, { compressed: true }, { compressed: true, utf16: true }]) {
    const bytes = docx(options), saved = await saveCvArtifact({ dataDir, bytes, filename: 'CV.docx' });
    assert.equal(saved.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); assert.equal(saved.sha256, hash(bytes));
    const staged = await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_docx' }); assert.deepEqual(await readFile(staged.path), bytes);
  }
  const entries = await readdir(join(dataDir, 'cv-artifacts')); assert.ok(!entries.some(name => name.endsWith('.tmp')));
});

test('missing artifact checks are read-only and return one actionable Needs you item', async t => {
  const { dataDir } = await fixture(t);
  for (const status of [await getCvArtifactStatus({ dataDir }), await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' })]) {
    assert.equal(status.status, 'needs_you'); assert.equal(status.available, false); assert.equal(status.code, 'CV_ARTIFACT_MISSING'); assert.match(status.nextStep, /Choose your original PDF or DOCX/); assert.equal(status.path, undefined);
  }
  await assert.rejects(lstat(dataDir), { code: 'ENOENT' });
});

test('content-hash addressing retains old originals and rejects changed stored or staged bytes', async t => {
  const { dataDir } = await fixture(t), original = await saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' });
  const originalPath = join(dataDir, 'cv-artifacts', original.sha256 + '.pdf');
  const staged = await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' });
  await writeFile(staged.path, Buffer.from('changed staged file'));
  await assert.rejects(stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' }), error => error.code === 'CV_ARTIFACT_CHANGED');
  assert.deepEqual(await readFile(originalPath), pdf);
  await writeFile(originalPath, Buffer.from('changed private file'));
  assert.equal((await getCvArtifactStatus({ dataDir })).code, 'CV_ARTIFACT_CHANGED');
  assert.equal((await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'other_company' })).status, 'needs_you');
  assert.equal((await getCvArtifactStatus({ dataDir })).path, undefined);
});

test('a replacement selects new bytes atomically while old immutable originals stay available', async t => {
  const { dataDir } = await fixture(t), first = await saveCvArtifact({ dataDir, bytes: pdf, filename: 'first.pdf' });
  const next = Buffer.from('%PDF-2.0\nDifferent exact user-selected fixture\n%%EOF\n');
  const second = await saveCvArtifact({ dataDir, bytes: next, filename: 'second.pdf' });
  assert.notEqual(first.sha256, second.sha256); assert.deepEqual(await readFile(join(dataDir, 'cv-artifacts', first.sha256 + '.pdf')), pdf);
  assert.deepEqual(await getCvArtifactStatus({ dataDir }), second);
  const path = join(dataDir, 'cv-artifacts', second.sha256 + '.pdf'), before = await stat(path);
  const repeated = await saveCvArtifact({ dataDir, bytes: next, filename: 'renamed.pdf' }); assert.equal(repeated.sha256, second.sha256);
  assert.equal((await stat(path)).ino, before.ino); assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
});

test('explicit reselection recovers a truncated SHA orphan and quarantines changed originals without losing their bytes', async t => {
  const { dataDir } = await fixture(t), directory = join(dataDir, 'cv-artifacts'), path = join(directory, hash(pdf) + '.pdf');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, Buffer.from('%PDF-'), { mode: 0o600 });
  const first = await saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' });
  assert.equal(first.sha256, hash(pdf)); assert.deepEqual(await readFile(path), pdf);
  const initialQuarantine = (await readdir(directory)).filter(name => name.startsWith('.corrupt-'));
  assert.equal(initialQuarantine.length, 1); assert.equal(await readFile(join(directory, initialQuarantine[0]), 'utf8'), '%PDF-');
  const changed = Buffer.from('%PDF-1.7\nDifferent file in a damaged owned slot\n%%EOF\n'); await writeFile(path, changed);
  assert.equal((await getCvArtifactStatus({ dataDir })).status, 'needs_you');
  await Promise.all([saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' }), saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' })]);
  const quarantine = (await readdir(directory)).filter(name => name.startsWith('.corrupt-'));
  assert.equal(quarantine.length, 2); assert.ok((await Promise.all(quarantine.map(name => readFile(join(directory, name))))).some(bytes => bytes.equals(changed)));
  assert.equal((await getCvArtifactStatus({ dataDir })).status, 'ready'); assert.deepEqual(await readFile(path), pdf);
  const staged = await stageCvArtifact({ dataDir, runId: 'run_recovered', companyId: 'company_fixture' }); assert.deepEqual(await readFile(staged.path), pdf);
  assert.ok(!(await readdir(directory)).some(name => name.startsWith('.cv-write-')));
});

test('a SHA slot symlink is never repaired, followed or allowed to overwrite its unrelated target', async t => {
  const { root, dataDir } = await fixture(t), directory = join(dataDir, 'cv-artifacts'), outside = join(root, 'unrelated.pdf');
  await mkdir(directory, { recursive: true }); await writeFile(outside, pdf);
  try { await symlink(outside, join(directory, hash(pdf) + '.pdf'), 'file'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('File symlinks unavailable without additional privileges.'); return; } throw error; }
  await assert.rejects(saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  assert.deepEqual(await readFile(outside), pdf); assert.ok(!(await readdir(directory)).some(name => name.startsWith('.corrupt-') || name.startsWith('.cv-write-')));
});

test('the exact 10 MB limit is supported and concurrent staging of the same original is idempotent', async t => {
  const { dataDir } = await fixture(t), bytes = Buffer.alloc(MAX_CV_ARTIFACT_BYTES, 32); pdf.copy(bytes);
  const saved = await saveCvArtifact({ dataDir, bytes, filename: 'large.pdf' }); assert.equal(saved.sizeBytes, MAX_CV_ARTIFACT_BYTES);
  const copies = await Promise.all(Array.from({ length: 3 }, () => stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' })));
  assert.ok(copies.every(copy => copy.path === copies[0].path && copy.sha256 === saved.sha256)); assert.equal(hash(await readFile(copies[0].path)), hash(bytes));
});

test('100 companies over two runs share one separate browser payload and cache repair never alters the original', async t => {
  const { dataDir } = await fixture(t), bytes = Buffer.alloc(400 * 1024, 32); pdf.copy(bytes);
  const saved = await saveCvArtifact({ dataDir, bytes, filename: 'original.pdf' }), originalPath = join(dataDir, 'cv-artifacts', saved.sha256 + '.pdf'), originalBefore = await stat(originalPath), paths = [];
  for (const runId of ['run_first', 'run_second']) for (let company = 0; company < 100; company++) paths.push((await stageCvArtifact({ dataDir, runId, companyId: `company_${company}` })).path);
  const cachePath = join(dataDir, 'browser-output/cv/.cache', saved.sha256 + '.pdf'), payloads = await Promise.all([cachePath, ...paths].map(path => stat(path))), inodes = new Map(payloads.map(info => [`${info.dev}:${info.ino}`, info.size]));
  assert.equal(paths.length, 200); assert.equal(inodes.size, 1); assert.equal([...inodes.values()].reduce((sum, size) => sum + size, 0), bytes.length);
  assert.ok(payloads[0].nlink >= 201); assert.ok(payloads.every(info => info.dev !== originalBefore.dev || info.ino !== originalBefore.ino)); assert.deepEqual(await readFile(originalPath), bytes);
  t.diagnostic(JSON.stringify({ stagedPaths: paths.length, distinctBrowserPayloadInodes: inodes.size, uniqueBrowserPayloadBytes: bytes.length, originalHasSeparateInode: true }));
  await writeFile(paths[0], Buffer.from('damaged browser cache through an attempt link'));
  assert.deepEqual(await readFile(originalPath), bytes); assert.equal((await getCvArtifactStatus({ dataDir })).status, 'ready');
  const recovered = await stageCvArtifact({ dataDir, runId: 'run_fresh', companyId: 'company_fresh' }); assert.deepEqual(await readFile(recovered.path), bytes);
  assert.notEqual((await stat(recovered.path)).ino, payloads[0].ino); assert.equal((await stat(originalPath)).ino, originalBefore.ino);
  await assert.rejects(stageCvArtifact({ dataDir, runId: 'run_first', companyId: 'company_0' }), error => error.code === 'CV_ARTIFACT_CHANGED' && /new explicit run/.test(error.nextStep));
  assert.equal(await readFile(paths[0], 'utf8'), 'damaged browser cache through an attempt link'); assert.deepEqual(await readFile(originalPath), bytes);
});

test('a browser cache linked to the original is refused instead of exposing the original inode', async t => {
  const { dataDir } = await fixture(t), saved = await saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' }), directory = join(dataDir, 'browser-output/cv/.cache');
  await mkdir(directory, { recursive: true }); await link(join(dataDir, 'cv-artifacts', saved.sha256 + '.pdf'), join(directory, saved.sha256 + '.pdf'));
  await assert.rejects(stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  assert.deepEqual(await readFile(join(dataDir, 'cv-artifacts', saved.sha256 + '.pdf')), pdf);
});

test('run/company path input and unsafe filenames cannot escape private staging', async t => {
  const { dataDir, root } = await fixture(t); await saveCvArtifact({ dataDir, bytes: pdf, filename: 'NUL.pdf' });
  assert.equal((await getCvArtifactStatus({ dataDir })).filename, 'CV-NUL.pdf');
  for (const bad of ['..', '../outside', '..\\outside', 'C:\\outside', '/outside', 'with space', '%2e%2e', 'x'.repeat(129), '', 'NUL', 'COM1']) {
    await assert.rejects(stageCvArtifact({ dataDir, runId: bad, companyId: 'company_fixture' }), error => error.code === 'CV_ARTIFACT_INVALID');
    await assert.rejects(stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: bad }), error => error.code === 'CV_ARTIFACT_INVALID');
  }
  await assert.rejects(lstat(join(root, 'outside')), { code: 'ENOENT' });
});

test('managed-directory junctions/symlinks cannot redirect storage or staging outside the private folder', async t => {
  const { dataDir, root } = await fixture(t), outside = join(root, 'outside'); await mkdir(dataDir); await mkdir(outside);
  const link = join(dataDir, 'cv-artifacts');
  try { await symlink(outside, link, 'junction'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory links unavailable in this environment.'); return; } throw error; }
  await assert.rejects(saveCvArtifact({ dataDir, bytes: pdf, filename: 'cv.pdf' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  assert.equal((await getCvArtifactStatus({ dataDir })).status, 'needs_you'); assert.deepEqual(await readdir(outside), []);
  await rm(link); await saveCvArtifact({ dataDir, bytes: pdf, filename: 'cv.pdf' }); await mkdir(join(dataDir, 'browser-output'));
  await symlink(outside, join(dataDir, 'browser-output/cv'), 'junction');
  await assert.rejects(stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  assert.deepEqual(await readdir(outside), []);
});

test('corrupt metadata and missing immutable bytes cannot expose content or produce a staged path', async t => {
  const { dataDir } = await fixture(t), saved = await saveCvArtifact({ dataDir, bytes: pdf, filename: 'original.pdf' });
  const path = join(dataDir, 'cv-artifacts/current.json'), original = await readFile(path, 'utf8');
  for (const bad of ['private content is not JSON', JSON.stringify({ ...JSON.parse(original), sha256: '../outside' }), JSON.stringify({ ...JSON.parse(original), filename: '../private.pdf' })]) {
    await writeFile(path, bad);
    const status = await getCvArtifactStatus({ dataDir }), staged = await stageCvArtifact({ dataDir, runId: 'run_fixture', companyId: 'company_fixture' });
    assert.equal(status.status, 'needs_you'); assert.equal(staged.path, undefined); assert.ok(!JSON.stringify(status).includes('private content'));
  }
  await writeFile(path, original); await rm(join(dataDir, 'cv-artifacts', saved.sha256 + '.pdf'));
  assert.equal((await getCvArtifactStatus({ dataDir })).status, 'needs_you');
});

test('DOCX encryption, decompression bounds and invalid local offsets fail before publication', async t => {
  const { dataDir } = await fixture(t), template = docx({ compressed: true });
  const encrypted = Buffer.from(template); encrypted.writeUInt16LE(1, 6);
  const oversized = Buffer.from(template), central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); oversized.writeUInt32LE(21 * 1024 * 1024, central + 24);
  const offset = Buffer.from(template); offset.writeUInt32LE(0xffffffff, central + 42);
  for (const bytes of [encrypted, oversized, offset]) await assert.rejects(saveCvArtifact({ dataDir, bytes, filename: 'invalid.docx' }), error => error.code === 'CV_ARTIFACT_INVALID');
  await assert.rejects(lstat(dataDir), { code: 'ENOENT' });
});

test('a symlinked data root and native app resources cannot become CV storage', async t => {
  const { root } = await fixture(t), outside = join(root, 'outside'), alias = join(root, 'data-alias'); await mkdir(outside);
  try { await symlink(outside, alias, 'junction'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory links unavailable in this environment.'); return; } throw error; }
  await assert.rejects(saveCvArtifact({ dataDir: alias, bytes: pdf, filename: 'cv.pdf' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  for (const dataDir of [join(root, 'Tawdheef.app'), join(root, 'Tawdheef.app/Contents/Resources/app/private')]) await assert.rejects(saveCvArtifact({ dataDir, bytes: pdf, filename: 'cv.pdf' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  const packaged = join(root, 'native-package'); await mkdir(join(packaged, 'server'), { recursive: true });
  await copyFile(new URL('../server/cv-artifacts.mjs', import.meta.url), join(packaged, 'server/cv-artifacts.mjs'));
  await writeFile(join(packaged, 'tawdheef-app.json'), JSON.stringify({ format: 1, name: 'Tawdheef', layout: { launcher: 'Tawdheef.exe' } }));
  const native = await import(pathToFileURL(join(packaged, 'server/cv-artifacts.mjs')).href);
  await assert.rejects(native.saveCvArtifact({ dataDir: join(packaged, 'private'), bytes: pdf, filename: 'cv.pdf' }), error => error.code === 'CV_ARTIFACT_UNSAFE_STORAGE');
  assert.deepEqual(await readdir(outside), []);
});
