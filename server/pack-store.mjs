import { createHash, randomUUID } from 'node:crypto';
import { PACK_GUIDANCE_BOUNDARY, MAX_PACK_GUIDANCE_BYTES, assertPackScan } from './pack-validation.mjs';

const FIELDS = ['name', 'arabicName', 'sector', 'location', 'type', 'sourceRole', 'website', 'careersUrl', 'applyUrl', 'linkedinUrl', 'email', 'routeStatus', 'checkedAt', 'sourceFields'];
const DIFF_FIELDS = new Set(FIELDS.filter(field => field !== 'sourceFields'));
const digest = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const value = (record, field) => field === 'sourceFields' ? record[field] || {} : field === 'checkedAt' ? record[field] || null : record[field] || '';
const baseline = record => Object.fromEntries(FIELDS.map(field => [field, digest(value(record, field))]));
const parse = row => row ? JSON.parse(row.payload) : null;

export function compareDirectoryPackVersions(next, current) {
  const nextFormat = next.formatVersion || 1, currentFormat = current.formatVersion || 1;
  if (nextFormat !== currentFormat) return nextFormat - currentFormat;
  if (nextFormat === 1) return String(next.snapshotDate || '').localeCompare(String(current.snapshotDate || ''));
  const parts = version => { const [main, ...suffix] = String(version || '').split('-'); return { main: main.split('.').map(Number), pre: suffix.join('-').split('.').filter(Boolean) }; };
  const a = parts(next.version), b = parts(current.version);
  for (let i = 0; i < 3; i++) if (a.main[i] !== b.main[i]) return a.main[i] - b.main[i];
  if (!a.pre.length || !b.pre.length) return !a.pre.length && !b.pre.length ? 0 : !a.pre.length ? 1 : -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === undefined || b.pre[i] === undefined) return a.pre[i] === undefined ? -1 : 1;
    if (a.pre[i] === b.pre[i]) continue;
    const x = /^\d+$/.test(a.pre[i]), y = /^\d+$/.test(b.pre[i]);
    return x && y ? Number(a.pre[i]) - Number(b.pre[i]) : x !== y ? x ? -1 : 1 : a.pre[i] < b.pre[i] ? -1 : 1;
  }
  return 0;
}

/** Name alone, a hostname alone, and a generic portal never establish shared identity. */
export function packCompanyIdentity(record) {
  if (/portal|programme|program|directory|roster|unresolved|lead/i.test(record.sourceRole || '')) return null;
  const route = record.sourceFields?.recruitment?.profileUrl || record.careersUrl;
  try {
    const url = new URL(route);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.pathname.replace(/\//g, '')) return null;
    const organisation = String(record.name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!organisation) return null;
    return digest([organisation, `${url.origin}${url.pathname.replace(/\/+$/, '')}${url.search}`]);
  } catch { return null; }
}

/** Private membership/provenance is separate from the public source and application history. */
export function createPackStore({ db, store, tx, saveCompany, now, activity, AppError }) {
  db.exec(`CREATE TABLE IF NOT EXISTS directory_packs(id TEXT PRIMARY KEY, directory_id TEXT NOT NULL, pack_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS directory_packs_scope ON directory_packs(directory_id,pack_id);
    CREATE TABLE IF NOT EXISTS pack_memberships(pack_key TEXT NOT NULL, source_id TEXT NOT NULL, company_id TEXT NOT NULL, baseline TEXT NOT NULL, PRIMARY KEY(pack_key,source_id));
    CREATE INDEX IF NOT EXISTS pack_memberships_company ON pack_memberships(company_id);
    CREATE TABLE IF NOT EXISTS company_identities(company_id TEXT NOT NULL, identity_key TEXT NOT NULL, PRIMARY KEY(company_id,identity_key));
    CREATE INDEX IF NOT EXISTS company_identities_key ON company_identities(identity_key);
    CREATE TABLE IF NOT EXISTS company_source_facts(company_id TEXT PRIMARY KEY, source_fields_hash TEXT NOT NULL);`);
  const fail = (condition, message, status = 400) => { if (!condition) throw new AppError(message, status); };
  const keyFor = (directoryId, packId) => JSON.stringify([directoryId, packId]);
  const compactColumns = ['sourceId', 'sourceRole', 'arabicName', 'sector', 'location', 'type', 'website', 'careersUrl', 'applyUrl', 'linkedinUrl', 'email', 'routeStatus', 'checkedAt', 'archived', 'revision'];
  const compactSql = `SELECT id,directory_id AS directoryId,name,status,${compactColumns.map(field => `json_extract(payload,'$.${field}') AS ${field}`).join(',')},json_extract(payload,'$.sourceFields.recruitment.profileUrl') AS profileUrl FROM companies`;
  const compact = row => row ? { ...row, sourceFields: row.profileUrl ? { recruitment: { profileUrl: row.profileUrl } } : {} } : null;
  const compactById = id => compact(db.prepare(compactSql + ' WHERE id=?').get(id));
  const sourceFieldsHash = companyId => {
    const cached = db.prepare('SELECT source_fields_hash FROM company_source_facts WHERE company_id=?').get(companyId);
    if (cached) return cached.source_fields_hash;
    const row = db.prepare("SELECT json_extract(payload,'$.sourceFields') AS sourceFields FROM companies WHERE id=?").get(companyId);
    return createHash('sha256').update(row?.sourceFields || '{}').digest('hex');
  };
  const installation = (packId, directoryId) => directoryId
    ? parse(db.prepare('SELECT payload FROM directory_packs WHERE directory_id=? AND pack_id=?').get(directoryId, packId))
    : parse(db.prepare('SELECT payload FROM directory_packs WHERE pack_id=? ORDER BY rowid DESC LIMIT 1').get(packId));
  const rowById = id => parse(db.prepare('SELECT payload FROM companies WHERE id=?').get(id));
  let hasIdentityRows = Boolean(db.prepare('SELECT 1 FROM company_identities LIMIT 1').get());
  let identityDataVersion = db.prepare('PRAGMA data_version').get().data_version;
  const summary = pack => { if (!pack) return null; const { guide, changelog, ...meta } = pack; return meta; };
  const validate = input => {
    fail(input && typeof input === 'object' && !Array.isArray(input), 'Choose a validated directory pack.');
    const { pack, records } = input;
    fail(pack && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id) && typeof pack.name === 'string' && typeof pack.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(pack.sourceSha256), 'The directory pack has invalid identity or source integrity.');
    fail(Array.isArray(records) && records.length > 0 && records.length <= 100000, 'A pack needs between 1 and 100,000 public records.');
    const ids = new Set();
    for (const record of records) {
      fail(record && typeof record === 'object' && !Array.isArray(record) && typeof record.id === 'string' && record.id.trim() && record.id.length <= 500 && typeof record.name === 'string' && record.name.trim(), 'Every pack record needs a stable ID and name.');
      fail(!ids.has(record.id), 'Duplicate source IDs are not allowed.'); ids.add(record.id);
      fail(Object.keys(record).every(field => FIELDS.includes(field) || field === 'id'), 'A pack cannot contain private tracking fields.');
      for (const field of FIELDS.filter(field => field !== 'sourceFields' && field !== 'checkedAt')) fail(record[field] === undefined || typeof record[field] === 'string', `Pack ${field} must be text.`);
      for (const field of ['website', 'careersUrl', 'applyUrl', 'linkedinUrl']) if (record[field]) {
        let url; try { url = new URL(record[field]); } catch {}
        fail(url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Pack links must be complete public HTTP or HTTPS URLs without credentials.');
      }
    }
    return input;
  };
  function plan(input) {
    validate(input);
    const { pack, records, directoryId } = input;
    const old = installation(pack.id, directoryId), packKey = directoryId && keyFor(directoryId, pack.id);
    const members = new Map(packKey ? db.prepare('SELECT * FROM pack_memberships WHERE pack_key=?').all(packKey).map(row => [row.source_id, row]) : []);
    const local = directoryId ? db.prepare(compactSql + ' WHERE directory_id=?').all(directoryId).map(compact).filter(company => !company.archived) : [];
    const bySource = new Map(local.filter(company => company.sourceId).map(company => [company.sourceId, company]));
    const byIdentity = new Map(local.map(company => [packCompanyIdentity(company), company]).filter(([identity]) => identity));
    const entries = [], changes = [], counts = { added: 0, updated: 0, removed: 0, conflicts: 0, unchanged: 0, duplicateMatches: 0 };
    const currentIds = new Set(records.map(record => record.id));
    for (const record of records) {
      const member = members.get(record.id);
      // Historical source IDs are reused only within this directory and with the same public organisation.
      const sourceMatch = bySource.get(record.id);
      const identity = packCompanyIdentity(record);
      const sourceCandidate = sourceMatch && sourceMatch.name.normalize('NFKC').trim().toLowerCase() === record.name.normalize('NFKC').trim().toLowerCase() && (
        identity && identity === packCompanyIdentity(sourceMatch) || sourceFieldsHash(sourceMatch.id) === digest(record.sourceFields)
      ) ? sourceMatch : null;
      const existing = (member && compactById(member.company_id)) || sourceCandidate || (identity && byIdentity.get(identity));
      const previous = member ? JSON.parse(member.baseline) : null;
      const fields = [], conflicts = [];
      if (!existing) counts.added++;
      else {
        if (!member) counts.duplicateMatches++;
        for (const field of FIELDS) {
          const proposed = digest(value(record, field)), current = field === 'sourceFields' ? sourceFieldsHash(existing.id) : digest(value(existing, field));
          if (proposed === current) continue;
          if (previous && current === previous[field]) fields.push(field);
          else if (!previous && !value(existing, field) && field !== 'sourceFields') fields.push(field);
          else conflicts.push(field);
        }
        if (fields.length) counts.updated++; else counts.unchanged++;
        if (conflicts.length) counts.conflicts++;
      }
      entries.push({ record, company: existing, fields, conflicts, identity });
      if (changes.length < 30 && (!existing || fields.length || conflicts.length)) {
        const candidates = existing ? [...fields, ...conflicts] : FIELDS.filter(field => value(record, field));
        const diffs = candidates.filter(field => DIFF_FIELDS.has(field)).slice(0, 8).map(field => {
          const current = existing ? String(value(existing, field) ?? '') : '', proposed = String(value(record, field) ?? '');
          return { field, current: current.slice(0, 500), proposed: proposed.slice(0, 500), keptLocal: conflicts.includes(field), truncated: current.length > 500 || proposed.length > 500 };
        });
        changes.push({ sourceId: record.id, name: record.name.slice(0, 500), type: existing ? 'updated' : 'added', fields, conflicts, diffs });
      }
    }
    for (const [sourceId, member] of members) if (!currentIds.has(sourceId)) {
      counts.removed++; if (changes.length < 30) changes.push({ sourceId, companyId: member.company_id, type: 'removed_from_pack', historyPreserved: true });
    }
    const revisions = db.prepare("SELECT id,json_extract(payload,'$.revision') AS revision FROM companies ORDER BY id").all();
    return { old, packKey, entries, counts, changes, guideChanged: Boolean(old && old.guidanceSha256 !== pack.guidanceSha256), fingerprint: digest(revisions), directoryId };
  }
  return {
    listInstalledDirectoryPacks({ directoryId } = {}) {
      return db.prepare('SELECT payload FROM directory_packs' + (directoryId ? ' WHERE directory_id=?' : '') + ' ORDER BY rowid DESC').all(...(directoryId ? [directoryId] : [])).map(parse).map(summary);
    },
    getInstalledDirectoryPack(packId, directoryId) { const result = installation(packId, directoryId); fail(result, 'Installed directory pack not found.', 404); return result; },
    getCompanyPackGuidance(companyId) {
      const records = db.prepare('SELECT DISTINCT p.payload FROM directory_packs p JOIN pack_memberships m ON m.pack_key=p.id WHERE m.company_id=? ORDER BY p.id').all(companyId).map(parse);
      let bytes = 0; const packs = []; let omitted = 0;
      for (const pack of records) {
        const guide = pack.guide || ''; if (!guide || pack.formatVersion !== 2) continue;
        const actual = createHash('sha256').update(guide).digest('hex');
        fail(actual === pack.guidanceSha256, 'Installed pack guidance integrity failed. Review and reinstall the pack.');
        assertPackScan(guide, { path: `${pack.id}/GUIDE.md`, guidance: true });
        const size = Buffer.byteLength(guide);
        if (bytes + size > MAX_PACK_GUIDANCE_BYTES) { omitted++; continue; }
        bytes += size; packs.push({ id: pack.id, version: pack.version, source: pack.source, guidanceSha256: actual, sourceSha256: pack.sourceSha256,
          trust: 'untrusted_reference', scanStatus: 'passed_pattern_checks', guide });
      }
      return { boundary: PACK_GUIDANCE_BOUNDARY, packs, bytes, omitted, ...(omitted ? { nextStep: 'Read any omitted pack with get_directory_pack before using its route guidance.' } : {}) };
    },
    previewDirectoryPack(input) {
      if (input.directoryId) fail(store.listDirectories().some(directory => directory.id === input.directoryId), 'Choose an active directory.');
      const result = plan(input);
      const currentText = result.old?.guide || '', proposedText = input.guide || '';
      return { counts: result.counts, changes: result.changes, guideChanged: result.guideChanged, guide: proposedText,
        guidance: { changed: result.old ? result.guideChanged : Boolean(proposedText), currentSha256: result.old?.guidanceSha256 || null, proposedSha256: input.pack.guidanceSha256 || null,
          currentText, proposedText, currentBytes: Buffer.byteLength(currentText), proposedBytes: Buffer.byteLength(proposedText), boundary: PACK_GUIDANCE_BOUNDARY },
        fingerprint: result.fingerprint, currentVersion: result.old?.version || null, warnings: [
        ...(result.counts.conflicts ? ['Your edited fields will be kept. Review the conflicting source fields in the update details.'] : []),
        ...(result.counts.removed ? ['Records removed from this pack remain in your directory with their history.'] : []),
      ] };
    },
    installDirectoryPack(input) {
      validate(input);
      return tx(() => {
        let directoryId = input.directoryId;
        if (directoryId) fail(store.listDirectories().some(directory => directory.id === directoryId), 'Choose an active directory.');
        const firstPlan = plan(input);
        if (input.expectedFingerprint) fail(input.expectedFingerprint === firstPlan.fingerprint, 'Directory records changed after preview. Review this pack again.', 409);
        if (!directoryId) {
          directoryId = !db.prepare('SELECT id FROM directories WHERE id=?').get(input.pack.id) ? input.pack.id : `dir_${randomUUID()}`;
          const country = input.pack.country;
          const flag = /^[A-Z]{2}$/.test(country || '') ? String.fromCodePoint(...[...country].map(letter => 127397 + letter.charCodeAt(0))) : '📁';
          store.createDirectory({ id: directoryId, name: input.pack.name, country: country || '', flag });
        }
        const result = plan({ ...input, directoryId });
        if (result.old) fail(compareDirectoryPackVersions(input.pack, result.old) >= 0, 'This pack is older than the installed version. Import a newer reviewed version; rollback is not supported.');
        if (result.old && result.old.version === input.pack.version && ['sourceSha256', 'guidanceSha256', 'changelogSha256'].some(field => (result.old[field] || null) !== (input.pack[field] || null))) fail(false, 'This pack version changed its contents. Obtain a new reviewed version before updating.');
        const packKey = keyFor(directoryId, input.pack.id);
        const installedAt = result.old?.installedAt || now();
        const metadata = { ...input.pack, id: input.pack.id, packId: input.pack.id, packKey, directoryId, installedAt, updatedAt: input.pack.updatedAt || input.pack.snapshotDate, installedUpdatedAt: now(), recordCount: input.records.length, guide: input.guide || '', changelog: input.changelog || '' };
        db.prepare('INSERT INTO directory_packs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(packKey, directoryId, input.pack.id, JSON.stringify(metadata));
        const retained = new Set();
        for (const entry of result.entries) {
          const { record, fields, identity } = entry;
          let company = entry.company && rowById(entry.company.id);
          if (!company) {
            company = { id: !db.prepare('SELECT id FROM companies WHERE id=?').get(record.id) ? record.id : `company_${randomUUID()}`, sourceId: record.id, directoryId,
              ...Object.fromEntries(FIELDS.map(field => [field, value(record, field)])), status: 'not_started', nextAction: record.careersUrl || record.applyUrl ? 'Find a suitable role' : 'Check recruitment route',
              lastUpdate: null, followUpAt: null, notes: '', attention: '', archived: false, revision: 1, createdAt: now() };
          } else if (fields.length) { for (const field of fields) company[field] = value(record, field); company.revision++; }
          if (!entry.company || fields.length) saveCompany(company);
          db.prepare('INSERT INTO pack_memberships VALUES(?,?,?,?) ON CONFLICT(pack_key,source_id) DO UPDATE SET company_id=excluded.company_id,baseline=excluded.baseline').run(packKey, record.id, company.id, JSON.stringify(baseline(record)));
          if (identity) { db.prepare('INSERT OR IGNORE INTO company_identities VALUES(?,?)').run(company.id, identity); hasIdentityRows = true; }
          retained.add(record.id);
        }
        for (const member of db.prepare('SELECT source_id FROM pack_memberships WHERE pack_key=?').all(packKey)) if (!retained.has(member.source_id)) db.prepare('DELETE FROM pack_memberships WHERE pack_key=? AND source_id=?').run(packKey, member.source_id);
        activity(result.old ? 'directory_pack_updated' : 'directory_pack_installed', `${input.pack.name}: ${input.pack.version || input.pack.snapshotDate}; ${result.counts.added} added, ${result.counts.updated} updated; private history kept.`);
        return { directoryId, pack: summary(metadata), counts: result.counts, changes: result.changes, guideChanged: result.guideChanged };
      });
    },
    removeDirectoryPack({ id, directoryId }) {
      fail(typeof id === 'string' && typeof directoryId === 'string', 'Choose a pack and its directory.');
      return tx(() => {
        const pack = installation(id, directoryId); fail(pack, 'Installed directory pack not found.', 404);
        const packKey = keyFor(directoryId, id);
        db.prepare('DELETE FROM pack_memberships WHERE pack_key=?').run(packKey);
        db.prepare('DELETE FROM directory_packs WHERE id=?').run(packKey);
        activity('directory_pack_removed', `${pack.name}: pack detached; companies, profiles and application history kept.`);
        return { id, directoryId, removed: true, historyPreserved: true };
      });
    },
    relatedCompanyIds(companyId) {
      if (!hasIdentityRows) return [companyId];
      const company = compactById(companyId); if (!company) return [companyId];
      const identity = packCompanyIdentity(company);
      return db.prepare(`WITH RECURSIVE related(company_id) AS (
        SELECT ? UNION SELECT company_id FROM company_identities WHERE identity_key=?
        UNION SELECT other.company_id FROM related r JOIN company_identities own ON own.company_id=r.company_id JOIN company_identities other ON other.identity_key=own.identity_key
      ) SELECT company_id FROM related`).all(companyId, identity || '').map(row => row.company_id);
    },
    getCompanyIdentityKey(companyId) {
      store.refreshCompanyIdentities();
      const ids = store.relatedCompanyIds(companyId);
      const first = db.prepare('SELECT identity_key FROM company_identities WHERE company_id IN (SELECT value FROM json_each(?)) ORDER BY rowid LIMIT 1').get(JSON.stringify(ids));
      return first ? `organisation:${first.identity_key}` : `company:${companyId}`;
    },
    getRelatedCompanyHistory(companyId) {
      store.refreshCompanyIdentities();
      fail(Boolean(compactById(companyId)), 'Company not found.', 404);
      const ids = store.relatedCompanyIds(companyId);
      const directories = new Map(db.prepare('SELECT id,payload FROM directories').all().map(row => [row.id, JSON.parse(row.payload).name]));
      const companies = new Map(ids.map(id => [id, compactById(id)]));
      const provenance = id => ({ originalCompanyId: id, originalCompanyName: companies.get(id)?.name || '', originalDirectoryId: companies.get(id)?.directoryId || '', originalDirectoryName: directories.get(companies.get(id)?.directoryId) || '' });
      return { shared: ids.length > 1, companyIds: ids,
        applications: ids.flatMap(id => store.listApplications(id).map(application => ({ ...application, ...provenance(id) }))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        activity: ids.flatMap(id => store.listActivity({ companyId: id }).map(item => ({ ...item, ...provenance(id) }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    },
    refreshCompanyIdentities() {
      const version = db.prepare('PRAGMA data_version').get().data_version;
      if (version !== identityDataVersion) { identityDataVersion = version; hasIdentityRows = Boolean(db.prepare('SELECT 1 FROM company_identities LIMIT 1').get()); }
    },
    noteCompanySource(company) {
      db.prepare('INSERT INTO company_source_facts VALUES(?,?) ON CONFLICT(company_id) DO UPDATE SET source_fields_hash=excluded.source_fields_hash').run(company.id, digest(company.sourceFields || {}));
    },
  };
}
