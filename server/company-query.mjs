import { COMPANY_TYPES, classifyCompanyType } from '../src/company-types.js';
import { companyLocations } from '../src/company-locations.js';

const SORT_FIELDS = ['name', 'status', 'lastUpdate', 'nextAction', 'sector', 'location'];
const compare = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const due = "COALESCE(json_extract(c.payload,'$.followUpAt'),'') <> '' AND json_extract(c.payload,'$.followUpAt') <= ? AND c.status NOT IN ('closed','offer')";

/** SQLite owns filtering and paging. Cached source projections retain the shared
 * Unicode search, classification and Intl/numeric ordering semantics. Never use
 * these projections for submission authority or evidence. */
export function createCompanyQuery(db, statuses) {
  let signature = null, companies = new Map(), facets = new Map(), ranks = new Map();
  const version = () => `${db.prepare('PRAGMA data_version').get().data_version}:${db.prepare('SELECT total_changes() AS n').get().n}`;
  const invalidate = () => { signature = null; };

  function refresh() {
    const current = version();
    if (signature === current) return;
    const directories = new Map(db.prepare('SELECT id,payload FROM directories').all().map(row => [row.id, JSON.parse(row.payload)]));
    companies = new Map(); facets = new Map(); ranks = new Map();
    for (const { id, payload } of db.prepare('SELECT id,payload FROM companies ORDER BY rowid').all()) {
      const company = JSON.parse(payload);
      companies.set(id, {
        directoryId: company.directoryId,
        archived: Boolean(company.archived),
        search: [company.name, company.arabicName, company.sector, company.location, company.notes, company.sourceRole].map(value => String(value || '').toLowerCase()),
        type: classifyCompanyType(company),
        places: companyLocations(company, directories.get(company.directoryId)),
        sort: Object.fromEntries(SORT_FIELDS.map(field => [field, String(company[field] || '')])),
      });
    }
    signature = current;
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
      const values = new Map(); let rank = 0, previous;
      for (const [id, company] of ordered) {
        const value = company.sort[field];
        if (previous !== undefined && compare(previous, value) !== 0) rank++;
        values.set(id, rank); previous = value;
      }
      ranks.set(field, values);
    }
  }

  db.function('tracker_company_search', (id, query) => Number(companies.get(id)?.search.some(value => value.includes(query)) || false));
  db.function('tracker_company_type', id => companies.get(id)?.type || 'unknown');
  db.function('tracker_company_locations', id => JSON.stringify(companies.get(id)?.places.map(place => place.id) || []));
  db.function('tracker_company_sort_rank', (id, field) => ranks.get(field)?.get(id) ?? 0);

  function list({ directoryId, filters, limit, offset, sort, direction, today }) {
    // One read snapshot keeps metadata, counts and the page consistent with
    // concurrent UI/CLI/MCP writers. Other connections invalidate data_version;
    // this connection's writes invalidate total_changes, including rollbacks.
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
      const scope = ["json_extract(c.payload,'$.archived') IS NOT 1"], scopeArgs = [];
      if (directoryId) { scope.push('c.directory_id=?'); scopeArgs.push(directoryId); }
      const where = [...scope], args = [...scopeArgs];
      if (filters.search) { where.push('tracker_company_search(c.id,?)'); args.push(filters.search.toLowerCase()); }
      if (filters.status) { where.push('c.status=?'); args.push(filters.status); }
      if (filters.attention === 'needs_you') where.push("json_extract(c.payload,'$.attention')='needs_you'");
      if (filters.attention === 'follow_up_due') { where.push(`(${due})`); args.push(today); }
      if (filters.companyTypes.length) {
        where.push(`tracker_company_type(c.id) IN (${filters.companyTypes.map(() => '?').join(',')})`);
        args.push(...filters.companyTypes);
      }
      if (filters.locations.length) {
        where.push(`EXISTS (SELECT 1 FROM json_each(tracker_company_locations(c.id)) location WHERE location.value IN (${filters.locations.map(() => '?').join(',')}))`);
        args.push(...filters.locations);
      }
      const predicate = where.join(' AND ');
      const counts = db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN c.status IN ('not_started','ready') AND NOT EXISTS (
          SELECT 1 FROM applications a WHERE a.company_id=c.id AND COALESCE(json_extract(a.payload,'$.appliedAt'),'') <> ''
        ) THEN 1 ELSE 0 END),0) AS remainingCount FROM companies c WHERE ${predicate}`).get(...args);
      const statusCounts = Object.fromEntries(statuses.map(status => [status, 0]));
      for (const row of db.prepare(`SELECT c.status,COUNT(*) AS n FROM companies c WHERE ${scope.join(' AND ')} GROUP BY c.status`).all(...scopeArgs)) statusCounts[row.status] = Number(row.n);
      const attention = db.prepare(`SELECT COALESCE(SUM(CASE WHEN json_extract(c.payload,'$.attention')='needs_you' THEN 1 ELSE 0 END),0) AS needsYou,
        COALESCE(SUM(CASE WHEN ${due} THEN 1 ELSE 0 END),0) AS followUpDue FROM companies c WHERE ${scope.join(' AND ')}`).get(today, ...scopeArgs);
      const rows = db.prepare(`SELECT c.payload FROM companies c WHERE ${predicate}
        ORDER BY tracker_company_sort_rank(c.id,?) ${direction === 'desc' ? 'DESC' : 'ASC'}, c.rowid ASC LIMIT ? OFFSET ?`).all(...args, sort, limit, offset).map(row => JSON.parse(row.payload));
      const result = { rows, total: Number(counts.total), remainingCount: Number(counts.remainingCount), facets: directoryFacets(directoryId), statusCounts, attentionCounts: { needsYou: Number(attention.needsYou), followUpDue: Number(attention.followUpDue) } };
      if (ownTransaction) db.exec('COMMIT');
      return result;
    } catch (error) {
      invalidate();
      if (ownTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
  return { list, invalidate };
}
