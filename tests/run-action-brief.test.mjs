import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunBrief } from '../src/run-actions.js';

test('career profiles are independent when matching applications are also selected', () => {
  const brief = buildRunBrief({ actions: { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false } });
  assert.match(brief, /Apply only to current jobs that match/);
  assert.match(brief, /Independently of whether a matching job exists, create or complete my career profile/);
  assert.match(brief, /Reuse completed profiles and uploads/);
  assert.doesNotMatch(brief, /If no suitable current job is found/);
});

test('only general CV emails keep the no-matching-job condition in a combined run', () => {
  const brief = buildRunBrief({ actions: { applyMatchingJobs: true, createProfiles: true, sendCvEmails: true } });
  assert.match(brief, /Independently of whether a matching job exists/);
  assert.match(brief, /If no suitable current job is found after checking the careers page, email my CV/);
});

test('profile-only runs prohibit applications without turning profile work into a fallback', () => {
  const brief = buildRunBrief({ actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  assert.match(brief, /Do not apply to advertised jobs/);
  assert.match(brief, /Independently of whether a matching job exists/);
  assert.doesNotMatch(brief, /If no suitable/);
});
