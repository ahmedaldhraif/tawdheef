import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { parseDirectory } from '../server/import.mjs';

test('CSV retains quoted multiline evidence, source IDs, and source roles', async () => {
  const result = await parseDirectory({ filename: 'jobs.csv', content: 'Company,Record ID,Careers page URL,Source role,Evidence\n"Example, LLC",example_1,https://example.com/careers,Job board,"Official page\nUnverified submission"\n' });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'example_1');
  assert.equal(result.records[0].name, 'Example, LLC');
  assert.equal(result.records[0].sourceRole, 'Job board');
  assert.equal(result.records[0].sourceFields.Evidence, 'Official page\nUnverified submission');
  assert.equal(result.records[0].routeStatus, 'Imported route, untested');
});

test('duplicate headers and conflicting field aliases are rejected', async () => {
  await assert.rejects(parseDirectory({ filename: 'bad.csv', content: 'Company,Email,Email\nExample,a@example.com,b@example.com' }), /Duplicate column/);
  await assert.rejects(parseDirectory({ filename: 'bad.csv', content: 'Company,Name\nExample,Other' }), /More than one column/);
});

test('unsafe URLs and invalid email are retained only as reference values', async () => {
  const result = await parseDirectory({ filename: 'test.csv', content: 'Company,Careers,Email\nExample,javascript:alert(1),not-an-email' });
  assert.equal(result.records[0].careersUrl, '');
  assert.equal(result.records[0].email, '');
  assert.equal(result.records[0].sourceFields.Careers, 'javascript:alert(1)');
  assert.equal(result.warnings.length, 1);
});

test('XLSX uses hyperlink destinations and recognises a title before the header', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Directory');
  sheet.getCell('A2').value = 'A source directory';
  sheet.getCell('A5').value = 'Organisation / source';
  sheet.getCell('B5').value = 'Careers';
  sheet.getCell('C5').value = 'Record ID';
  sheet.getCell('A6').value = 'Example';
  sheet.getCell('B6').value = { text: 'Careers', hyperlink: 'https://example.com/jobs' };
  sheet.getCell('C6').value = 'example_1';
  const result = await parseDirectory({ filename: 'source.xlsx', content: Buffer.from(await workbook.xlsx.writeBuffer()) });
  assert.equal(result.source.headerRow, 5);
  assert.equal(result.records[0].careersUrl, 'https://example.com/jobs');
  assert.equal(result.records[0].sourceFields.Careers, 'Careers');
  assert.equal(result.records[0].sourceFields['Source hyperlinks'].Careers, 'https://example.com/jobs');
});

test('seed retains 772 unique IDs and unresolved source distinctions', async () => {
  const seed = JSON.parse(await readFile(new URL('../data/uae-directory.json', import.meta.url), 'utf8'));
  assert.equal(seed.records.length, 772);
  assert.equal(new Set(seed.records.map(row => row.id)).size, 772);
  assert.equal(seed.records.filter(row => row.sourceRole === 'Job board').length, 15);
  assert.equal(seed.records.filter(row => row.routeStatus === 'Recruitment route unknown').length, 276);
  assert.equal(seed.records.filter(row => row.email).length, 0);
  assert.equal(seed.records[0].careersUrl, 'https://careers.abb/global/en/career-opportunities');
});

test('namespace-prefixed OOXML preserves XML-escaped URLs', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Directory');
  sheet.addRow(['Company', 'Careers']);
  sheet.addRow(['Example & Sons', { text: 'Careers', hyperlink: 'https://example.com/jobs?a=1&b=2' }]);
  const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
  const source = await zip.file('xl/workbook.xml').async('string');
  zip.file('xl/workbook.xml', source.replace('<workbook ', '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ').replace('</workbook>', '</x:workbook>'));
  const result = await parseDirectory({ filename: 'namespaced.xlsx', content: await zip.generateAsync({ type: 'nodebuffer' }) });
  assert.equal(result.records[0].name, 'Example & Sons');
  assert.equal(result.records[0].careersUrl, 'https://example.com/jobs?a=1&b=2');
});

test('standard OOXML reads cached formula values and date styles without evaluating formulas', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Companies');
  sheet.addRow(['Company', 'Careers', 'Checked', 'Research notes']);
  sheet.addRow([
    'Example',
    { formula: 'HYPERLINK("https://unvisited.invalid/", "Careers")', result: 'https://example.com/careers' },
    new Date('2026-11-13T00:00:00.000Z'),
    { formula: 'WEBSERVICE("https://unvisited.invalid/")' },
  ]);
  sheet.getCell('C2').numFmt = 'yyyy-mm-dd';
  const result = await parseDirectory({ filename: 'standard.xlsx', content: Buffer.from(await workbook.xlsx.writeBuffer()) });
  assert.equal(result.records[0].careersUrl, 'https://example.com/careers');
  assert.equal(result.records[0].checkedAt, '2026-11-13T00:00:00.000Z');
  assert.equal(result.records[0].sourceFields['Research notes'], '');
});
