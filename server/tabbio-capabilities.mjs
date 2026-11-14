// Inspect only the already discovered catalog. This helper never connects,
// executes a provider tool or infers capabilities from descriptions.
export function tabbioSetupCapability(tools = []) {
  const matches = tools.filter(tool => (
    tool && typeof tool.name === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(tool.name) &&
    (tool.name === 'careerSetupStatus' || tool.name === 'career.setupStatus' || tool._meta?.tabbioToolId === 'career.setupStatus') &&
    tool.annotations?.readOnlyHint === true &&
    tool.inputSchema?.type === 'object' &&
    (tool.inputSchema.required === undefined || (Array.isArray(tool.inputSchema.required) && tool.inputSchema.required.length === 0)) &&
    (tool.inputSchema.minProperties === undefined || tool.inputSchema.minProperties === 0)
  ));
  return {
    available: matches.length === 1,
    tool: matches.length === 1 ? matches[0].name : null,
    state: matches.length === 1 ? 'available' : matches.length > 1 ? 'ambiguous' : 'unsupported',
  };
}
