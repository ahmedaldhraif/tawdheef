import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirectInvocation } from './is-direct.mjs';
import { createRequire } from 'node:module';
import { INTEGRATIONS_ROOT, INTEGRATIONS, integrationPresets, exportClientConfig } from '../server/integrations.mjs';
import { doctor } from './doctor.mjs';
import { findNpmCli } from './npm-cli.mjs';
import { runtimeEnvironment } from './runtime-env.mjs';
import { coreInstalled } from './runtime-check.mjs';
import { defaultDataDir } from './app-paths.mjs';
import { PROVIDER_DEPENDENCIES, providerAddonDirectory, providerDependenciesStatus, ensureProviderAddonDirectory } from '../server/provider-dependencies.mjs';

const usage = `Tawdheef setup\n\n  npm run setup                         Install missing source dependencies and build the local tracker\n  npm run setup -- --check              Read local readiness without sign-in\n  npm run agent -- codex --tabbio       Explicitly add direct Tabbio MCP to the actual native client\n  npm run agent -- claude-code          Configure the actual Claude Code project\n  npm run setup -- --export-config DIR [--include tabbio]\n\nExternal Tabbio, email, calendar, browser and password-manager connections belong to the actual client. Native mode installs no external bridges by default and configuration never proves account access.\n\nLegacy compatibility only (explicit --local-adapters):\n  npm run setup -- --local-adapters     Install pinned local mail/calendar SDKs in private add-ons\n  npm run setup -- --local-adapters --browser\n  npm run setup -- --local-adapters --integration google-cli|outlook-mcp|tabbio\n  npm run setup -- --local-adapters --all\n  npm run setup -- --local-adapters --login google-cli|outlook-mcp|tabbio\n\nPrebuilt apps never rebuild/install developer tools. Client settings are changed only by the separate explicitly requested agent command, project-only.\n`;

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (['--local-adapters', '--all', '--browser', '--tabbio', '--check', '--no-build', '--quiet', '--help'].includes(value)) options[value.slice(2)] = true;
    else if (['--export-config', '--include', '--login', '--integration'].includes(value)) {
      const argument = argv[++index];
      if (!argument || argument.startsWith('--')) throw new Error(`${value} needs a value.`);
      options[value.slice(2)] = argument;
    } else throw new Error(`Unknown setup option: ${value}. Use --help.`);
  }
  if (options.check && Object.keys(options).some(key => key !== 'check')) throw new Error('--check is read-only. Run it separately from installation, login and export options.');
  if (options.login && !['google-cli', 'tabbio', 'outlook-mcp'].includes(options.login)) throw new Error('Choose google-cli, tabbio or outlook-mcp for --login.');
  if (options.integration && !INTEGRATIONS.some(item => item.id === options.integration)) throw new Error('Choose playwright, google-cli, outlook-mcp or tabbio for --integration.');
  return options;
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

export function selectedIntegrations(options) {
  return [...new Set([
    ...(options.all ? INTEGRATIONS.map(item => item.id) : []),
    ...(options.browser ? ['playwright'] : []),
    ...(options.tabbio ? ['tabbio'] : []),
    ...(options.login ? [options.login] : []),
    ...(options.integration ? [options.integration] : []),
  ])];
}

export function localAdapterInstallPlan(dataDir) {
  const directory = providerAddonDirectory(dataDir);
  return { directory, packages: Object.entries(PROVIDER_DEPENDENCIES).map(([name, version]) => `${name}@${version}`) };
}

function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: INTEGRATIONS_ROOT, shell: false, windowsHide: true, stdio: 'inherit', ...options, env: runtimeEnvironment(options.env || process.env) });
    child.once('error', () => reject(new Error('A setup command could not start. Run this command through npm run setup.')));
    child.once('close', code => code === 0 ? accept() : reject(new Error(`Setup command exited with ${code ?? 'an error'}. Review the output above and run npm run doctor.`)));
  });
}

async function npmCommand(args) {
  return run(process.execPath, [await findNpmCli(INTEGRATIONS_ROOT), ...args]);
}

async function installBrowser(dataDir) {
  const browser = (await integrationPresets({ dataDir })).find(item => item.id === 'playwright');
  if (!browser.ready) throw new Error('Playwright MCP is missing. Run npm run setup -- --local-adapters --browser.');
  const mcpEntry = browser.entry;
  const require = createRequire(mcpEntry);
  const playwrightManifest = require.resolve('playwright/package.json');
  await run(process.execPath, [join(dirname(playwrightManifest), 'cli.js'), 'install', 'chromium']);
}

export async function setup(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.help) { process.stdout.write(usage); return; }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 26 LTS before running Tawdheef.');
  if (options.check) return doctor({ probe: false });
  const dataDir = defaultDataDir(INTEGRATIONS_ROOT);
  const prebuilt = await exists(join(INTEGRATIONS_ROOT, 'tawdheef-app.json'));
  const installed = await coreInstalled(INTEGRATIONS_ROOT, prebuilt);
  if (!installed && prebuilt) throw new Error('This app package is incomplete. Download a fresh copy; your private data was not changed.');
  // Bundler platform bindings are optional npm packages but required to build.
  // App bridges live only in the explicitly selected private integration prefix.
  if (!installed) await npmCommand(['ci', '--no-fund', '--no-audit']);
  if (!options['local-adapters'] && (options.all || options.browser || options.tabbio || options.integration || options.login)) throw new Error('External connections belong in your actual Codex/Claude Code client. Use npm run agent -- codex --tabbio for explicitly selected direct Tabbio MCP. Legacy app-owned tools require --local-adapters.');
  if (options['local-adapters'] && !(await providerDependenciesStatus({ dataDir })).ready) {
    const plan = localAdapterInstallPlan(dataDir);
    const prefix = await ensureProviderAddonDirectory({ dataDir, root: INTEGRATIONS_ROOT });
    await npmCommand(['install', '--prefix', prefix, '--save-exact', '--omit=dev', '--no-fund', '--no-audit', ...plan.packages]);
  }
  const selected = selectedIntegrations(options);
  for (const id of selected) {
    const current = (await integrationPresets({ dataDir })).find(item => item.id === id);
    if (current.supported === false) {
      if (options.all) { process.stdout.write(`${current.name} is unavailable on this platform; the other connections remain available.\n`); continue; }
      throw new Error(`${current.name} does not support ${process.platform}/${process.arch}. Choose a native provider in Connections.`);
    }
    if (!current.ready) {
      const prefix = join(dataDir, 'integrations');
      await mkdir(prefix, { recursive: true, mode: 0o700 });
      const item = INTEGRATIONS.find(item => item.id === id);
      process.stdout.write(`Installing ${item.name} (${item.license}) in your private integrations folder.\n`);
      await npmCommand(['install', '--prefix', prefix, '--save-exact', '--omit=dev', '--no-fund', '--no-audit', `${item.package}@${item.version}`]);
    }
  }
  if (options.browser || options.all) await installBrowser(dataDir);
  if (!options['no-build'] && !prebuilt) await run(process.execPath, [join(INTEGRATIONS_ROOT, 'scripts', 'build.mjs')]);
  if (options.login) {
    const item = (await integrationPresets({ dataDir })).find(preset => preset.id === options.login);
    if (!item.ready || !item.loginArgs?.length) throw new Error(`Install ${item.name} before signing in. ${item.nextStep}`);
    await mkdir(join(dataDir, options.login === 'google-cli' ? 'google-cli' : 'outlook-mcp'), { recursive: true, mode: 0o700 });
    await run(item.command, item.loginArgs, { env: { ...process.env, ...item.env } });
  }
  let exported;
  if (options['export-config']) exported = await exportClientConfig(options['export-config'], { dataDir, mode: options['local-adapters'] ? 'local-adapters' : 'native', include: options.include ? options.include.split(',').filter(Boolean) : [] });
  else if (options.include) throw new Error('--include is used with --export-config DIR.');
  return { ...await doctor({ probe: options['local-adapters'] === true }), mode: options['local-adapters'] ? 'local-adapters' : 'native', ...(exported ? { exported } : {}), nextStep: options['local-adapters'] ? 'Optional local adapters are available. Account sign-in still requires your explicit selection.' : 'Open your selected Codex/Claude Code client. Let it inspect and set up its own Tabbio, email, calendar, browser and password-manager tools. Tawdheef stores local guidance and recorded results; configuration alone does not verify accounts.' };
}

if (isDirectInvocation(import.meta.url)) {
  setup().then(data => { if (data && !process.argv.includes('--quiet')) process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`); }).catch(error => { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; });
}
