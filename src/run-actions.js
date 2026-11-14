import { COMPANY_TYPES } from './company-types.js';

export const DEFAULT_RUN_ACTIONS = Object.freeze({ applyMatchingJobs: true, createProfiles: false, sendCvEmails: false });
export const EMAIL_PURPOSES = ['application', 'cv_share'];
export const FORM_PURPOSE_EVENTS = Object.freeze({ application: 'applied', account: 'account_created', profile: 'profile_created', cv_upload: 'cv_uploaded', talent_pool: 'talent_pool_joined' });

export function normalizeRunActions(input, { requireSelection = false } = {}) {
  if (input === undefined) return { ...DEFAULT_RUN_ACTIONS };
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Choose the actions for this run.');
  const actions = { ...DEFAULT_RUN_ACTIONS };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(actions, key) || typeof value !== 'boolean') throw new Error('Use true or false for the supported run actions.');
    actions[key] = value;
  }
  if (requireSelection && !Object.values(actions).some(Boolean)) throw new Error('Choose at least one action for this run.');
  return actions;
}

/** Shared by provider writes and the launched operator guard. */
export function assertRunPurpose(run, purpose = 'application') {
  const actions = normalizeRunActions(run.actions);
  const allowed = purpose === 'application' ? actions.applyMatchingJobs
    : purpose === 'cv_share' ? actions.sendCvEmails
      : purpose === 'talent_pool' ? actions.createProfiles
        : ['account', 'profile', 'cv_upload'].includes(purpose) ? actions.createProfiles || actions.applyMatchingJobs : false;
  if (!allowed) throw new Error(`This run does not allow ${purpose === 'application' ? 'job applications' : purpose === 'cv_share' ? 'CV emails for future opportunities' : 'this profile or talent-pool action'}. Follow its saved choices.`);
  return purpose;
}

/** A readable brief built from the same saved choices used by CLI/MCP operations. */
export function buildRunBrief({ actions: input, directoryName = '', locationLabels = [], companyTypeLabels, companyTypes = [], instructions = '' } = {}) {
  const actions = normalizeRunActions(input);
  const typeLabels = companyTypeLabels || COMPANY_TYPES.filter(type => companyTypes.includes(type.id)).map(type => type.label);
  const lines = [
    `Use my connected CV${directoryName ? ` for the selected companies in ${directoryName}` : ''}.`,
    `Selected cities / directory locations: ${locationLabels.length ? locationLabels.join(', ') : `any recorded location${directoryName ? ` in ${directoryName}` : ''}`}.`,
    `Company types: ${typeLabels.length ? typeLabels.join(', ') : 'all types'}.`,
  ];
  if (locationLabels.length) lines.push('Use named cities as my work-location preferences and verify the actual job location. Nationwide, unknown and address labels describe directory records; they are not proof of a job location.');
  if (actions.applyMatchingJobs) lines.push('Apply only to current jobs that match my CV, experience, eligibility and chosen work locations. Create an account or complete a profile only when required for a suitable application.');
  else lines.push('Do not apply to advertised jobs. Build my presence for suitable future opportunities only.');
  const future = [];
  if (actions.createProfiles) future.push('create or complete my career profile, upload my CV and join an available talent pool');
  if (actions.sendCvEmails) future.push('email my CV or CV link to the company’s verified published careers address for suitable future opportunities');
  if (future.length) lines.push(`${actions.applyMatchingJobs ? 'If no suitable current job is found after checking the careers page' : 'For future opportunities'}, ${future.join(' and ')}.`);
  else if (actions.applyMatchingJobs) lines.push('If no suitable job is found, record that result and move to the next company. Do not send a general CV email or register solely for future opportunities.');
  if (!Object.values(actions).some(Boolean)) lines.push('Choose at least one action before starting.');
  lines.push('A blocked or incomplete search is not proof that there are no suitable jobs. Reuse existing accounts, inspect uncertain submissions and avoid duplicate sends. Record only confirmed progress, with evidence.');
  if (instructions.trim()) lines.push(`Additional preferences: ${instructions.trim()}`);
  return lines.join('\n\n');
}
