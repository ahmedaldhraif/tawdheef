/** Compact local monitoring metadata; contains no provider or timer dependencies. */
export function compactMonitoring(value) {
  const { companyIds = [], ...scope } = value.config.scope;
  return { ...value, config: { ...value.config, scope: { ...scope, selectedCompanyCount: companyIds.length, companySelection: companyIds.length ? 'selected' : 'saved_directories' } } };
}
