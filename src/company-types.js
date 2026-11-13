// A display/filter grouping of recorded source classifications, never an ownership inference.
export const COMPANY_TYPES = [
  { id: 'federal_government', label: 'Federal government' },
  { id: 'local_government', label: 'Local government' },
  { id: 'government_linked', label: 'Government-owned / semi-government' },
  { id: 'private', label: 'Private companies' },
  { id: 'other', label: 'Other organisations' },
  { id: 'unknown', label: 'Unknown type' },
];

const normalize = value => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/[–—_-]/g, '-').replace(/\s+/g, ' ')
  : '';

/** Only explicit type, government level and ownership fields may classify a source. */
export function classifyCompanyType(company = {}) {
  const fields = company.sourceFields || {};
  const type = normalize(company.type || fields['Organisation type'] || fields['Organization type']);
  const level = normalize(fields['Government level']);
  const ownership = normalize(fields['Ownership / structure']);
  // Qualified or unresolved statements are not a confirmed legal classification.
  const unresolved = /unconfirmed|not (?:established|checked)|unknown|uncertain|needs research/.test(type);
  const governmentLinked = /^(?:government[- ](?:owned|controlled|linked|shareholding)|semi[- ]government)(?:\b|$)/.test(type)
    || ['government-owned', 'government-controlled', 'government shareholding'].includes(ownership)
    || type === 'public-private institutional partnership';
  const privateType = /^private (?:company|employer|hospital|university|education institution|school(?: campus| \/ education establishment)?|institution)$/.test(type)
    || ['private', 'privately owned', 'private company', 'private sector'].includes(type);
  const privateOwned = ownership === 'privately owned' || ownership === 'private ownership';
  const directGovernment = ownership === 'government body'
    || /^(?:federal|emirate|local|regional|municipal) government(?:\b|$)/.test(type);
  // Conflicting source claims remain unknown instead of silently choosing one.
  if ((governmentLinked || directGovernment) && (privateType || privateOwned)) return 'unknown';
  if (governmentLinked && !unresolved) return 'government_linked';
  if ((privateType && !unresolved) || privateOwned) return 'private';
  if (unresolved) return 'unknown';
  if (/^federal government(?:\b|$)/.test(type)) return 'federal_government';
  if (/^(?:emirate|local|regional|municipal) government(?:\b|$)/.test(type)) return 'local_government';
  const governmentBody = ownership === 'government body'
    || /^(?:government (?:entity|body|authority|ministry|programme|school|healthcare|cultural)|public (?:sector|institution|education institution|university|cultural institution))/.test(type);
  if (governmentBody && /^(?:federal)(?:\b|$)/.test(level)) return 'federal_government';
  if (governmentBody && /^(?:emirate|local|regional|municipal)(?:\b|$)/.test(level)) return 'local_government';
  if (governmentBody || /^(?:non-?profit|philanthropic|public-interest)(?:\b|$)/.test(type)
    || ['nonprofit structure', 'non-profit structure'].includes(ownership)
    || ['chamber', 'foundation', 'public or nonprofit institution', 'sovereign investment fund'].includes(type)) return 'other';
  // Listed, commercial, regulated, directory membership and an employer role do not prove ownership.
  return 'unknown';
}

export function companyMatchesTypes(company, companyTypes = []) {
  return companyTypes.length === 0 || companyTypes.includes(classifyCompanyType(company));
}
