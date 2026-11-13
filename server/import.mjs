import { parse } from 'csv-parse/sync';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 150;

function checkArchiveSize(buffer) {
  // Bound the expanded size before a ZIP reader allocates worksheet strings.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This file is not a readable Excel workbook.');
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  if (count > 2_000 || position === 0xffffffff) throw new Error('This Excel file is too large. Save a smaller sheet as CSV.');
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== 0x02014b50) throw new Error('This file is not a readable Excel workbook.');
    expanded += buffer.readUInt32LE(position + 24);
    if (expanded > 100 * 1024 * 1024) throw new Error('This Excel file expands beyond 100 MB. Save a smaller sheet as CSV.');
    position += 46 + buffer.readUInt16LE(position + 28) + buffer.readUInt16LE(position + 30) + buffer.readUInt16LE(position + 32);
  }
}

async function readNamespacedWorkbook(buffer) {
  // Read standard and namespace-prefixed OOXML directly. Source files are never
  // rewritten, and formulas are read only from their saved result values.
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: false });
  const decode = value => String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (entity, code) => {
    const named = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
    if (named[code]) return named[code];
    const point = code.startsWith('#x') ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const xml = async entry => {
    const file = zip.file(entry);
    if (!file) throw new Error(`Workbook part missing: ${entry}`);
    return parser.parse(await file.async('string'));
  };
  const text = value => {
    if (Array.isArray(value)) return value.map(text).join('');
    if (typeof value === 'string' || typeof value === 'number') return decode(value);
    if (value == null) return '';
    if (value.t != null) return text(value.t);
    if (value['#text'] != null) return decode(value['#text']);
    return list(value.r).map(text).join('');
  };
  const book = await xml('xl/workbook.xml');
  const date1904 = ['1', 'true'].includes(book.workbook?.workbookPr?.['@_date1904']);
  const sheets = list(book.workbook?.sheets?.sheet);
  const sheet = sheets.find(item => item['@_name'] === 'Directory') || sheets[0];
  if (!sheet) throw new Error('This workbook has no sheets.');
  const rels = list((await xml('xl/_rels/workbook.xml.rels')).Relationships?.Relationship);
  const relationship = rels.find(item => item['@_Id'] === sheet['@_id']);
  if (!relationship) throw new Error('Worksheet reference is missing.');
  const target = decode(relationship['@_Target']);
  const entry = target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`);
  const worksheet = (await xml(entry)).worksheet;
  const shared = zip.file('xl/sharedStrings.xml') ? list((await xml('xl/sharedStrings.xml')).sst?.si).map(text) : [];
  const styles = zip.file('xl/styles.xml') ? (await xml('xl/styles.xml')).styleSheet : {};
  const customFormats = new Map(list(styles?.numFmts?.numFmt).map(item => [Number(item['@_numFmtId']), decode(item['@_formatCode'])]));
  const builtInDates = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const dateStyles = list(styles?.cellXfs?.xf).map(style => {
    const formatId = Number(style['@_numFmtId']);
    const custom = (customFormats.get(formatId) || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
    return builtInDates.has(formatId) || /[ymdhs]/i.test(custom);
  });
  const rows = [];
  const links = new Map();
  const columnIndex = address => {
    let index = 0;
    for (const char of address.replace(/[0-9]/g, '')) index = index * 26 + char.charCodeAt(0) - 64;
    return index - 1;
  };
  for (const row of list(worksheet?.sheetData?.row)) {
    const rowIndex = Number(row['@_r']) - 1;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > MAX_ROWS + 29) throw new Error('Import up to 20,000 rows at a time.');
    while (rows.length <= rowIndex) rows.push([]);
    for (const cell of list(row.c)) {
      const col = columnIndex(cell['@_r'] || '');
      if (col < 0 || col >= MAX_COLUMNS) throw new Error('Import up to 150 columns at a time.');
      let value = cell['@_t'] === 's' ? shared[Number(cell.v)] || '' : cell['@_t'] === 'inlineStr' ? text(cell.is) : decode(cell.v);
      if (!cell['@_t'] && cell.v !== undefined && dateStyles[Number(cell['@_s']) || 0] && Number.isFinite(Number(cell.v))) {
        const serial = Number(cell.v);
        const epoch = date1904 ? Date.UTC(1904, 0, 1) : serial < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
        const date = new Date(epoch + Math.round(serial * 86_400_000));
        if (Number.isFinite(date.getTime())) value = date.toISOString();
      }
      rows[rowIndex][col] = value;
    }
  }
  const relationshipEntry = `${path.posix.dirname(entry)}/_rels/${path.posix.basename(entry)}.rels`;
  const linkRelationships = zip.file(relationshipEntry) ? list((await xml(relationshipEntry)).Relationships?.Relationship) : [];
  for (const link of list(worksheet?.hyperlinks?.hyperlink)) {
    const destination = linkRelationships.find(item => item['@_Id'] === link['@_id'])?.['@_Target'];
    const address = link['@_ref'];
    const row = Number(address?.match(/\d+$/)?.[0]) - 1;
    if (destination && address && Number.isInteger(row)) links.set(`${row}:${columnIndex(address)}`, decode(destination));
  }
  return { rows, links, sheetName: decode(sheet['@_name']) };
}
const aliases = {
  name: ['name', 'company', 'company name', 'company name en', 'organisation', 'organization', 'organisation source', 'organization source', 'employer'],
  arabicName: ['arabic name', 'company name ar', 'name ar', 'organisation arabic name'],
  sector: ['sector', 'industry'],
  location: ['location', 'city', 'emirate', 'emirate location', 'country'],
  type: ['type', 'organisation type', 'organization type', 'company type'],
  sourceRole: ['source role', 'source type'],
  website: ['website', 'website reference', 'company website', 'url'],
  careersUrl: ['careers', 'career', 'careers url', 'careers page', 'careers page url', 'career url', 'career page'],
  applyUrl: ['jobs apply', 'apply', 'apply url', 'jobs url', 'application url', 'jobs'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedin company page', 'linkedin company page url'],
  email: ['email', 'careers email', 'career email', 'recruitment email', 'contact email'],
  routeStatus: ['route status', 'public route status', 'recruitment route status'],
  checkedAt: ['checked', 'last checked', 'last checked date', 'checked at', 'verified date'],
  id: ['id', 'record id', 'source id'],
};

const normalizeHeader = value => String(value ?? '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalizeValue = value => value instanceof Date ? value.toISOString() : String(value ?? '').trim();
const known = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [name, field])));

function safeUrl(value) {
  const text = normalizeValue(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? text : '';
  } catch { return ''; }
}

function findHeader(rows) {
  const index = rows.slice(0, 30).findIndex(row => row.some(value => known.get(normalizeHeader(value)) === 'name'));
  if (index < 0) throw new Error('Add a Company or Name column, then import the file again.');
  const headers = rows[index].map(normalizeValue);
  const seen = new Set();
  for (const header of headers) {
    if (!header) continue;
    const normalized = normalizeHeader(header);
    if (seen.has(normalized)) throw new Error(`Duplicate column: ${header}. Give each column a different name.`);
    seen.add(normalized);
  }
  const mapped = new Set();
  for (const header of headers) {
    const field = known.get(normalizeHeader(header));
    if (field && mapped.has(field)) throw new Error(`More than one column maps to ${field}. Keep one column for that field.`);
    if (field) mapped.add(field);
  }
  return { index, headers };
}

function convertRows(rows, links = new Map()) {
  const { index, headers } = findHeader(rows);
  const records = [];
  const warnings = [];
  const sourceIds = new Set();
  for (let rowIndex = index + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row.some(value => normalizeValue(value))) continue;
    const record = Object.fromEntries(Object.keys(aliases).map(field => [field, '']));
    record.sourceFields = {};
    const originalLinks = {};
    for (let col = 0; col < headers.length; col++) {
      const header = headers[col];
      if (!header) continue;
      const original = normalizeValue(row[col]);
      record.sourceFields[header] = original;
      const hyperlink = links.get(`${rowIndex}:${col}`);
      if (hyperlink) originalLinks[header] = hyperlink;
      const field = known.get(normalizeHeader(header));
      if (field) record[field] = ['website', 'careersUrl', 'applyUrl', 'linkedinUrl'].includes(field) ? safeUrl(hyperlink || original) : original;
    }
    if (Object.keys(originalLinks).length) record.sourceFields['Source hyperlinks'] = originalLinks;
    if (!record.name) {
      warnings.push(`Row ${rowIndex + 1} skipped: company name is empty.`);
      continue;
    }
    if (record.name.length > 500) throw new Error(`Row ${rowIndex + 1}: company name is longer than 500 characters.`);
    if (record.id && sourceIds.has(record.id)) throw new Error(`Duplicate record ID: ${record.id}. Each source record needs a unique ID.`);
    if (record.id) sourceIds.add(record.id);
    if (record.email) {
      record.email = record.email.replace(/^mailto:/i, '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
        warnings.push(`Row ${rowIndex + 1}: email needs checking. Original value kept in source details.`);
        record.email = '';
      }
    }
    if (!record.routeStatus) record.routeStatus = record.careersUrl || record.applyUrl || record.email ? 'Imported route, untested' : 'Recruitment route unknown';
    records.push(record);
  }
  if (!records.length) throw new Error('No companies found. Add at least one row with a company name.');
  return { records, warnings, headerRow: index + 1 };
}

/** Import directory reference data. Does not execute instructions, formulas, or URLs. */
export async function parseDirectory({ filename, content }) {
  if (!filename || !content) throw new Error('Choose a CSV, TSV or Excel (.xlsx) file.');
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (buffer.length > MAX_BYTES) throw new Error('This file is too large. Import a file smaller than 20 MB.');
  const extension = filename.toLowerCase().split('.').pop();
  let rows;
  let links = new Map();
  let sheetName;
  if (extension === 'csv' || extension === 'tsv') {
    rows = parse(buffer, { bom: true, delimiter: extension === 'tsv' ? '\t' : ',', relax_column_count: true, skip_empty_lines: true, max_record_size: 1_000_000 });
  } else if (extension === 'xlsx') {
    checkArchiveSize(buffer);
    try { ({ rows, links, sheetName } = await readNamespacedWorkbook(buffer)); }
    catch (error) { throw new Error(`This Excel file could not be read. ${error.message}`); }
  } else {
    throw new Error('Choose a CSV, TSV or Excel (.xlsx) file.');
  }
  if (rows.length > MAX_ROWS + 30 || rows.some(row => row.length > MAX_COLUMNS)) throw new Error('Import up to 20,000 rows and 150 columns at a time.');
  const result = convertRows(rows, links);
  return {
    records: result.records,
    warnings: result.warnings,
    source: { filename: filename.split(/[\\/]/).pop(), ...(sheetName ? { sheet: sheetName } : {}), headerRow: result.headerRow, recordCount: result.records.length },
  };
}
