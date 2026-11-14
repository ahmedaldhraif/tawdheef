import test from 'node:test';
import assert from 'node:assert/strict';
import { planJobDiscovery, normalizeJobDiscovery, canonicalJobIdentity, meaningfulJobHash, changedJobFields } from '../server/ats-discovery.mjs';

const read = plan => ({ url: plan.requests[0]?.url || plan.sourceUrl, observedAt: '2026-11-14T08:00:00Z', evidence: 'Synthetic client read of this exact public source; no external call occurred.' });
const greenhouse = (id = 42, changes = {}) => ({ id, internal_job_id: 100 + id, title: 'Engineer', location: { name: 'Dubai' }, absolute_url: `https://job-boards.greenhouse.io/fixture/jobs/${id}`, content: '&lt;p&gt;Build useful software.&lt;/p&gt;', ...changes });
const lever = (changes = {}) => ({ id: 'job-42', text: 'Engineer', hostedUrl: 'https://jobs.lever.co/fixture/job-42', applyUrl: 'https://jobs.lever.co/fixture/job-42/apply', descriptionPlain: 'Build useful software.', categories: { location: 'Dubai', commitment: 'Full-time' }, lists: [{ text: 'Requirements', content: '<ul><li>Relevant supported experience.</li></ul>' }], ...changes });
const observation = (changes = {}) => ({ title: 'Engineer', url: 'https://example.org/jobs/42', locations: ['Dubai'], description: 'Build useful software.', contentComplete: true, status: 'open', evidence: 'Synthetic observed posting and complete role requirements.', ...changes });
const normalize = (sourceUrl, payload, options = {}) => { const plan = planJobDiscovery(sourceUrl); return normalizeJobDiscovery(plan, { payload, sourceRead: read(plan), complete: true, ...options }); };

test('public board planners derive fixed read requests without auth or network calls', () => {
  const gh = planJobDiscovery('https://job-boards.greenhouse.io/fixture?utm_source=example#jobs');
  assert.equal(gh.provider, 'greenhouse'); assert.equal(gh.boardKey, 'boards-api.greenhouse.io/fixture'); assert.equal(gh.sourceUrl, 'https://job-boards.greenhouse.io/fixture');
  assert.deepEqual(gh.requests, [{ method: 'GET', url: 'https://boards-api.greenhouse.io/v1/boards/fixture/jobs?content=true' }]);
  assert.equal(planJobDiscovery('https://boards.eu.greenhouse.io/fixture').requests[0].url, 'https://boards-api.eu.greenhouse.io/v1/boards/fixture/jobs?content=true');
  assert.equal(planJobDiscovery('https://jobs.eu.lever.co/fixture').requests[0].url, 'https://api.eu.lever.co/v0/postings/fixture?mode=json&limit=100');
  assert.equal(planJobDiscovery('https://jobs.ashbyhq.com/fixture').requests[0].url, 'https://api.ashbyhq.com/posting-api/job-board/fixture');
  const wd = planJobDiscovery('https://fixture.wd3.myworkdayjobs.com/en-US/Careers');
  assert.equal(wd.boardKey, 'fixture.wd3.myworkdayjobs.com/Careers'); assert.equal(wd.requests[0].method, 'POST');
  assert.equal(wd.requests[0].url, 'https://fixture.wd3.myworkdayjobs.com/wday/cxs/fixture/Careers/jobs'); assert.deepEqual(wd.requests[0].body, { appliedFacets: {}, limit: 20, offset: 0, searchText: '' });
  for (const url of ['https://example.org/careers', 'https://fixture.myworkdayjobs.com/Careers', 'https://boards-api.greenhouse.io/unsupported', 'https://fixture.wd3.myworkdayjobs.com/wday/cxs/another/Careers/jobs', 'https://fixture.wd3.myworkdayjobs.com/en-US/Careers/future-layout', 'https://jobs.lever.co.attacker.example/fixture']) assert.deepEqual(planJobDiscovery(url).requests, [], url);
  for (const url of ['file:///private/file', 'http://localhost/jobs', 'http://127.0.0.1/jobs', 'https://user:secret@example.org/jobs', 'https://example.org/?access_token=private']) assert.throws(() => planJobDiscovery(url));
});

test('Greenhouse list and detail preserve posting identity and bounded plain evidence', () => {
  const result = normalize('https://job-boards.greenhouse.io/fixture', { jobs: [greenhouse()], meta: { total: 1 } });
  assert.equal(result.complete, true); assert.equal(result.jobs[0].postingId, '42'); assert.equal(result.jobs[0].description, 'Build useful software.'); assert.equal(result.jobs[0].status, 'open');
  assert.equal(result.jobs[0].detailUrl, 'https://boards-api.greenhouse.io/v1/boards/fixture/jobs/42?content=true');
  const detail = normalize(result.jobs[0].detailUrl, greenhouse());
  assert.equal(canonicalJobIdentity(detail.jobs[0]), canonicalJobIdentity(result.jobs[0]));
  assert.throws(() => normalize(result.jobs[0].detailUrl, greenhouse(99)), /different posting/);
  const custom = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { absolute_url: 'https://example.org/careers?gh_jid=42&utm_campaign=example#apply' })] });
  assert.equal(custom.jobs[0].url, 'https://example.org/careers?gh_jid=42'); assert.equal(custom.jobs[0].contentComplete, true);
  const prospect = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { internal_job_id: null })] });
  assert.equal(prospect.jobs[0].status, 'unknown'); assert.equal(prospect.jobs[0].contentComplete, false); assert.equal(prospect.complete, false);
});

test('Lever list and single postings retain regional board namespaces and all supplied sections', () => {
  const result = normalize('https://jobs.lever.co/fixture', [lever()]);
  assert.equal(result.complete, true); assert.match(result.jobs[0].description, /Relevant supported experience/); assert.equal(result.jobs[0].employmentType, 'Full-time');
  const detail = normalize(result.jobs[0].detailUrl, lever());
  assert.equal(canonicalJobIdentity(detail.jobs[0]), canonicalJobIdentity(result.jobs[0]));
  assert.throws(() => normalize('https://jobs.eu.lever.co/fixture', [lever()]), /different ATS provider or tenant/);
});

test('Ashby full payload exposes multiple locations; unlisted never means closed', () => {
  const source = 'https://jobs.ashbyhq.com/fixture';
  const row = { title: 'Engineer', location: 'Dubai', secondaryLocations: [{ location: 'Abu Dhabi' }], workplaceType: 'Hybrid', isRemote: true, descriptionHtml: '<p>Actual role description.</p>', employmentType: 'FullTime', jobUrl: `${source}/job-42`, applyUrl: `${source}/job-42/application`, isListed: true };
  const result = normalize(source, { jobs: [row] });
  assert.equal(result.complete, true); assert.deepEqual(result.jobs[0].locations, ['Dubai', 'Abu Dhabi']); assert.equal(result.jobs[0].workplaceType, 'Hybrid');
  const plan = planJobDiscovery(result.jobs[0].detailUrl), detail = normalizeJobDiscovery(plan, { observations: [{ ...result.jobs[0], evidence: 'Synthetic browser confirms the complete same posting.' }], sourceRead: read(plan), complete: true });
  assert.equal(canonicalJobIdentity(detail.jobs[0]), canonicalJobIdentity(result.jobs[0]));
  const unlisted = normalize(source, { jobs: [{ ...row, isListed: false }] }); assert.equal(unlisted.jobs[0].status, 'unknown'); assert.notEqual(unlisted.jobs[0].status, 'closed');
});

test('Workday fixtures retain route identity across list and detail without inventing full list content', () => {
  const source = 'https://fixture.wd3.myworkdayjobs.com/en-US/Careers', externalPath = '/job/Dubai/Engineer_R42';
  const listing = normalize(source, { total: 30, jobPostings: [{ title: 'Engineer', locationsText: 'Dubai', externalPath }] });
  assert.equal(listing.complete, false); assert.equal(listing.jobs[0].contentComplete, false); assert.equal(listing.jobs[0].status, 'unknown'); assert.equal(listing.nextRequest.body.offset, 1);
  assert.equal(listing.jobs[0].postingId, externalPath);
  const detail = normalize(listing.jobs[0].detailUrl, { jobPostingInfo: { title: 'Engineer', jobReqId: 'R42', location: 'Dubai', jobDescription: '<p>Actual complete requirements.</p>', status: 'open' } });
  assert.equal(detail.complete, true); assert.equal(detail.jobs[0].contentComplete, true); assert.equal(canonicalJobIdentity(detail.jobs[0]), canonicalJobIdentity(listing.jobs[0]));
  const unsupported = normalize(listing.jobs[0].detailUrl, { futureUnknownShape: [] }); assert.equal(unsupported.complete, false); assert.equal(unsupported.jobs.length, 0); assert.match(unsupported.warnings.at(-1), /native client browser/);
  const arabic = normalize(source, { total: 1, jobPostings: [{ title: 'مهندس', externalPath: '/job/دبي/مهندس_R43' }] });
  assert.equal(arabic.jobs.length, 1); assert.match(arabic.jobs[0].url, /%D8/); assert.equal(arabic.jobs[0].contentComplete, false);
  const traversal = normalize(source, { total: 1, jobPostings: [{ title: 'Wrong route', externalPath: '/job/%2e%2e/another' }] }); assert.equal(traversal.jobs.length, 0); assert.equal(traversal.complete, false);
});

test('native browser observations require actual URLs/evidence and cannot override provider or tenant', () => {
  const plan = planJobDiscovery('https://example.org/careers');
  const result = normalizeJobDiscovery(plan, { sourceRead: read(plan), complete: true, observations: [{ externalId: 'caller-label', title: 'Engineer', url: 'https://example.org/jobs/42?jobId=42&utm_source=test#job', data: { description: 'Complete observed requirements.', locations: ['Dubai'], contentComplete: true, state: 'open' }, evidence: 'Synthetic posting evidence.' }] });
  assert.equal(result.complete, true); assert.equal(result.jobs[0].provider, 'generic'); assert.equal(result.jobs[0].postingId, undefined); assert.equal(result.jobs[0].url, 'https://example.org/jobs/42?jobId=42');
  for (const change of [{ provider: 'lever' }, { boardKey: 'another-board' }]) assert.throws(() => normalizeJobDiscovery(plan, { sourceRead: read(plan), complete: true, observations: [observation(change)] }), /override/);
  const missing = normalizeJobDiscovery(plan, { sourceRead: read(plan), complete: true, observations: [observation({ evidence: '' })] }); assert.equal(missing.jobs.length, 0); assert.equal(missing.complete, false);
});

test('a generic careers link requires explicit verified board binding before recognized ATS ingestion', () => {
  const plan = planJobDiscovery('https://example.org/careers'), url = 'https://jobs.ashbyhq.com/fixture/job-42';
  assert.throws(() => normalizeJobDiscovery(plan, { sourceRead: read(plan), complete: true, observations: [observation({ url, description: '', contentComplete: false, evidence: 'Synthetic company careers page links this public Ashby posting.' })] }), error => {
    assert.equal(error.code, 'ATS_SOURCE_MISMATCH'); assert.match(error.nextStep, /verify.*board belongs to this company/); assert.match(error.nextStep, /update_company and patch.expectedRevision/); assert.match(error.nextStep, /preserving original evidence and sourceRole/); assert.match(error.nextStep, /fresh discovery lease/); assert.match(error.nextStep, /Scheduled monitoring must report Needs you/); return true;
  });
  // After the person/normal client verifies and saves the board, a fresh plan
  // binds both the feed and its actual detail to that exact tenant.
  const full = normalize('https://jobs.ashbyhq.com/fixture', { jobs: [{ jobUrl: url, title: 'Engineer', location: 'Dubai', descriptionPlain: 'Build useful software.', isListed: true }] }).jobs[0];
  const detailPlan = planJobDiscovery(url), detail = normalizeJobDiscovery(detailPlan, { sourceRead: read(detailPlan), complete: true, observations: [{ ...full, evidence: 'Synthetic actual browser read of the complete linked posting.' }] });
  assert.equal(canonicalJobIdentity(full), canonicalJobIdentity(detail.jobs[0]));
  const differentBoard = { ...full, boardKey: 'jobs.ashbyhq.com/another', url: 'https://jobs.ashbyhq.com/another/job-42' };
  assert.notEqual(canonicalJobIdentity(full), canonicalJobIdentity(differentBoard));
  assert.notEqual(canonicalJobIdentity({ ...full, provider: 'generic' }), canonicalJobIdentity(full), 'An old generic record never silently acquires a different ATS identity.');
  assert.equal(normalizeJobDiscovery(plan, { sourceRead: read(plan), complete: true, payload: { jobs: [{ jobUrl: url, title: 'Engineer' }] } }).jobs.length, 0, 'A generic source never silently parses arbitrary vendor JSON.');
});

test('payload/read/plan namespace contradictions fail closed rather than merging unrelated jobs', () => {
  const plan = planJobDiscovery('https://boards.greenhouse.io/fixture');
  assert.throws(() => normalizeJobDiscovery({ ...plan, provider: 'lever' }, { payload: { jobs: [] }, sourceRead: read(plan), complete: true }), /plan does not match/);
  assert.throws(() => normalizeJobDiscovery(plan, { payload: { jobs: [] }, sourceRead: { ...read(plan), url: 'https://boards-api.greenhouse.io/v1/boards/another/jobs?content=true' }, complete: true }), /planned source/);
  assert.throws(() => normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { absolute_url: 'https://boards.greenhouse.io/another/jobs/42' })] }), /different ATS provider or tenant/);
  assert.throws(() => normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { absolute_url: 'https://boards.greenhouse.io/fixture/jobs/99' })] }), /posting ID does not match/);
});

test('oversized payloads/batches and truncated fields never claim a complete source or full description', () => {
  assert.throws(() => normalize('https://boards.greenhouse.io/fixture', ' '.repeat(1024 * 1024 + 1)), /within 1 MiB/);
  const large = normalize('https://boards.greenhouse.io/fixture', { jobs: Array.from({ length: 101 }, (_, index) => greenhouse(index + 1)) });
  assert.equal(large.jobs.length, 100); assert.equal(large.complete, false); assert.match(large.warnings.at(-1), /client-normalized batches/);
  const truncated = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { content: 'x'.repeat(20001) })] });
  assert.equal(truncated.jobs[0].description.length, 20000); assert.equal(truncated.jobs[0].contentComplete, false); assert.equal(truncated.needsDetail, true);
  const incomplete = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { content: undefined })] }); assert.equal(incomplete.jobs[0].contentComplete, false); assert.equal(incomplete.complete, false);
  const invalidDate = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse(42, { application_deadline: '2026-02-30T00:00:00Z' })] }); assert.equal(invalidDate.jobs[0].validThrough, undefined); assert.equal(invalidDate.jobs[0].contentComplete, false);
});

test('empty, unknown, and 304-shaped data never manufacture closed jobs', () => {
  assert.deepEqual(normalize('https://boards.greenhouse.io/fixture', { jobs: [] }).jobs, []);
  for (const payload of [{ unexpected: [] }, { status: 304 }]) { const result = normalize('https://boards.greenhouse.io/fixture', payload); assert.equal(result.jobs.length, 0); assert.equal(result.complete, false); }
  const result = normalize('https://fixture.wd3.myworkdayjobs.com/Careers', { total: 5, jobPostings: [] }); assert.equal(result.complete, false); assert.equal(result.nextRequest, undefined);
});

test('canonical IDs separate tenant/postings and preserve meaningful query parameters', () => {
  const job = normalize('https://boards.greenhouse.io/fixture', { jobs: [greenhouse()] }).jobs[0];
  assert.notEqual(canonicalJobIdentity(job), canonicalJobIdentity({ ...job, boardKey: 'boards-api.greenhouse.io/another' }));
  assert.notEqual(canonicalJobIdentity(job), canonicalJobIdentity({ ...job, postingId: '43' }));
  const generic = observation({ provider: 'generic', boardKey: 'example.org', url: 'https://example.org/jobs?jobId=42&utm_source=x#position' });
  assert.equal(canonicalJobIdentity(generic), canonicalJobIdentity({ ...generic, url: 'https://example.org/jobs?jobId=42' }));
  assert.notEqual(canonicalJobIdentity(generic), canonicalJobIdentity({ ...generic, url: 'https://example.org/jobs?jobId=43' }));
});

test('meaningful hashes ignore timestamps/evidence/ordering and keep liveness as a separate lifecycle', () => {
  const before = observation({ requirements: ['Relevant experience', 'Supported eligibility'], locations: ['Dubai', 'Abu Dhabi'] });
  const same = { ...before, description: ' Build   useful software.\n', requirements: [...before.requirements].reverse(), locations: [...before.locations].reverse(), observedAt: 'later', evidence: 'Another source receipt', parseVersion: 99 };
  assert.equal(meaningfulJobHash(before), meaningfulJobHash(same)); assert.deepEqual(changedJobFields(before, same), []);
  for (const [field, value] of [['description', 'Different qualifications.'], ['requirements', ['Different experience']], ['locations', ['Sharjah']]]) { const next = { ...before, [field]: value }; assert.notEqual(meaningfulJobHash(before), meaningfulJobHash(next)); assert.ok(changedJobFields(before, next).includes(field)); }
  const closed = { ...before, status: 'closed' }; assert.equal(meaningfulJobHash(before), meaningfulJobHash(closed)); assert.deepEqual(changedJobFields(before, closed), ['status']);
});
