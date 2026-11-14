import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operatorRunView } from '../server/operator-contract.mjs';
import { buildCandidateBrief, buildAttemptContext } from '../server/agent-context.mjs';

function runFixture(count) {
  const companyIds = Array.from({ length: count }, (_, i) => `company-${String(i).padStart(6, '0')}`);
  return { id: 'fixture-run', managed: true, status: 'running', explicit: true, mode: 'send_and_submit', directoryId: 'test', activeCompanyId: companyIds[0], companyIds, actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false }, filters: { search: 'exact scope', companyTypes: ['private'] }, expiresAt: '2099-11-14T10:00:00Z', completed: 0, targets: companyIds.map(companyId => ({ companyId, name: companyId === companyIds[0] ? 'Assigned company' : 'OTHER COMPANY MUST NOT APPEAR', status: companyId === companyIds[0] ? 'working' : 'pending' })) };
}

test('operator run payload stays bounded at 13,714 targets without changing authorization or full queue', () => {
  const run = runFixture(13714), original = JSON.stringify(run), view = operatorRunView(run, run.activeCompanyId), text = JSON.stringify(view);
  assert.equal(view.totalTargets, 13714); assert.deepEqual(view.companyIds, [run.activeCompanyId]); assert.equal(view.targets.length, 1);
  assert.deepEqual(view.actions, run.actions); assert.deepEqual(view.filters, run.filters); assert.equal(view.expiresAt, run.expiresAt);
  assert.ok(text.length < 1500); assert.ok(!text.includes('OTHER COMPANY')); assert.equal(JSON.stringify(run), original);
  assert.ok(Math.abs(text.length - JSON.stringify(operatorRunView(runFixture(1), run.activeCompanyId)).length) < 10);
  assert.throws(() => operatorRunView(run, run.companyIds[1]), /assigned company/);
  assert.throws(() => operatorRunView({ ...run, status: 'cancelled' }, run.activeCompanyId), /active run/);
});

test('candidate brief is exact source with provenance, paging and no inferred qualifications', () => {
  const result = { structuredContent: { cv: { experience: [{ title: 'Source role', status: 'pending' }], notes: 'Exact source text '.repeat(500) } } }, cached = { fetchedAt: '2026-11-14T00:00:00Z', result };
  const source = JSON.stringify(result), brief = buildCandidateBrief(cached, { maxChars: 1000 });
  assert.equal(brief.text, source.slice(0, 1000)); assert.equal(brief.source.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(brief.source.fetchedAt, cached.fetchedAt); assert.equal(brief.totalChars, source.length); assert.equal(brief.nextOffset, 1000); assert.equal(brief.complete, false); assert.equal(brief.readTool, 'get_cv');
  assert.equal(Object.hasOwn(brief, 'qualifications'), false); assert.equal(Object.hasOwn(brief, 'eligible'), false);
  assert.equal(buildCandidateBrief({ result: { content: [{ type: 'text', text: 'Exact short CV' }] } }).complete, true);
});

test('missing, failed and approval-pending CVs cannot produce a usable candidate brief', () => {
  for (const cached of [undefined, {}, { result: { content: [] } }, { result: { structuredContent: { status: 'pending_approval' } } }, { result: { isError: true } }]) {
    const brief = buildCandidateBrief(cached); assert.equal(brief.status, 'unavailable'); assert.equal(brief.readTool, 'get_cv'); assert.equal(brief.text, undefined);
  }
  assert.throws(() => buildCandidateBrief({}, { maxChars: -1 }), /excerpt/);
});

test('attempt context cannot include a different company, original source bulk or telemetry text', () => {
  const run = runFixture(100), id = run.activeCompanyId;
  const context = buildAttemptContext({ run, companyId: id, company: { id, name: 'Assigned', revision: 3, sourceFields: { bulky: 'private-source' }, notes: 'private-notes' }, cachedCv: null });
  assert.equal(context.company.revision, 3); assert.equal(context.company.sourceFields, undefined); assert.equal(context.company.notes, undefined);
  assert.equal(context.candidate.status, 'unavailable'); assert.match(context.nextStep, /get_company/);
  assert.throws(() => buildAttemptContext({ run, companyId: id, company: { id: 'other' } }), /assigned company/);
});
