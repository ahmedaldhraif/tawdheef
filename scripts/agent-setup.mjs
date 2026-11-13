/** Explicit, project-only MCP setup. Never edits home-directory client settings. */
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClientConfig, INTEGRATIONS_ROOT } from '../server/integrations.mjs';

async function assertLocalPath(root, path) {
  let current = root;
  for (const part of relative(root, path).split(/[\\/]/)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing a linked setup path: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function configureAgent(client, options = {}) {
  if (!['codex', 'claude-code', 'both'].includes(client)) throw new Error('Choose codex, claude-code or both. Example: npm run agent -- codex');
  const root = resolve(options.root || INTEGRATIONS_ROOT);
  const config = await createClientConfig({ ...options, root });
  const clients = client === 'both' ? ['codex', 'claude-code'] : [client];
  const plan = [];
  async function addSkill(source, target) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Skill files must not be links.');
      if (entry.isDirectory()) await addSkill(join(source, entry.name), join(target, entry.name));
      else plan.push({ path: join(target, entry.name), content: await readFile(join(source, entry.name), 'utf8') });
    }
  }
  for (const selected of clients) {
    plan.push({ path: join(root, selected === 'codex' ? '.codex/config.toml' : '.mcp.json'), content: selected === 'codex' ? config.codexToml : config.claudeJson });
    await addSkill(join(root, 'skills/tawdheef'), join(root, selected === 'codex' ? '.agents/skills/tawdheef' : '.claude/skills/tawdheef'));
  }
  // Check the complete plan before writing. Existing custom settings are never replaced.
  for (const item of plan) {
    await assertLocalPath(root, item.path);
    try {
      const existing = await readFile(item.path, 'utf8');
      if (existing !== item.content) throw new Error(`Keep your existing ${relative(root, item.path)}. Use Connections > AI assistants to merge the needed entries, or npm run setup -- --export-config agent-config${options.include?.includes('playwright') ? ' --include playwright' : ''}. No setup files were changed.`);
      item.exists = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!options.check) for (const item of plan.filter(item => !item.exists)) {
    await mkdir(dirname(item.path), { recursive: true });
    await writeFile(item.path, item.content, { flag: 'wx', mode: 0o600 });
  }
  return {
    clients, files: plan.map(item => ({ path: item.path, status: item.exists ? 'already configured' : options.check ? 'would create' : 'created' })),
    included: config.included,
    accountConnected: false,
    nextStep: 'Open this folder in your client, accept its project/server trust prompt, then start a new chat. Ask: Read AGENTS.md and call get_setup_status. Help me finish setup and verify my chosen assistant and CV. Do not send or submit anything. After setup is ready, try: Help me shortlist suitable companies in the UAE directory.'
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [client, ...flags] = process.argv.slice(2);
  if (!client || client === '--help') console.log('Connect this project: npm run agent -- codex | claude-code | both\nAdd --browser to include installed Playwright browser tools for this chat, --check for a preview, or --json for machine output. Install the browser first with npm run setup -- --browser. Creates project MCP settings and the Tawdheef skill; never replaces existing files or signs into accounts.');
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
