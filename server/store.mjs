import * as sqlite from "node:sqlite";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { applicationMilestones, recordMilestone, progressByCompany, emptyProgress, milestoneReport } from './progress.mjs';
import { directorySnapshot } from './snapshot.mjs';
import { COMPANY_TYPES, classifyCompanyType, companyMatchesTypes } from '../src/company-types.js';
import { companyLocations, companyMatchesLocations } from '../src/company-locations.js';
import { normalizeRunActions, assertRunPurpose, buildRunBrief, EMAIL_PURPOSES, FORM_PURPOSE_EVENTS } from '../src/run-actions.js';
import { createCompanyQuery } from './company-query.mjs';
import { defaultDataDir } from '../scripts/app-paths.mjs';

const Database = sqlite.Database || sqlite.DatabaseSync;

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STATUSES = [
  "not_started",
  "ready",
  "applied",
  "replied",
  "interview",
  "offer",
  "closed",
];
const now = () => new Date().toISOString();
const calendarDay = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join("-");
};
const id = (prefix) => `${prefix}_${randomUUID()}`;
const text = (value, max = 20000) => String(value ?? "").slice(0, max);
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const requireValue = (value, message) => {
  if (!value) throw new AppError(message);
};
const parse = (row) => (row ? JSON.parse(row.payload) : null);
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const roleKey = (value) =>
  text(value, 500).trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
const hasEvidence = value => typeof value === 'string' ? value.trim().length > 0 : isRecord(value) && ['providerMessageId', 'receipt', 'url', 'confirmation'].some(key => typeof value[key] === 'string' && value[key].trim());
const columns = new Set([
  "name",
  "status",
  "nextAction",
  "lastUpdate",
  "careersUrl",
  "notes",
  "sector",
  "location",
  "email",
  "linkedinUrl",
  "sourceRole",
  "routeStatus",
  "followUpAt",
  "progress",
  "type",
]);
function record(value, message = "Supply an object of fields.") {
  requireValue(isRecord(value), message);
}
function stringFields(value, keys) {
  for (const key of keys)
    if (key in value)
      requireValue(typeof value[key] === "string", `${key} must be text.`);
}
function columnList(value) {
  requireValue(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((key) => typeof key === "string" && columns.has(key)) &&
      value.includes("name"),
    "Choose supported columns and keep Company visible.",
  );
  return [...new Set(value)];
}
function safeUrl(value) {
  if (!value) return "";
  try {
    if (typeof value !== "string") throw 0;
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw 0;
    return url.href;
  } catch {
    throw new AppError("Use a complete http or https link.");
  }
}

export function openStore({
  dataDir = defaultDataDir(ROOT),
  seed = true,
  clock = () => new Date(),
} = {}) {
  const now = () => new Date(clock()).toISOString();
  const currentMs = () => Date.parse(now());
  dataDir = resolve(dataDir);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(resolve(dataDir, "tracker.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS directories(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, directory_id TEXT NOT NULL REFERENCES directories(id), name TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS companies_directory ON companies(directory_id);
    CREATE INDEX IF NOT EXISTS companies_source_id ON companies(directory_id, json_extract(payload, '$.sourceId'));
    CREATE INDEX IF NOT EXISTS companies_name ON companies(directory_id, lower(name));
    CREATE INDEX IF NOT EXISTS companies_directory_status ON companies(directory_id,status);
    CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS applications_company ON applications(company_id);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY, company_id TEXT, created_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS activity_company ON activity(company_id);
    CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);`);
  const companyQuery = createCompanyQuery(db, STATUSES);
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      companyQuery.invalidate();
      throw e;
    }
  };
  const write = (table, key, value) =>
    db
      .prepare(
        `INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(key, JSON.stringify(value));
  const read = (table, key) =>
    parse(db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(key));
  const all = (table) =>
    db.prepare(`SELECT payload FROM ${table}`).all().map(parse);
  function activity(action, detail, companyId = null, metadata = {}) {
    const item = {
      id: id("event"),
      action,
      detail,
      companyId,
      createdAt: now(),
      ...metadata,
    };
    db.prepare("INSERT INTO activity VALUES(?,?,?,?)").run(
      item.id,
      companyId,
      item.createdAt,
      JSON.stringify(item),
    );
    return item;
  }
  function saveCompany(c) {
    // Derived progress is never stored as an editable or imported company field.
    const { progress, ...saved } = c;
    db.prepare(
      "INSERT INTO companies VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,payload=excluded.payload",
    ).run(c.id, c.directoryId, c.name, c.status, JSON.stringify(saved));
    companyQuery.companyChanged(c.id);
  }
  function progressActivity(companyIds) {
    const ids = typeof companyIds === 'string' ? [companyIds] : companyIds;
    if (ids && !ids.length) return [];
    return db.prepare('SELECT payload FROM activity' + (ids ? ` WHERE company_id IN (SELECT value FROM json_each(?))` : '')).all(...(ids ? [JSON.stringify(ids)] : [])).map(parse).filter(item => !item.applicationId);
  }
  function withProgress(companies) {
    if (!companies.length) return companies;
    const ids = companies.map(company => company.id);
    const applications = db.prepare('SELECT payload FROM applications WHERE company_id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids)).map(parse);
    const progress = progressByCompany(applications, progressActivity(ids));
    return companies.map(company => ({ ...company, progress: progress.get(company.id) || emptyProgress() }));
  }
  const defaults = {
    refreshFrequency: "manual",
    reportFrequency: "off",
    reportTime: "08:00",
    reportDay: 1,
    reportEveryDays: 7,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    emailReports: false,
    reportEmail: "",
    language: "en",
    cvLink: "",
    cvText: "",
    lastRefreshAt: null,
    lastReportAt: null,
    lastRefreshError: null,
    lastRefreshMessage: null,
    lastRefreshStatus: null,
    lastReportError: null,
  };
  if (!read("settings", "main")) write("settings", "main", defaults);
  function recentSubmission(apps, companyId, role, exceptId) {
    const key = roleKey(role),
      cutoff = currentMs() - 60 * 86400000;
    return apps.find(
      (a) =>
        a.id !== exceptId &&
        a.companyId === companyId &&
        roleKey(a.role) === key &&
        (((a.appliedAt || a.cvSentAt) && Date.parse(a.appliedAt || a.cvSentAt) > cutoff) ||
          ["sending", "unknown"].includes(a.deliveryStatus) ||
          (a.status === 'needs_user' && /uncertain submission/i.test(a.notes || ''))),
    );
  }
  function runActions(value, options) {
    try { return normalizeRunActions(value, options); } catch (error) { throw new AppError(error.message); }
  }
  function requirePurpose(run, purpose) {
    try { return assertRunPurpose(run, purpose); } catch (error) { throw new AppError(error.message); }
  }
  function unresolvedSubmission(apps, companyId, exceptId) {
    return apps.find(a => a.companyId === companyId && a.id !== exceptId && (['sending', 'unknown'].includes(a.deliveryStatus) || (a.status === 'needs_user' && /uncertain submission/i.test(a.notes || ''))));
  }
  function recentCvShare(apps, companyId, exceptId, recipient) {
    const to = String(recipient || '').trim().toLowerCase();
    return apps.find(a => a.companyId === companyId && a.id !== exceptId && (!to || !a.to || a.to.trim().toLowerCase() === to) && a.cvSentAt && Date.parse(a.cvSentAt) > currentMs() - 60 * 86400000);
  }
  function formDestination(value) {
    const url = new URL(value); return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  }
  function companyFilter(input = {}) {
    stringFields(input, ['search', 'status', 'attention']);
    const search = text(input.search, 300), status = input.status || '', attention = input.attention || '';
    requireValue(!status || STATUSES.includes(status), 'Choose a supported status filter.');
    requireValue(['', 'needs_you', 'follow_up_due'].includes(attention), 'Choose a supported attention filter.');
    return { search, status, attention, companyTypes: store.validateCompanyTypes(input.companyTypes), locations: store.validateRunLocations(input.locations) };
  }
  function followUpMatcher() {
    const today = calendarDay(now(), store.getSettings().timezone);
    return company => Boolean(company.followUpAt && company.followUpAt <= today && !['closed', 'offer'].includes(company.status));
  }
  function filterCompanyRows(rows, input) {
    const filters = companyFilter(input), q = filters.search.toLowerCase(), followUpDue = followUpMatcher();
    const directories = new Map();
    const directoryFor = company => {
      if (!directories.has(company.directoryId)) directories.set(company.directoryId, read('directories', company.directoryId));
      return directories.get(company.directoryId);
    };
    return rows.filter(company =>
      (!q || [company.name, company.arabicName, company.sector, company.location, company.notes, company.sourceRole].some(value => String(value || '').toLowerCase().includes(q))) &&
      (!filters.status || company.status === filters.status) &&
      (!filters.attention || (filters.attention === 'needs_you' ? company.attention === 'needs_you' : followUpDue(company))) &&
      companyMatchesTypes(company, filters.companyTypes) && companyMatchesLocations(company, filters.locations, directoryFor(company)));
  }
  function companyFacets(rows) {
    const counts = Object.fromEntries(COMPANY_TYPES.map(type => [type.id, 0]));
    const places = new Map(), directories = new Map();
    for (const company of rows) {
      counts[classifyCompanyType(company)]++;
      if (!directories.has(company.directoryId)) directories.set(company.directoryId, read('directories', company.directoryId));
      for (const place of companyLocations(company, directories.get(company.directoryId))) {
        places.set(place.id, { ...place, count: (places.get(place.id)?.count || 0) + 1 });
      }
    }
    return {
      companyTypes: COMPANY_TYPES.map(type => ({ ...type, count: counts[type.id] })),
      locations: [...places.values()].sort((a, b) => a.id === 'unknown' ? 1 : b.id === 'unknown' ? -1 : a.label.localeCompare(b.label, undefined, { numeric: true })),
    };
  }
  function unfinishedRows(rows) {
    const submitted = new Set(store.listApplications().filter(application => application.appliedAt).map(application => application.companyId));
    return rows.filter(company => ['not_started', 'ready'].includes(company.status) && !submitted.has(company.id));
  }
  const store = {
    dataDir,
    close() {
      db.close();
    },
    listDirectories() {
      return all("directories")
        .filter((d) => !d.archived)
        .sort((a, b) => a.order - b.order)
        .map((d) => ({
          ...d,
          count: Number(
            db
              .prepare(
                "SELECT COUNT(*) n FROM companies WHERE directory_id=? AND json_extract(payload,'$.archived') IS NOT 1",
              )
              .get(d.id).n,
          ),
        }));
    },
    createDirectory(input = {}) {
      record(input);
      stringFields(input, ["id", "name", "flag", "country"]);
      requireValue(text(input.name).trim(), "Give your directory a name.");
      if (input.id !== undefined)
        requireValue(
          input.id.trim().length > 0 && input.id.length <= 200,
          "Use a nonempty directory ID of at most 200 characters.",
        );
      const d = {
        id: input.id || id("dir"),
        name: text(input.name, 80).trim(),
        flag: text(input.flag || "📁", 16),
        country: text(input.country, 80),
        order: all("directories").length,
        createdAt: now(),
        columns: columnList(
          input.columns || [
            "name",
            "status",
            "nextAction",
            "lastUpdate",
            "careersUrl",
            "notes",
          ],
        ),
      };
      requireValue(
        !read("directories", d.id),
        "This directory already exists.",
      );
      write("directories", d.id, d);
      activity("directory_added", d.name);
      return d;
    },
    updateDirectory(directoryId, patch) {
      record(patch);
      stringFields(patch, ["name", "flag", "country"]);
      if ("archived" in patch)
        requireValue(
          typeof patch.archived === "boolean",
          "archived must be true or false.",
        );
      if ("order" in patch)
        requireValue(
          Number.isInteger(patch.order) && patch.order >= 0,
          "Directory order must be a nonnegative whole number.",
        );
      const d = read("directories", directoryId);
      requireValue(d, "Directory not found.");
      for (const key of [
        "name",
        "flag",
        "country",
        "columns",
        "order",
        "archived",
      ])
        if (key in patch) d[key] = patch[key];
      requireValue(text(d.name).trim(), "Give your directory a name.");
      d.name = text(d.name, 80);
      d.flag = text(d.flag, 16);
      d.columns = columnList(d.columns);
      write("directories", d.id, d);
      activity(d.archived ? "directory_archived" : "directory_updated", d.name);
      return d;
    },
    exportCompanies(directoryId) {
      return withProgress(db
        .prepare("SELECT payload FROM companies" + (directoryId ? " WHERE directory_id=?" : ""))
        .all(...(directoryId ? [directoryId] : []))
        .map(parse)
        .filter((company) => !company.archived)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    },
    listCompanies({
      directoryId,
      search = "",
      status = "",
      attention = "",
      companyTypes,
      locations,
      limit = 100,
      offset = 0,
      sort = "name",
      direction = "asc",
    } = {}) {
      // Match Array.slice's integer page boundaries, including fractional input
      // accepted by older CLI callers; SQLite LIMIT/OFFSET require integers.
      const start = Math.max(0, Number(offset) || 0);
      const end = start + Math.min(5000, Math.max(1, Number(limit) || 100));
      const pageOffset = Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(start));
      const pageLimit = Number.isFinite(start) ? Math.max(0, Math.trunc(end) - Math.trunc(start)) : 0;
      const result = companyQuery.list({
        directoryId,
        filters: companyFilter({ search, status, attention, companyTypes, locations }),
        today: calendarDay(now(), store.getSettings().timezone),
        limit: pageLimit,
        offset: pageOffset,
        sort, direction,
      });
      return {
        items: withProgress(result.rows),
        total: result.total,
        remainingCount: result.remainingCount,
        listScopeVersion: 1,
        facets: result.facets,
        statusCounts: result.statusCounts,
        attentionCounts: result.attentionCounts,
      };
    },
    getCompany(companyId) {
      const c = parse(
        db.prepare("SELECT payload FROM companies WHERE id=?").get(companyId),
      );
      if (!c) throw new AppError("Company not found.", 404);
      return withProgress([c])[0];
    },
    addCompanies(directoryId, records) {
      const directory = read("directories", directoryId);
      requireValue(
        directory && !directory.archived,
        "Choose an active directory first.",
      );
      requireValue(
        Array.isArray(records) && records.length > 0 && records.length <= 10000,
        "Supply between 1 and 10,000 records.",
      );
      return tx(() => {
        let added = 0,
          updated = 0;
        const ids = [];
        for (const input of records) {
          record(input, "Every imported record must be an object.");
          stringFields(input, [
            "id",
            "sourceId",
            "name",
            "arabicName",
            "sector",
            "location",
            "type",
            "sourceRole",
            "website",
            "careersUrl",
            "applyUrl",
            "linkedinUrl",
            "email",
            "routeStatus",
          ]);
          if (input.sourceFields !== undefined)
            record(input.sourceFields, "Source fields must be an object.");
          for (const key of [
            "website",
            "careersUrl",
            "applyUrl",
            "linkedinUrl",
          ])
            if (input[key]) safeUrl(input[key]);
          const name = text(input.name, 500).trim();
          requireValue(name, "Every record needs a company or source name.");
          const sourceId = input.sourceId || input.id || null;
          const existing = sourceId
            ? db
                .prepare(
                  "SELECT payload FROM companies WHERE directory_id=? AND json_extract(payload,'$.sourceId')=?",
                )
                .get(directoryId, sourceId)
            : db
                .prepare(
                  "SELECT payload FROM companies WHERE directory_id=? AND lower(name)=lower(?)",
                )
                .get(directoryId, name);
          const old = parse(existing);
          if (old) {
            old.name = name;
            for (const key of [
              "arabicName",
              "sector",
              "location",
              "type",
              "sourceRole",
              "website",
              "careersUrl",
              "applyUrl",
              "linkedinUrl",
              "email",
              "routeStatus",
              "checkedAt",
              "sourceFields",
            ])
              if (input[key] !== undefined && input[key] !== "")
                old[key] = input[key];
            old.revision++;
            saveCompany(old);
            ids.push(old.id);
            updated++;
            continue;
          }
          let companyId =
            input.id &&
            !db.prepare("SELECT id FROM companies WHERE id=?").get(input.id)
              ? input.id
              : id("company");
          const c = {
            id: companyId,
            sourceId,
            directoryId,
            name,
            arabicName: text(input.arabicName),
            sector: text(input.sector),
            location: text(input.location),
            type: text(input.type),
            sourceRole: text(input.sourceRole),
            website: text(input.website),
            careersUrl: text(input.careersUrl),
            applyUrl: text(input.applyUrl),
            linkedinUrl: text(input.linkedinUrl),
            email: text(input.email),
            routeStatus: text(input.routeStatus || "Not checked"),
            checkedAt: input.checkedAt || null,
            sourceFields: input.sourceFields || {},
            status: "not_started",
            nextAction:
              input.careersUrl || input.applyUrl
                ? "Find a suitable role"
                : "Check recruitment route",
            lastUpdate: null,
            followUpAt: null,
            notes: "",
            attention: "",
            archived: false,
            revision: 1,
            createdAt: now(),
          };
          saveCompany(c);
          ids.push(c.id);
          added++;
        }
        activity(
          "companies_imported",
          `${added} added, ${updated} source records updated`,
        );
        return { added, updated, ids };
      });
    },
    updateCompany(companyId, patch) {
      record(patch);
      stringFields(patch, [
        "name",
        "status",
        "nextAction",
        "notes",
        "attention",
        "email",
        "careersUrl",
        "applyUrl",
        "website",
        "linkedinUrl",
        "sector",
        "location",
      ]);
      if ("archived" in patch)
        requireValue(
          typeof patch.archived === "boolean",
          "archived must be true or false.",
        );
      if ("expectedRevision" in patch)
        requireValue(
          Number.isInteger(patch.expectedRevision) &&
            patch.expectedRevision > 0,
          "expectedRevision must be a positive whole number.",
        );
      if ("followUpAt" in patch)
        requireValue(
          patch.followUpAt === null || typeof patch.followUpAt === "string",
          "Follow-up must be a date or empty.",
        );
      if ("attention" in patch)
        requireValue(
          ["", "needs_you", "update_failed"].includes(patch.attention),
          "Choose a supported attention flag.",
        );
      return tx(() => {
        const c = store.getCompany(companyId);
        if (
          patch.expectedRevision !== undefined &&
          patch.expectedRevision !== c.revision
        )
          throw new AppError(
            "This row changed. Reload it before saving your edit.",
            409,
          );
        const allowed = [
          "name",
          "status",
          "nextAction",
          "notes",
          "followUpAt",
          "attention",
          "email",
          "careersUrl",
          "applyUrl",
          "website",
          "linkedinUrl",
          "sector",
          "location",
          "archived",
        ];
        for (const key of allowed)
          if (key in patch)
            c[key] =
              typeof patch[key] === "string" ? text(patch[key]) : patch[key];
        requireValue(text(c.name).trim(), "A company needs a name.");
        requireValue(STATUSES.includes(c.status), "Choose a supported status.");
        c.name = text(c.name, 500).trim();
        for (const key of ["careersUrl", "applyUrl", "website", "linkedinUrl"])
          c[key] = safeUrl(c[key]);
        if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
          throw new AppError("Enter a valid careers email.");
        if (
          c.followUpAt &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(c.followUpAt) ||
            !Number.isFinite(Date.parse(c.followUpAt)) ||
            new Date(c.followUpAt).toISOString().slice(0, 10) !== c.followUpAt)
        )
          throw new AppError("Choose a valid follow-up date.");
        c.lastUpdate = now();
        c.revision++;
        saveCompany(c);
        activity(
          "company_updated",
          patch.status
            ? `Status set to ${patch.status} manually`
            : "Record updated",
          companyId,
        );
        return c;
      });
    },
    listApplications(companyId) {
      return db
        .prepare(
          "SELECT payload FROM applications" +
            (companyId ? " WHERE company_id=?" : ""),
        )
        .all(...(companyId ? [companyId] : []))
        .map(parse)
        .map(application => ({ ...application, milestones: applicationMilestones(application) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    prepareFormSubmission(input) {
      record(input); stringFields(input, ['companyId', 'runId', 'role', 'url', 'purpose']);
      const purpose = input.purpose ?? 'application';
      requireValue(Object.hasOwn(FORM_PURPOSE_EVENTS, purpose), 'Choose a supported form purpose.');
      const url = safeUrl(input.url);
      requireValue(url, 'Save the actual form URL.');
      return tx(() => {
        const run = store.getRun(input.runId);
        requirePurpose(run, purpose);
        const key = purpose === 'application' ? `form:${input.runId}:${input.companyId}:${roleKey(input.role)}` : `form:${purpose}:${input.runId}:${input.companyId}:${formDestination(url)}`;
        const apps = store.listApplications(input.companyId);
        const previous = apps.find(a => a.idempotencyKey === key || (purpose !== 'application' && a.method === 'form' && a.purpose === purpose && a.deliveryStatus === 'confirmed' && a.url && formDestination(a.url) === formDestination(url)));
        if (previous) return { application: previous, reused: true, nextStep: 'Inspect this existing intent. Do not submit again.' };
        store.checkSubmission({ ...input, purpose });
        const a = { id: id('application'), companyId: input.companyId, runId: input.runId, role: text(input.role, 500), method: 'form', purpose, url, idempotencyKey: key, status: 'prepared', deliveryStatus: 'unknown', notes: 'Submission reserved. Inspect the form for a receipt before any retry.', createdAt: now(), updatedAt: now() };
        db.prepare('INSERT INTO applications VALUES(?,?,?)').run(a.id, a.companyId, JSON.stringify(a));
        activity('form_submission_started', a.role || 'Application form', a.companyId);
        return { application: a, reused: false, nextStep: 'Submit this form once, then resolve the intent with its actual receipt.' };
      });
    },
    resolveFormSubmission({ id: applicationId, outcome, evidence, explicit = false } = {}) {
      return tx(() => {
        const a = read('applications', applicationId);
        requireValue(a?.method === 'form' && a.idempotencyKey, 'Choose a recorded form submission intent.');
        requireValue(['confirmed', 'not_submitted'].includes(outcome), 'Inspect the form, then choose confirmed or not_submitted.');
        requireValue(typeof evidence === 'string' && evidence.trim(), 'Record the actual confirmation or verified non-submission evidence.');
        if (a.deliveryStatus === 'confirmed') return a;
        if (outcome === 'not_submitted') requireValue(explicit === true, 'The user must explicitly confirm the form was not submitted before clearing this intent.');
        const previous = { ...a };
        const event = FORM_PURPOSE_EVENTS[a.purpose || 'application'];
        requireValue(event, 'This form intent has an unsupported purpose. Inspect its original record.');
        a.deliveryStatus = outcome === 'confirmed' ? 'confirmed' : 'failed';
        const advancedApplication = ['replied', 'interview', 'offer', 'closed'].includes(a.status);
        if (!advancedApplication) a.status = outcome === 'confirmed' ? event : 'needs_user';
        a.evidence = text(evidence);
        const resolution = outcome === 'confirmed' ? 'Submission confirmed by inspection.' : 'Verified not submitted. Ready for a new explicit Run.';
        a.notes = advancedApplication ? [a.notes, resolution].filter(Boolean).join('\n') : resolution; a.updatedAt = now();
        if (outcome === 'confirmed') {
          if (event === 'applied') a.appliedAt ||= now();
          a.milestones = recordMilestone(previous, { ...a, status: event }, now());
        }
        db.prepare('UPDATE applications SET payload=? WHERE id=?').run(JSON.stringify(a), a.id);
        const c = store.getCompany(a.companyId);
        const advancedCompany = ['replied', 'interview', 'offer', 'closed'].includes(c.status);
        if (!advancedCompany) {
          if (outcome === 'confirmed' && event === 'applied') c.status = 'applied';
          c.attention = outcome === 'confirmed' ? '' : 'needs_you'; c.nextAction = outcome === 'confirmed' ? event === 'applied' ? 'Wait for a reply' : 'Career profile progress recorded' : 'Run again when ready';
        }
        c.lastUpdate = now(); c.revision++; saveCompany(c);
        activity(outcome === 'confirmed' ? event : 'needs_user', a.notes, c.id, { applicationId: a.id }); return a;
      });
    },
    checkSubmission(input = {}) {
      record(input);
      stringFields(input, ["companyId", "runId", "role", "id", "purpose"]);
      const c = store.getCompany(input.companyId),
        r = store.getRun(input.runId);
      requireValue(
        !c.archived && r.status === "running" && r.companyIds.includes(c.id) && (!r.managed || r.activeCompanyId === c.id),
        "Start an explicit run for this company before submitting.",
      );
      const purpose = input.purpose ?? 'application';
      requirePurpose(r, purpose);
      const apps = store.listApplications();
      const duplicate = unresolvedSubmission(apps, c.id, input.id) || (purpose === 'cv_share' ? recentCvShare(apps, c.id, input.id) : purpose === 'application' ? recentSubmission(apps, c.id, input.role, input.id) : null);
      requireValue(
        !duplicate,
        "This role was already submitted in the last 60 days or has an unresolved send.",
      );
      return {
        ok: true,
        companyId: c.id,
        runId: r.id,
        remaining: null,
      };
    },
    beginEmailSend(input = {}) {
      record(input);
      stringFields(input, [
        "companyId",
        "runId",
        "role",
        "to",
        "subject",
        "body",
        "purpose",
      ]);
      return tx(() => {
        const c = store.getCompany(input.companyId),
          r = store.getRun(input.runId);
        const purpose = input.purpose ?? 'application';
        requireValue(EMAIL_PURPOSES.includes(purpose), 'Choose application or cv_share as the email purpose.');
        requirePurpose(r, purpose);
        const role = text(input.role, 500).trim();
        const roleKey = role.toLowerCase().replace(/\s+/g, " ");
        const key = purpose === 'cv_share' ? `cv-share:${r.id}:${c.id}` : `${r.id}:${c.id}:${roleKey}`;
        const apps = store.listApplications();
        const prior = apps.find((a) => a.idempotencyKey === key);
        if (prior) return { application: prior, reused: true };
        requireValue(
          !c.archived && r.status === "running" && r.companyIds.includes(c.id) && (!r.managed || r.activeCompanyId === c.id),
          "Start an explicit run for this company before sending.",
        );
        requireValue(
          c.email &&
            c.email.toLowerCase() === String(input.to || "").toLowerCase(),
          "Save the verified careers email on this company before sending.",
        );
        requireValue(
          text(input.subject).trim() && text(input.body).trim(),
          "Email needs a subject and body.",
        );
        const duplicate = unresolvedSubmission(apps, c.id) || (purpose === 'cv_share' ? recentCvShare(apps, c.id, undefined, input.to) : recentSubmission(apps, c.id, role));
        requireValue(
          !duplicate,
          "This role has a submission or an unresolved send. Check the existing application before trying again.",
        );
        const a = {
          id: id("application"),
          companyId: c.id,
          runId: r.id,
          role,
          method: "email",
          purpose,
          status: "prepared",
          deliveryStatus: "sending",
          idempotencyKey: key,
          to: String(input.to),
          subject: text(input.subject, 1000),
          body: text(input.body),
          createdAt: now(),
          updatedAt: now(),
          notes: "Waiting for a mailbox receipt",
        };
        db.prepare("INSERT INTO applications VALUES(?,?,?)").run(
          a.id,
          c.id,
          JSON.stringify(a),
        );
        activity("email_send_started", role || "Application email", c.id);
        return { application: a, reused: false };
      });
    },
    finishEmailSend(applicationId, { deliveryStatus, receipt, notes } = {}) {
      return tx(() => {
        const a = read("applications", applicationId);
        requireValue(a && a.deliveryStatus, "Email intent not found.");
        requireValue(
          ["confirmed", "unknown", "failed"].includes(deliveryStatus),
          "Use a supported delivery outcome.",
        );
        if (a.deliveryStatus === "confirmed") return a;
        const previous = { ...a };
        const event = a.purpose === 'cv_share' ? 'cv_sent' : 'applied';
        a.deliveryStatus = deliveryStatus;
        a.updatedAt = now();
        const advancedApplication = ['replied', 'interview', 'offer', 'closed'].includes(a.status);
        a.notes = advancedApplication && a.notes ? [a.notes, text(notes)].filter(Boolean).join('\n') : text(notes);
        const c = store.getCompany(a.companyId);
        if (deliveryStatus === "confirmed") {
          requireValue(
            receipt?.providerMessageId || receipt?.messageId,
            "A confirmed email needs a provider message ID.",
          );
          if (!advancedApplication) a.status = event;
          if (event === 'applied') a.appliedAt ||= now();
          else a.cvSentAt ||= now();
          a.evidence = receipt;
          a.providerMessageId = String(
            receipt.providerMessageId || receipt.messageId,
          );
          a.threadId = receipt.threadId || null;
          a.milestones = recordMilestone(previous, { ...a, status: event }, now());
          if (!["replied", "interview", "offer", "closed"].includes(c.status)) {
            if (event === 'applied') c.status = 'applied';
            c.nextAction = "Wait for a reply";
            c.attention = "";
          }
        } else {
          a.status = "needs_user";
          c.attention = "needs_you";
          c.nextAction =
            deliveryStatus === "unknown"
              ? "Check Sent before retrying"
              : "Review email setup";
        }
        db.prepare("UPDATE applications SET payload=? WHERE id=?").run(
          JSON.stringify(a),
          a.id,
        );
        c.lastUpdate = now();
        c.revision++;
        saveCompany(c);
        activity(
          deliveryStatus === "confirmed" ? event : "needs_user",
          a.notes || `Email ${deliveryStatus}`,
          c.id,
          { applicationId: a.id },
        );
        return a;
      });
    },
    logApplication(input = {}) {
      record(input);
      stringFields(input, [
        "id",
        "companyId",
        "role",
        "method",
        "status",
        "event",
        "notes",
        "url",
        "receivedAt",
        "lastReply",
      ]);
      for (const key of [
        "runId",
        "threadId",
        "providerMessageId",
        "to",
        "recipient",
      ])
        if (input[key] !== null) stringFields(input, [key]);
      return tx(() => {
        const c = store.getCompany(input.companyId);
        const previous = input.id ? read("applications", input.id) : null;
        if (input.id) requireValue(previous, "Application not found.");
        if (previous && previous.companyId !== c.id)
          throw new AppError("An application cannot move to another company.");
        if (previous?.idempotencyKey) {
          // Receipts and reconciliation belong to the original reserved action,
          // including when this is only a notes or reply update.
          const identity = {
            role: previous.role,
            method: previous.method,
            runId: previous.runId,
            to: previous.to,
            recipient: previous.to,
            url: previous.url,
            purpose: previous.purpose || 'application',
            idempotencyKey: previous.idempotencyKey,
          };
          for (const [field, original] of Object.entries(identity)) {
            if (Object.hasOwn(input, field)) requireValue(
              String(input[field] ?? '') === String(original ?? ''),
              `Keep the original submission identity (${field}). Record a different action separately; do not change an existing intent.`,
            );
          }
        }
        const role = previous?.idempotencyKey ? previous.role : text(input.role ?? previous?.role, 500).trim();
        const status = input.status || input.event || "prepared";
        const known = [
          "prepared",
          "applied",
          "replied",
          "interview",
          "offer",
          "closed",
          "account_created",
          "profile_created",
          "cv_uploaded",
          "cv_sent",
          "talent_pool_joined",
          "needs_user",
          "error",
        ];
        requireValue(
          known.includes(status),
          "Use a supported application event.",
        );
        const eventPurpose = { applied: 'application', cv_sent: 'cv_share', account_created: 'account', profile_created: 'profile', cv_uploaded: 'cv_upload', talent_pool_joined: 'talent_pool' }[status];
        if (previous?.idempotencyKey && eventPurpose) {
          requireValue(eventPurpose === (previous.purpose || 'application'), 'Keep the original submission purpose. Create a separate intent for a different action; do not relabel its receipt.');
        }
        if (status === 'profile_created') requireValue(hasEvidence(input.evidence) || (input.url && safeUrl(input.url)), 'Record the confirmed profile URL or evidence.');
        if (eventPurpose && (status === 'applied' || status === 'cv_sent' || input.runId || previous?.runId)) {
          const runId = input.runId || previous?.runId;
          const r = runId ? read("runs", runId) : null;
          requireValue(
            r &&
              r.status === "running" &&
              r.companyIds.includes(c.id) &&
              (!r.managed || r.activeCompanyId === c.id) &&
              Date.parse(r.expiresAt) > currentMs(),
            "Start an explicit run for this company before recording a submission.",
          );
          requirePurpose(r, eventPurpose);
        }
        if (status === "applied" || status === "cv_sent") {
          requireValue(
            hasEvidence(input.evidence),
            "A submission needs a provider message ID or a form receipt.",
          );
          const apps = store.listApplications();
          const duplicate = unresolvedSubmission(apps, c.id, input.id) || (status === 'cv_sent' ? recentCvShare(apps, c.id, input.id, input.to || input.recipient || previous?.to) : recentSubmission(apps, c.id, role, input.id));
          if (duplicate)
            throw new AppError(
              "This role was already submitted in the last 60 days or has an unresolved send. Update the existing application instead.",
            );
        }
        const a = {
          ...(previous || {}),
          id: previous?.id || id("application"),
          companyId: c.id,
          runId: input.runId || previous?.runId || null,
          role,
          method: text(input.method ?? previous?.method),
          status,
          evidence: input.evidence || previous?.evidence || null,
          threadId: input.threadId || previous?.threadId || null,
          providerMessageId:
            input.providerMessageId || previous?.providerMessageId || null,
          to: input.to || input.recipient || previous?.to || null,
          notes: text(input.notes ?? previous?.notes),
          url: text(input.url ?? previous?.url),
          createdAt: previous?.createdAt || now(),
          updatedAt: now(),
          ...(status === "applied"
            ? {
                appliedAt: previous?.appliedAt || now(),
                ...(previous?.deliveryStatus
                  ? { deliveryStatus: "confirmed" }
                  : {}),
              }
            : {}),
          ...(status === 'cv_sent' ? { cvSentAt: previous?.cvSentAt || now(), ...(previous?.deliveryStatus ? { deliveryStatus: 'confirmed' } : {}) } : {}),
          ...(status === "replied"
            ? { lastReplyAt: input.receivedAt || now() }
            : {}),
          ...(input.lastReply ? { lastReply: text(input.lastReply) } : {}),
        };
        a.milestones = recordMilestone(previous, a, now());
        db.prepare(
          "INSERT INTO applications VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        ).run(a.id, c.id, JSON.stringify(a));
        if (
          ["applied", "replied", "interview", "offer", "closed"].includes(
            status,
          ) &&
          (status === 'applied' || a.appliedAt || (!a.cvSentAt && (!a.purpose || a.purpose === 'application'))) &&
          !(
            status === "replied" &&
            ["interview", "offer", "closed"].includes(c.status)
          )
        )
          c.status = status;
        if (status === "needs_user" || status === "error")
          c.attention = status === "error" ? "update_failed" : "needs_you";
        c.nextAction =
          status === "applied"
            ? "Wait for a reply"
            : status === "replied"
              ? "Read the reply"
              : status === "interview"
                ? "Prepare for interview"
                : status === "needs_user"
                  ? "Continue in your browser"
                  : status === "error"
                    ? "Check application details"
                    : c.nextAction;
        c.lastUpdate = now();
        c.revision++;
        saveCompany(c);
        activity(
          status,
          `${a.role || "Application"}: ${input.notes || status}`,
          c.id,
          { applicationId: a.id },
        );
        return a;
      });
    },
    remainingCompanies({ directoryId, companyIds, ...filters } = {}) {
      requireValue(typeof directoryId === "string" && read("directories", directoryId) && !read("directories", directoryId).archived, "Choose an active directory.");
      if (companyIds !== undefined) requireValue(Array.isArray(companyIds) && companyIds.every(id => typeof id === "string"), "Company IDs must be a list of text.");
      const candidates = companyIds === undefined ? store.exportCompanies(directoryId) : [...new Set(companyIds)].map(id => store.getCompany(id));
      requireValue(candidates.every(c => c.directoryId === directoryId && !c.archived), "All selected companies must belong to this active directory.");
      return unfinishedRows(filterCompanyRows(candidates, filters));
    },
    validateCompanyTypes(companyTypes) {
      if (companyTypes === undefined) return [];
      requireValue(Array.isArray(companyTypes) && companyTypes.every(value => COMPANY_TYPES.some(type => type.id === value)), "Choose supported company types.");
      return [...new Set(companyTypes)];
    },
    validateRunLocations(locations) {
      if (locations === undefined) return [];
      requireValue(Array.isArray(locations) && locations.every(value => typeof value === 'string' && value.length > 0 && value.length <= 1000), 'Choose locations from the run preview.');
      return [...new Set(locations)];
    },
    previewRun(input = {}) {
      record(input);
      const actions = runActions(input.actions);
      const filters = companyFilter(input);
      const candidates = store.remainingCompanies({ directoryId: input.directoryId, companyIds: input.companyIds });
      return {
        runActionsVersion: 1,
        listScopeVersion: 1,
        actions,
        count: filterCompanyRows(candidates, filters).length,
        ...companyFacets(candidates),
      };
    },
    startManagedRun(input) {
      return tx(() => {
      runActions(input.actions, { requireSelection: true });
      requireValue(["codex", "claude-code"].includes(input.assistant), "Choose Codex or Claude Code.");
      requireValue(!store.listRuns().some(r => r.managed && r.status === "running"), "A run is already working. Stop it before starting another.");
      const companyIds = store.remainingCompanies(input).map(c => c.id);
      requireValue(companyIds.length > 0, "No remaining companies in this selection.");
      const r = store.startRun({ ...input, companyIds }, { transaction: false });
      Object.assign(r, { managed: true, assistant: input.assistant, activeCompanyId: null, targets: companyIds.map(companyId => ({ companyId, name: store.getCompany(companyId).name, status: "pending" })) });
      write("runs", r.id, r);
      return r;
      });
    },
    beginRunTarget(runId, companyId) {
      return tx(() => {
        const r = store.getRun(runId);
        requireValue(r.managed && r.status === "running" && !r.activeCompanyId, "This queue cannot start a company now.");
        const target = r.targets.find(t => t.companyId === companyId);
        requireValue(target?.status === "pending", "This company has already been attempted in this run.");
        target.status = "working"; target.startedAt = now();
        r.activeCompanyId = companyId; r.expiresAt = new Date(currentMs() + 3600000).toISOString(); r.updatedAt = now();
        write("runs", r.id, r); return r;
      });
    },
    finishRunTarget(runId, companyId, { status, reason = "" }) {
      return tx(() => {
        const r = store.getRun(runId);
        requireValue(r.managed && r.activeCompanyId === companyId, "This company is not active in this queue.");
        requireValue(["applied", "checked", "failed", "needs_you", "uncertain", "skipped"].includes(status), "Choose a valid queue outcome.");
        const target = r.targets.find(t => t.companyId === companyId);
        Object.assign(target, { status, reason: text(reason, 500), finishedAt: now() });
        r.activeCompanyId = null; r.completed = r.targets.filter(t => !["pending", "working"].includes(t.status)).length; r.updatedAt = now();
        write("runs", r.id, r);
        activity("run_company_finished", `${status}: ${text(reason, 500)}`, companyId);
        if (['failed', 'needs_you', 'uncertain'].includes(status)) {
          const c = store.getCompany(companyId);
          c.attention = status === 'failed' ? 'update_failed' : 'needs_you'; c.nextAction = text(reason, 500); c.lastUpdate = now(); c.revision++; saveCompany(c);
        }
        return r;
      });
    },
    runSummaries() {
      return store.listRuns().slice(0, 10).map(({ targets, companyIds, brief, ...run }) => ({ ...run, total: companyIds.length, appliedCount: targets?.filter(t => t.status === 'applied').length || 0, directoryName: read('directories', run.directoryId)?.name || '', currentName: targets?.find(t => t.companyId === run.activeCompanyId)?.name || '' }));
    },
    startRun(input = {}, { transaction = true } = {}) {
      record(input);
      stringFields(input, ["directoryId", "mode", "instructions"]);
      const companyTypes = store.validateCompanyTypes(input.companyTypes);
      const locations = store.validateRunLocations(input.locations);
      const { search, status, attention } = companyFilter(input);
      const actions = runActions(input.actions, { requireSelection: true });
      const create = () => {
        requireValue(
          input.explicit === true && input.mode === "send_and_submit",
          "An explicit start is required to send and submit applications.",
        );
        let companyIds = input.companyIds;
        if (companyIds === undefined) companyIds = store.remainingCompanies({ directoryId: input.directoryId, companyTypes, locations, search, status, attention }).map(c => c.id);
        requireValue(Array.isArray(companyIds) && companyIds.length > 0, "No remaining companies. Choose another directory or selection.");
        requireValue(
          companyIds.every((companyId) => typeof companyId === "string"),
          "Company IDs must be text.",
        );
        companyIds = [...new Set(companyIds)];
        const selectedDirectory =
          input.directoryId || store.getCompany(companyIds[0]).directoryId;
        requireValue(
          read("directories", selectedDirectory) &&
            !read("directories", selectedDirectory).archived,
          "Choose an active directory for this run.",
        );
        for (const companyId of companyIds) {
          const c = store.getCompany(companyId);
          requireValue(
            !c.archived,
            "Restore archived companies before starting a run.",
          );
          if (c.directoryId !== selectedDirectory)
            throw new AppError(
              "All selected companies must belong to this directory.",
            );
        }
        companyIds = filterCompanyRows(companyIds.map(companyId => store.getCompany(companyId)), { companyTypes, locations, search, status, attention }).map(company => company.id);
        requireValue(companyIds.length > 0, "No remaining companies match these filters. Choose another type, location or selection.");
        const directory = read('directories', selectedDirectory);
        const recordedLocations = new Map(companyIds.flatMap(companyId => companyLocations(store.getCompany(companyId), directory)).map(place => [place.id, place.label]));
        const r = {
          id: id("run"),
          directoryId: selectedDirectory,
          companyIds,
          companyTypes,
          locations,
          search,
          statusFilter: status,
          attentionFilter: attention,
          filters: { search, status, attention, companyTypes, locations },
          actions,
          directoryName: directory.name,
          locationLabels: locations.map(location => recordedLocations.get(location)).filter(Boolean),
          companyTypeLabels: COMPANY_TYPES.filter(type => companyTypes.includes(type.id)).map(type => type.label),
          instructions: text(input.instructions),
          mode: "send_and_submit",
          explicit: true,
          status: "running",
          createdAt: now(),
          expiresAt: new Date(currentMs() + 3600000).toISOString(),
          updatedAt: now(),
          completed: 0,
        };
        r.brief = buildRunBrief(r);
        write("runs", r.id, r);
        for (const companyId of companyIds) {
          const c = store.getCompany(companyId);
          c.status = c.status === "not_started" ? "ready" : c.status;
          // Preserve the existing next step until this company has a real outcome.
          c.revision++;
          saveCompany(c);
        }
        activity(
          "run_started",
          `Authorized ${companyIds.length} companies for this run`,
        );
        return r;
      };
      return transaction ? tx(create) : create();
    },
    getRun(runId) {
      const r = read("runs", runId);
      if (!r) throw new AppError("Run not found.", 404);
      return {
        ...r,
        ...(r.status === "running" && Date.parse(r.expiresAt) <= currentMs()
          ? { status: "expired" }
          : {}),
      };
    },
    listRuns() {
      return all("runs")
        .map((r) => store.getRun(r.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    updateRun(runId, patch) {
      record(patch);
      stringFields(patch, ["status", "notes"]);
      const r = store.getRun(runId);
      if (
        patch.status &&
        !["running", "completed", "cancelled", "failed"].includes(patch.status)
      )
        throw new AppError("Invalid run status.");
      if (r.status !== "running" && patch.status === "running")
        throw new AppError("Start a new run to renew authorization.");
      if ("completed" in patch)
        requireValue(
          Number.isInteger(patch.completed) &&
            patch.completed >= 0 &&
            patch.completed <= r.companyIds.length,
          "Completed count must fit this run’s targets.",
        );
      for (const key of ["status", "completed", "notes"])
        if (key in patch) r[key] = patch[key];
      r.updatedAt = now();
      write("runs", r.id, r);
      activity("run_updated", `${r.id}: ${r.status}`);
      return r;
    },
    listActivity({ companyId, limit = 50 } = {}) {
      return db
        .prepare(
          "SELECT payload FROM activity" +
            (companyId ? " WHERE company_id=?" : "") +
            " ORDER BY rowid DESC LIMIT ?",
        )
        .all(
          ...(companyId ? [companyId] : []),
          Math.min(1000, Number(limit) || 50),
        )
        .map(parse);
    },
    getSettings() {
      const settings = { ...defaults, ...read("settings", "main") };
      delete settings.dailyCap; // Earlier versions imposed a daily count; runs now have no app count limit.
      return settings;
    },
    updateSettings(patch) {
      record(patch);
      stringFields(patch, [
        "refreshFrequency",
        "reportFrequency",
        "reportTime",
        "timezone",
        "reportEmail",
        "language",
        "cvLink",
        "cvText",
      ]);
      if ("emailReports" in patch)
        requireValue(
          typeof patch.emailReports === "boolean",
          "emailReports must be true or false.",
        );
      requireValue(!("dailyCap" in patch), "Application count limits are no longer used.");
      for (const key of ["reportDay", "reportEveryDays"])
        if (key in patch)
          requireValue(
            typeof patch[key] === "number" && Number.isInteger(patch[key]),
            `${key} must be a whole number.`,
          );
      for (const key of ["lastRefreshAt", "lastReportAt"])
        if (key in patch && patch[key] !== null)
          requireValue(
            typeof patch[key] === "string" &&
              Number.isFinite(Date.parse(patch[key])),
            `${key} must be a valid timestamp or empty.`,
          );
      for (const key of [
        "lastRefreshError",
        "lastRefreshMessage",
        "lastRefreshStatus",
        "lastReportError",
      ])
        if (key in patch && patch[key] !== null)
          requireValue(
            typeof patch[key] === "string",
            `${key} must be text or empty.`,
          );
      const s = store.getSettings();
      for (const key of Object.keys(defaults))
        if (key in patch) s[key] = patch[key];
      requireValue(
        ["manual", "hourly", "daily", "weekly"].includes(s.refreshFrequency),
        "Choose a supported update frequency.",
      );
      requireValue(
        ["off", "daily", "weekly", "custom"].includes(s.reportFrequency),
        "Choose a supported report frequency.",
      );
      requireValue(
        /^([01]\d|2[0-3]):[0-5]\d$/.test(s.reportTime),
        "Choose a valid report time.",
      );
      requireValue(
        Number.isInteger(Number(s.reportDay)) &&
          s.reportDay >= 0 &&
          s.reportDay <= 6,
        "Choose a report day.",
      );
      requireValue(
        Number(s.reportEveryDays) >= 1 && Number(s.reportEveryDays) <= 365,
        "Report interval must be 1 to 365 days.",
      );
      requireValue(
        ["en", "ar"].includes(s.language),
        "Choose English or Arabic.",
      );
      try {
        new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
      } catch {
        throw new AppError("Choose a valid time zone.");
      }
      if (s.emailReports && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.reportEmail))
        throw new AppError("Enter the email address for reports.");
      if (s.cvLink) s.cvLink = safeUrl(s.cvLink);
      s.reportDay = Number(s.reportDay);
      s.reportEveryDays = Number(s.reportEveryDays);
      write("settings", "main", s);
      return s;
    },
    snapshot(input = {}) {
      record(input);
      requireValue(Object.keys(input).every(key => ['directoryId', 'period', 'metric', 'offset', 'limit'].includes(key)), 'Use only directoryId, period, metric, offset and limit for a snapshot.');
      requireValue(typeof input.directoryId === 'string' && input.directoryId.trim(), 'Choose a directory for the snapshot.');
      const directory = read('directories', input.directoryId);
      if (!directory) throw new AppError('Directory not found.', 404);
      const period = input.period === undefined ? 'all_time' : input.period;
      const metric = input.metric === undefined ? null : input.metric;
      requireValue(['all_time', 'this_week'].includes(period), 'Choose all_time or this_week.');
      requireValue((metric === null && input.metric === undefined) || ['applications', 'profiles', 'emails'].includes(metric), 'Choose applications, profiles or emails.');
      const pageNumber = (key, fallback, minimum, maximum) => {
        const value = input[key] === undefined ? fallback : input[key];
        requireValue((typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum, `Use a whole ${key} from ${minimum} to ${maximum}.`);
        return Number(value);
      };
      const offset = pageNumber('offset', 0, 0, Number.MAX_SAFE_INTEGER);
      const limit = pageNumber('limit', 20, 1, 100);
      return directorySnapshot({
        directory, companies: db.prepare('SELECT payload FROM companies WHERE directory_id=?').all(directory.id).map(parse),
        applications: db.prepare('SELECT a.payload FROM applications a JOIN companies c ON c.id=a.company_id WHERE c.directory_id=?').all(directory.id).map(parse),
        activity: db.prepare('SELECT a.payload FROM activity a JOIN companies c ON c.id=a.company_id WHERE c.directory_id=?').all(directory.id).map(parse).filter(item => !item.applicationId),
        timeZone: store.getSettings().timezone,
        until: now(), period, metric, offset, limit,
      });
    },
    report({
      since = new Date(currentMs() - 7 * 86400000).toISOString(),
    } = {}) {
      const companies = store.exportCompanies(),
        apps = store.listApplications();
      requireValue(typeof since === 'string' && Number.isFinite(Date.parse(since)), 'Choose a valid report start time.');
      const today = calendarDay(now(), store.getSettings().timezone);
      return {
        generatedAt: now(),
        since,
        totalCompanies: companies.length,
        ...milestoneReport(apps, progressActivity(), new Set(companies.map(company => company.id)), since, now()),
        applied: apps.filter((a) => a.appliedAt && a.appliedAt >= since).length,
        replies: apps.filter((a) => a.lastReplyAt && a.lastReplyAt >= since)
          .length,
        interviews: apps.filter((a) => a.status === "interview").length,
        followUps: companies
          .filter(
            (c) =>
              c.followUpAt &&
              c.followUpAt <= today &&
              !["closed", "offer"].includes(c.status),
          )
          .map((c) => ({ id: c.id, name: c.name, followUpAt: c.followUpAt })),
        needsYou: companies
          .filter((c) => c.attention === "needs_you")
          .map((c) => ({ id: c.id, name: c.name })),
        errors: companies.filter((c) => c.attention === "update_failed").length,
        statusCounts: Object.fromEntries(
          STATUSES.map((s) => [
            s,
            companies.filter((c) => c.status === s).length,
          ]),
        ),
      };
    },
    saveReport(report) {
      const r = { ...report, id: report.id || id("report") };
      db.prepare(
        "INSERT INTO reports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      ).run(r.id, r.generatedAt || now(), JSON.stringify(r));
      return r;
    },
    listReports() {
      return db
        .prepare(
          "SELECT payload FROM reports ORDER BY created_at DESC LIMIT 20",
        )
        .all()
        .map(parse);
    },
    addActivity: activity,
  };
  if (seed && !all("directories").length) {
    const seedPath = resolve(ROOT, "data/uae-directory.json");
    if (existsSync(seedPath)) {
      const source = JSON.parse(readFileSync(seedPath, "utf8"));
      store.createDirectory({
        id: "uae",
        name: "UAE",
        flag: "🇦🇪",
        country: "United Arab Emirates",
      });
      store.addCompanies("uae", source.records || source);
    }
  }
  return store;
}
