/** Explicit, project-only MCP setup. Never edits home-directory client settings. */
import { readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClientConfig, INTEGRATIONS_ROOT } from '../server/integrations.mjs';
import { readSetupManifest, planAgentSetup, applyAgentSetup } from './agent-config-merge.mjs';

export async function configureAgent(client, options = {}) {
  if (!['codex', 'claude-code', 'both'].includes(client)) throw new Error('Choose codex, claude-code or both. Example: npm run agent -- codex');
  const root = resolve(options.root || INTEGRATIONS_ROOT);
  const clients = client === 'both' ? ['codex', 'claude-code'] : [client];
  const manifest = await readSetupManifest(root);
  const include = [...new Set([...(options.include || []), ...clients.flatMap(selected => manifest.clients[selected]?.included || []).filter(name => name !== 'apply-tracker')])];
  const config = await createClientConfig({ ...options, root, include });
  const skills = [];
  async function addSkill(source, target) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Skill files must not be links.');
      if (entry.isDirectory()) await addSkill(join(source, entry.name), join(target, entry.name));
      else skills.push({ path: join(target, entry.name), content: await readFile(join(source, entry.name), 'utf8') });
    }
  }
  for (const selected of clients) {
    await addSkill(join(root, 'skills/tawdheef'), join(root, selected === 'codex' ? '.agents/skills/tawdheef' : '.claude/skills/tawdheef'));
  }
  const plan = await planAgentSetup({ root, clients, config, skills, manifest });
  const result = options.check ? {} : await applyAgentSetup({ root, plan, expectedManifest: manifest });
  return {
    clients, files: plan.files.map(item => ({ path: item.path, status: item.previous === item.content ? 'already configured' : item.previous === null ? options.check ? 'would create' : 'created' : options.check ? 'would update' : 'updated' })),
    ...(result.backup ? { backup: result.backup } : {}),
    included: config.included,
    accountConnected: false,
    nextStep: 'Open this folder in your client, accept its project/server trust prompt, then start a new chat. Ask: Read AGENTS.md and call get_setup_status. Help me finish setup and verify my chosen assistant and CV. Do not send or submit anything. After setup is ready, try: Help me shortlist suitable companies in the UAE directory.'
  };
}

// argv and module URLs can retain different path aliases (macOS /var,
// linked project paths or Windows short names). Normalize both identities.
const invokedScript = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
const ownScript = await realpath(fileURLToPath(import.meta.url));
if (invokedScript === ownScript) {
  const [client, ...flags] = process.argv.slice(2);
  if (!client || client === '--help') console.log('Connect this project: npm run agent -- codex | claude-code | both\nAdd --browser to include installed Playwright browser tools for this chat, --check for a preview, or --json for machine output. Install the browser first with npm run setup -- --browser. Creates or updates owned project MCP entries and the Tawdheef skill, preserves unrelated settings, and backs up updates. Edited or unowned entries require review. Never signs into accounts.');
  else if (flags.some(flag => !['--browser', '--check', '--json'].includes(flag))) { console.error('Only --browser, --check and --json are supported.'); process.exitCode = 1; }
  else configureAgent(client, { check: flags.includes('--check'), ...(flags.includes('--browser') ? { include: ['playwright'] } : {}) }).then(result => {
    if (flags.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(flags.includes('--check') ? 'Setup preview. No files changed.' : `Tawdheef project setup is ready for ${result.clients.join(' and ')}.`);
      for (const file of result.files.filter(file => /config\.toml$|\.mcp\.json$/.test(file.path))) console.log(`${file.status}: ${file.path}`);
      console.log(result.nextStep);
    }
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
