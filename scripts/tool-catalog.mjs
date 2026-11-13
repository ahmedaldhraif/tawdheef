/** Derive the published contract from real tools without opening a database. */
import { buildTools, AGENT_INSTRUCTIONS } from '../server/mcp.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = buildTools(null).map(({ handler, ...tool }) => tool);
const content = JSON.stringify({ schemaVersion: 1, instructions: AGENT_INSTRUCTIONS, tools }, null, 2) + '\n';
const path = join(root, 'docs/tools.json');
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8').catch(() => '') !== content) { console.error('Tool catalog is stale. Run npm run tools:catalog.'); process.exitCode = 1; }
  else console.log(`${tools.length} published tool schemas match the runtime.`);
} else { await writeFile(path, content); console.log(`Published ${tools.length} tool schemas in docs/tools.json. No database was opened.`); }
