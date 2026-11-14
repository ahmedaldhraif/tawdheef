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

const usage = `Tawdheef setup\n\n  npm run setup                         Install missing source dependencies and build the tracker\n  npm run setup -- --all                Install all supported optional integrations and Chromium\n  npm run setup -- --browser            Install only Playwright MCP and Chromium\n  npm run setup -- --tabbio             Download Tabbio CLI into private local tools\n  npm run setup -- --integration ID     Install only google-cli, outlook-mcp, playwright or tabbio\n  npm run setup -- --login google-cli   Sign in to the isolated Google CLI mailbox\n  npm run setup -- --login tabbio       Sign in to the external Tabbio CLI\n  npm run setup -- --login outlook-mcp  Sign in to the optional Microsoft mail bridge\n  npm run setup -- --export-config DIR [--include playwright,tabbio,outlook-mcp]\n  npm run setup -- --check              Check readiness without installing or signing in\n\nPrebuilt app packages never rebuild or install developer tools. No sign-in runs unless --login is supplied. Client settings are never changed.\n`;

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (['--all', '--browser', '--tabbio', '--check', '--no-build', '--quiet', '--help'].includes(value)) options[value.slice(2)] = true;
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
  if (!browser.ready) throw new Error('Playwright MCP is missing. Run npm run setup -- --browser.');
  const mcpEntry = browser.entry;
  const require = createRequire(mcpEntry);
  const playwrightManifest = require.resolve('playwright/package.json');
  await run(process.execPath, [join(dirname(playwrightManifest), 'cli.js'), 'install', 'chromium']);
}

export async function setup(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.help) { process.stdout.write(usage); return; }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 26 LTS before running Tawdheef.');
  if (options.check) return doctor({ probe: true });
  const dataDir = defaultDataDir(INTEGRATIONS_ROOT);
  const prebuilt = await exists(join(INTEGRATIONS_ROOT, 'tawdheef-app.json'));
  const installed = await coreInstalled(INTEGRATIONS_ROOT, prebuilt);
  if (!installed && prebuilt) throw new Error('This app package is incomplete. Download a fresh copy; your private data was not changed.');
  // Bundler platform bindings are optional npm packages but required to build.
  // App bridges live only in the explicitly selected private integration prefix.
  if (!installed) await npmCommand(['ci', '--no-fund', '--no-audit']);
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
  if (options['export-config']) exported = await exportClientConfig(options['export-config'], { dataDir, include: options.include ? options.include.split(',').filter(Boolean) : [] });
  else if (options.include) throw new Error('--include is used with --export-config DIR.');
  return { ...await doctor({ probe: true }), ...(exported ? { exported } : {}), nextStep: 'Run npm start. Open Connect email or Connect Tabbio for account setup. For coding agents, export or copy the generated MCP configuration.' };
}

if (isDirectInvocation(import.meta.url)) {
  setup().then(data => { if (data && !process.argv.includes('--quiet')) process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`); }).catch(error => { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; });
}
