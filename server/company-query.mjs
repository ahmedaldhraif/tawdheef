import { COMPANY_TYPES, classifyCompanyType } from '../src/company-types.js';
import { companyLocations } from '../src/company-locations.js';

const SORT_FIELDS = ['name', 'status', 'lastUpdate', 'nextAction', 'sector', 'location'];
const compare = new Intl.Collator(undefined, { numeric: true }).compare;
const due = "q.follow_up_at <> '' AND q.follow_up_at <= ? AND q.status NOT IN ('closed','offer')";

/** SQLite owns filtering and paging. Cached source projections retain the shared
 * Unicode search, classification and Intl/numeric ordering semantics. Never use
 * these projections for submission authority or evidence. */
export function createCompanyQuery(db, statuses) {
  let signature = null, snapshotVersion = null, companies = new Map(), facets = new Map(), ranks = new Set();
  const changedCompanies = new Set();
  // These disposable projections contain no authoritative records. Compact
  // native predicates avoid rescanning company JSON/calling JS for every row.
  // They disappear with this connection and never migrate the saved schema.
  db.exec(`PRAGMA temp_store=MEMORY;
    CREATE TEMP TABLE tracker_company_query(
    id TEXT PRIMARY KEY, source_order INTEGER NOT NULL, directory_id TEXT NOT NULL,
    status TEXT NOT NULL, attention TEXT NOT NULL, follow_up_at TEXT NOT NULL,
    archived INTEGER NOT NULL, type_id TEXT NOT NULL,
    ${SORT_FIELDS.map(field => `${field}_rank INTEGER NOT NULL DEFAULT 0`).join(',')});
    CREATE INDEX tracker_query_scope ON tracker_company_query(directory_id,archived,type_id);
    CREATE INDEX tracker_query_name ON tracker_company_query(directory_id,archived,name_rank,source_order);
    CREATE TEMP TABLE tracker_company_places(company_id TEXT NOT NULL,location_id TEXT NOT NULL,PRIMARY KEY(company_id,location_id));
    CREATE INDEX tracker_places_location ON tracker_company_places(location_id,company_id);`);
  const dataVersion = () => db.prepare('PRAGMA data_version').get().data_version;
  const totalChanges = () => db.prepare('SELECT total_changes() AS n').get().n;
  const rememberTemporaryWrites = () => { signature = `${snapshotVersion}:${totalChanges()}`; };
  const invalidate = () => { signature = null; };
  const companyChanged = id => { changedCompanies.add(id); };
  const save = db.prepare(`INSERT INTO tracker_company_query(id,source_order,directory_id,status,attention,follow_up_at,archived,type_id) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET source_order=excluded.source_order,directory_id=excluded.directory_id,status=excluded.status,attention=excluded.attention,follow_up_at=excluded.follow_up_at,archived=excluded.archived,type_id=excluded.type_id`);
  const savePlace = db.prepare('INSERT INTO tracker_company_places VALUES(?,?)');

  function project(row, directory) {
    const company = JSON.parse(row.payload), previous = companies.get(row.id);
    const projection = {
      directoryId: company.directoryId,
      archived: Boolean(company.archived),
      search: [company.name, company.arabicName, company.sector, company.location, company.notes, company.sourceRole].map(value => String(value || '').toLowerCase()),
      type: classifyCompanyType(company),
      places: companyLocations(company, directory),
      sort: Object.fromEntries(SORT_FIELDS.map(field => [field, String(company[field] || '')])),
    };
    for (const field of SORT_FIELDS) if (!previous || previous.sort[field] !== projection.sort[field]) ranks.delete(field);
    const facetValue = value => value && JSON.stringify([value.directoryId, value.archived, value.type, value.places]);
    if (facetValue(previous) !== facetValue(projection)) facets.clear();
    companies.set(row.id, projection);
    save.run(row.id, row.source_order, company.directoryId, company.status, company.attention || '', company.followUpAt || '', Number(projection.archived), projection.type);
    if (previous) db.prepare('DELETE FROM tracker_company_places WHERE company_id=?').run(row.id);
    for (const place of projection.places) savePlace.run(row.id, place.id);
  }

  function refresh() {
    const observedVersion = dataVersion(), current = `${observedVersion}:${totalChanges()}`;
    if (signature === current) return;
    const directories = new Map(db.prepare('SELECT id,payload FROM directories').all().map(row => [row.id, JSON.parse(row.payload)]));
    // All local company writes go through saveCompany. Reproject only those
    // rows; application/history/settings writes still use live SQL counts.
    // An external client or rollback takes the full snapshot path below.
    if (signature !== null && observedVersion === snapshotVersion) {
      const read = db.prepare('SELECT rowid AS source_order,id,directory_id,payload FROM companies WHERE id=?');
      for (const id of changedCompanies) {
        const row = read.get(id);
        project(row, directories.get(row.directory_id));
      }
      changedCompanies.clear();
      rememberTemporaryWrites();
      return;
    }
    snapshotVersion = observedVersion;
    companies = new Map(); facets = new Map(); ranks = new Set();
    db.exec('DELETE FROM tracker_company_places; DELETE FROM tracker_company_query;');
    for (const row of db.prepare('SELECT rowid AS source_order,id,directory_id,payload FROM companies ORDER BY rowid').all()) project(row, directories.get(row.directory_id));
    changedCompanies.clear();
    rememberTemporaryWrites();
  }

  function directoryFacets(directoryId) {
    const key = directoryId || null;
    if (!facets.has(key)) {
      const counts = Object.fromEntries(COMPANY_TYPES.map(type => [type.id, 0])), places = new Map();
      for (const company of companies.values()) {
        if (company.archived || (directoryId && company.directoryId !== directoryId)) continue;
        counts[company.type]++;
        for (const place of company.places) places.set(place.id, { ...place, count: (places.get(place.id)?.count || 0) + 1 });
      }
      facets.set(key, {
        companyTypes: COMPANY_TYPES.map(type => ({ ...type, count: counts[type.id] })),
        locations: [...places.values()].sort((a, b) => a.id === 'unknown' ? 1 : b.id === 'unknown' ? -1 : compare(a.label, b.label)),
      });
    }
    return structuredClone(facets.get(key));
  }

  function sortRanks(field) {
    if (!ranks.has(field)) {
      const ordered = [...companies].sort(([, a], [, b]) => compare(a.sort[field], b.sort[field]));
      const save = db.prepare(`UPDATE tracker_company_query SET ${field}_rank=? WHERE id=?`);
      let rank = 0, previous;
      for (const [id, company] of ordered) {
        const value = company.sort[field];
        if (previous !== undefined && compare(previous, value) !== 0) rank++;
        save.run(rank, id); previous = value;
      }
      ranks.add(field);
      rememberTemporaryWrites();
    }
  }

  db.function('tracker_company_search', (id, query) => Number(companies.get(id)?.search.some(value => value.includes(query)) || false));

  function list({ directoryId, filters, limit, offset, sort, direction, today, idsOnly = false, companyIds }) {
    // One read snapshot keeps metadata, counts and the page consistent with
    // concurrent UI/CLI/MCP writers. Other connections invalidate data_version;
    // this connection's writes are tracked centrally by saveCompany.
    const ownTransaction = !db.isTransaction;
    if (ownTransaction) db.exec('BEGIN');
    try {
      // BEGIN is deferred: establish the database snapshot before validating
      // cached projections, so a writer cannot slip between that check and the
      // first table read used by the counts/page.
      db.prepare('SELECT id FROM companies LIMIT 1').get();
      refresh();
      if (!SORT_FIELDS.includes(sort)) sort = 'name';
      sortRanks(sort);
      const scope = ['q.archived=0'], scopeArgs = [];
      if (directoryId) { scope.push('q.directory_id=?'); scopeArgs.push(directoryId); }
      const where = [...scope], args = [...scopeArgs];
      if (filters.search) { where.push('tracker_company_search(q.id,?)'); args.push(filters.search.toLowerCase()); }
      if (filters.status) { where.push('q.status=?'); args.push(filters.status); }
      if (filters.attention === 'needs_you') where.push("q.attention='needs_you'");
      if (filters.attention === 'follow_up_due') { where.push(`(${due})`); args.push(today); }
      if (filters.companyTypes.length) {
        where.push(`q.type_id IN (${filters.companyTypes.map(() => '?').join(',')})`);
        args.push(...filters.companyTypes);
      }
      if (filters.locations.length) {
        where.push(`q.id IN (SELECT company_id FROM tracker_company_places WHERE location_id IN (${filters.locations.map(() => '?').join(',')}))`);
        args.push(...filters.locations);
      }
      if (idsOnly && companyIds !== undefined) {
        where.push('q.id IN (SELECT value FROM json_each(?))');
        args.push(JSON.stringify(companyIds));
      }
      const predicate = where.join(' AND ');
      if (idsOnly) {
        const result = db.prepare(`SELECT q.id FROM tracker_company_query q WHERE ${predicate}
          ORDER BY q.${sort}_rank ${direction === 'desc' ? 'DESC' : 'ASC'},q.source_order ASC`).all(...args).map(row => row.id);
        if (ownTransaction) db.exec('COMMIT');
        return result;
      }
      const counts = db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN q.status IN ('not_started','ready') AND NOT EXISTS (
          SELECT 1 FROM applications a WHERE a.company_id=q.id AND COALESCE(json_extract(a.payload,'$.appliedAt'),'') <> ''
        ) THEN 1 ELSE 0 END),0) AS remainingCount FROM tracker_company_query q WHERE ${predicate}`).get(...args);
      const statusCounts = Object.fromEntries(statuses.map(status => [status, 0]));
      for (const row of db.prepare(`SELECT q.status,COUNT(*) AS n FROM tracker_company_query q WHERE ${scope.join(' AND ')} GROUP BY q.status`).all(...scopeArgs)) statusCounts[row.status] = Number(row.n);
      const attention = db.prepare(`SELECT COALESCE(SUM(CASE WHEN q.attention='needs_you' THEN 1 ELSE 0 END),0) AS needsYou,
        COALESCE(SUM(CASE WHEN ${due} THEN 1 ELSE 0 END),0) AS followUpDue FROM tracker_company_query q WHERE ${scope.join(' AND ')}`).get(today, ...scopeArgs);
      const rows = db.prepare(`SELECT c.payload FROM tracker_company_query q JOIN companies c ON c.id=q.id WHERE ${predicate}
        ORDER BY q.${sort}_rank ${direction === 'desc' ? 'DESC' : 'ASC'}, q.source_order ASC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(row => JSON.parse(row.payload));
      const result = { rows, total: Number(counts.total), remainingCount: Number(counts.remainingCount), facets: directoryFacets(directoryId), statusCounts, attentionCounts: { needsYou: Number(attention.needsYou), followUpDue: Number(attention.followUpDue) } };
      if (ownTransaction) db.exec('COMMIT');
      return result;
    } catch (error) {
      invalidate();
      if (ownTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
  return { list, ids: options => list({ ...options, idsOnly: true }), invalidate, companyChanged };
}
