import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { openBoundedArchive, readArchiveFile, MAX_PACK_ARCHIVE_BYTES, MAX_PACK_SOURCE_BYTES } from './pack-archive.mjs';
import { validatePackDefinition, validatePackSource, assertPackScan, MAX_PACK_GUIDANCE_BYTES } from './pack-validation.mjs';
import { compareDirectoryPackVersions } from './pack-store.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const DEFINITION_FIELDS = ['id', 'name', 'country', 'countries', 'kind', 'snapshotDate', 'source', 'sourceSha256', 'description', 'featured', 'historical', 'credit', 'license', 'notes', 'tags', 'overlaps', 'formatVersion', 'version', 'createdBy', 'maintainers', 'contributors', 'releasedAt', 'updatedAt', 'guide', 'changelog', 'minimumAppVersion'];
const filename = name => {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/.test(name)) throw new Error('Use a root-level pack filename.');
  return name;
};
const definitionFromManifest = manifest => {
  const definition = Object.fromEntries(DEFINITION_FIELDS.filter(key => manifest[key] !== undefined).map(key => [key, manifest[key]]));
  if (definition.formatVersion === 2) { definition.guide = manifest.files?.guide || definition.guide; definition.changelog = manifest.files?.changelog || definition.changelog; }
  return definition;
};
const summary = material => {
  const { pack } = material;
  return { ...pack, recordCount: material.records?.length ?? pack.recordCount };
};

/** One pack service per running local app; no network downloads, code execution or provider access. */
export function createDirectoryPacks({ store, root = ROOT, clock = () => Date.now() } = {}) {
  if (!store) throw new Error('A tracker store is required.');
  const previews = new Map();
  let previewing = false, previewTimer;
  const dropPreviews = () => { clearTimeout(previewTimer); previews.clear(); };
  const clearExpired = () => { for (const item of previews.values()) if (item.expiresAt <= Number(clock())) { dropPreviews(); break; } };
  async function localFile(path, maxBytes) {
    const intended = resolve(root, path), resolvedRoot = await realpath(root), actual = await realpath(intended), rel = relative(resolvedRoot, actual);
    if (isAbsolute(rel) || rel.startsWith('..') || rel.split(/[\\/]/).some(part => part.startsWith('.')) || !/^(directories|data)[\\/]/.test(rel)) throw new Error('Pack files must stay inside the public directories or data folder.');
    const info = await stat(actual); if (!info.isFile() || info.size > maxBytes) throw new Error('This public pack file exceeds its size limit.');
    return readFile(actual);
  }
  async function definitions() {
    const result = [];
    const entries = await readdir(join(root, 'directories'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      try {
        const def = JSON.parse((await localFile(`directories/${entry.name}/pack.json`, 256 * 1024)).toString('utf8'));
        validatePackDefinition(def, { folder: entry.name }); result.push(def);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  async function available() {
    let catalog = []; try { catalog = JSON.parse((await localFile('directories/catalog.json', 2 * 1024 * 1024)).toString('utf8')).packs || []; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return (await definitions()).map(def => {
      const listed = catalog.find(item => item.id === def.id) || {};
      return { id: def.id, name: def.name, country: def.country, countries: def.countries || [def.country], kind: def.kind || 'country', version: def.version || def.snapshotDate,
        formatVersion: def.formatVersion || 1, description: def.description || '', createdBy: def.createdBy || null, maintainers: def.maintainers || [], contributors: def.contributors || [],
        updatedAt: def.updatedAt || def.snapshotDate, releasedAt: def.releasedAt || null, snapshotDate: def.snapshotDate, recordCount: listed.recordCount ?? null, historical: def.historical === true,
        source: 'bundled', sourceAvailable: existsSync(resolve(root, def.source)), reviewStatus: 'bundled_source', published: Boolean(def.releasedAt), minimumAppVersion: def.minimumAppVersion || null, downloadUrl: listed.downloadUrl || null, guidanceStatus: def.formatVersion === 2 ? 'scanned_on_preview' : 'legacy_data_only' };
    });
  }
  function materialise(def, snapshot, sourceBytes, guide = '', changelog = '', extra = {}) {
    validatePackDefinition(def);
    if (def.minimumAppVersion) {
      const required = def.minimumAppVersion.split(/[.-]/).slice(0, 3).map(Number), current = APP_VERSION.split(/[.-]/).slice(0, 3).map(Number);
      let comparison = 0; for (let index = 0; index < 3 && !comparison; index++) comparison = current[index] - required[index];
      if (comparison < 0) throw new Error(`This pack requires Tawdheef ${def.minimumAppVersion} or later. Update the app before importing it.`);
    }
    validatePackSource(snapshot, def);
    const sourceSha256 = hash(sourceBytes);
    if (def.sourceSha256 && def.sourceSha256 !== sourceSha256) throw new Error('Pack source hash does not match its reviewed definition.');
    assertPackScan(guide, { path: `${def.id}/GUIDE.md`, guidance: true });
    assertPackScan(changelog, { path: `${def.id}/CHANGELOG.md`, guidance: false });
    return { pack: { id: def.id, packId: def.id, name: def.name, country: def.country, countries: def.countries || [def.country], kind: def.kind || 'country', version: def.version || def.snapshotDate,
      formatVersion: def.formatVersion || 1, description: def.description || '', createdBy: def.createdBy || null, maintainers: def.maintainers || [], contributors: def.contributors || [], credit: def.credit || '',
      releasedAt: def.releasedAt || null, declaredReleasedAt: def.releasedAt || null, published: extra.source === 'bundled' && Boolean(def.releasedAt), reviewStatus: extra.source === 'bundled' ? 'bundled_source' : 'local_unverified', minimumAppVersion: def.minimumAppVersion || null, updatedAt: def.updatedAt || def.snapshotDate, snapshotDate: def.snapshotDate, recordCount: snapshot.records.length, sourceSha256,
      guidanceSha256: guide ? hash(Buffer.from(guide)) : null, changelogSha256: changelog ? hash(Buffer.from(changelog)) : null,
      guidanceStatus: def.formatVersion === 2 ? 'scanned' : 'legacy_data_only', ...extra }, records: snapshot.records, guide, changelog };
  }
  async function bundled(id) {
    const def = (await definitions()).find(item => item.id === id); if (!def) throw new Error('Directory pack not found.');
    let source;
    try { source = await localFile(def.source, MAX_PACK_SOURCE_BYTES); }
    catch (error) { if (error.code === 'ENOENT') throw new Error('Download this pack ZIP from its published GitHub release, then choose Import pack. This app package includes directory details but not the full source dataset.'); throw error; }
    let guide = '', changelog = '';
    if (def.formatVersion === 2) {
      guide = (await localFile(`directories/${def.id}/${filename(def.guide)}`, MAX_PACK_GUIDANCE_BYTES)).toString('utf8');
      changelog = (await localFile(`directories/${def.id}/${filename(def.changelog)}`, MAX_PACK_GUIDANCE_BYTES)).toString('utf8');
    }
    return materialise(def, JSON.parse(source.toString('utf8')), source, guide, changelog, { source: 'bundled' });
  }
  async function archive(input) {
    if (!/\.zip$/i.test(input.filename || '')) throw new Error('Choose a directory-pack ZIP.');
    let buffer;
    if (Buffer.isBuffer(input.content)) buffer = input.content;
    else {
      if (typeof input.content !== 'string' || input.content.length > Math.ceil(MAX_PACK_ARCHIVE_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content)) throw new Error('Choose a ZIP within 20 MB.');
      buffer = Buffer.from(input.content, 'base64');
    }
    const zip = await openBoundedArchive(buffer, { flat: true });
    const budget = { used: 0, max: MAX_PACK_SOURCE_BYTES + 256 * 1024 };
    const manifest = JSON.parse((await readArchiveFile(zip, 'manifest.json', { maxBytes: 256 * 1024, budget })).toString('utf8'));
    if (![1, 2].includes(manifest.formatVersion)) throw new Error('This pack format is not supported.');
    const def = definitionFromManifest(manifest); validatePackDefinition(def);
    const source = await readArchiveFile(zip, filename(manifest.files?.original), { maxBytes: MAX_PACK_SOURCE_BYTES, budget });
    if (!/^[a-f0-9]{64}$/.test(manifest.sourceSha256 || '') || hash(source) !== manifest.sourceSha256) throw new Error('The pack source hash does not match its manifest.');
    let guide = '', changelog = '';
    if (manifest.formatVersion === 2) {
      const readVerified = async (name, expected) => {
        const bytes = await readArchiveFile(zip, filename(name), { maxBytes: MAX_PACK_GUIDANCE_BYTES, budget });
        if (!/^[a-f0-9]{64}$/.test(expected || '') || hash(bytes) !== expected) throw new Error('The pack guidance or update-history hash does not match its manifest.');
        return bytes.toString('utf8');
      };
      guide = await readVerified(manifest.files.guide, manifest.guidanceSha256);
      changelog = await readVerified(manifest.files.changelog, manifest.changelogSha256);
    }
    return materialise(def, JSON.parse(source.toString('utf8')), source, guide, changelog, { source: 'local_file' });
  }
  return {
    async list({ directoryId } = {}) {
      const packs = await available();
      const installed = store.listInstalledDirectoryPacks({ directoryId }).map(pack => {
        const next = packs.find(item => item.id === pack.id);
        return { ...pack, availableVersion: next?.version || null, updateAvailable: Boolean(next && compareDirectoryPackVersions(next, pack) > 0), integrityCheckedAtInstall: true };
      });
      return { available: packs, installed };
    },
    async get(id, { directoryId } = {}) {
      try { return store.getInstalledDirectoryPack(id, directoryId); } catch (error) { if (error.status !== 404) throw error; }
      const def = (await definitions()).find(item => item.id === id); if (!def) throw new Error('Directory pack not found.');
      const pack = (await available()).find(item => item.id === id);
      let guide = '', changelog = '';
      if (def.formatVersion === 2) {
        guide = (await localFile(`directories/${def.id}/${filename(def.guide)}`, MAX_PACK_GUIDANCE_BYTES)).toString('utf8');
        changelog = (await localFile(`directories/${def.id}/${filename(def.changelog)}`, MAX_PACK_GUIDANCE_BYTES)).toString('utf8');
        assertPackScan(guide, { path: `${id}/GUIDE.md`, guidance: true });
        assertPackScan(changelog, { path: `${id}/CHANGELOG.md`, guidance: false });
      }
      return { ...pack, guide, changelog };
    },
    async preview(input = {}) {
      if (Boolean(input.packId) === Boolean(input.content)) throw new Error('Choose one bundled pack or one local ZIP.');
      if (input.directoryId !== undefined && typeof input.directoryId !== 'string') throw new Error('Choose a directory.');
      if (previewing) throw new Error('Another pack is being read. Wait for its preview before choosing a different pack.');
      previewing = true;
      try {
        dropPreviews();
        const material = input.packId ? await bundled(input.packId) : await archive(input);
        const inspected = store.previewDirectoryPack({ ...material, directoryId: input.directoryId });
        const previewId = randomUUID(), expiresAt = Number(clock()) + 10 * 60_000;
        previews.set(previewId, { material, directoryId: input.directoryId, fingerprint: inspected.fingerprint, expiresAt });
        previewTimer = setTimeout(dropPreviews, 10 * 60_000); previewTimer.unref?.();
        return { previewId, pack: summary(material), directoryId: input.directoryId || null, expiresAt: new Date(expiresAt).toISOString(), ...inspected,
          warnings: [...inspected.warnings, ...(material.pack.formatVersion === 1 ? ['Legacy data pack: no pack-specific agent guidance or verified maintainer metadata.'] : []),
            'Scanning does not establish that a pack is safe or that recruitment routes work. Installing never starts applications or schedules.'] };
      } finally { previewing = false; }
    },
    async install({ previewId, directoryId } = {}) {
      clearExpired(); const preview = previews.get(previewId);
      if (!preview) throw new Error('This preview expired or the local app restarted. Review the pack again.');
      if (directoryId !== undefined && directoryId !== preview.directoryId) throw new Error('The target directory changed. Review this pack again.');
      const result = store.installDirectoryPack({ ...preview.material, directoryId: preview.directoryId, expectedFingerprint: preview.fingerprint });
      dropPreviews(); return result;
    },
    remove(input) { return store.removeDirectoryPack(input); },
    close() { dropPreviews(); },
  };
}
