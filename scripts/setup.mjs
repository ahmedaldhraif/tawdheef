import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { INTEGRATIONS_ROOT, INTEGRATIONS, integrationPresets, exportClientConfig } from '../server/integrations.mjs';
import { doctor } from './doctor.mjs';

const usage = `Apply Tracker setup\n\n  npm run setup                         Install missing dependencies and build\n  npm run setup -- --all                Also install Chromium and external Tabbio CLI\n  npm run setup -- --browser            Install the browser used by Playwright MCP\n  npm run setup -- --tabbio             Download Tabbio CLI into private local tools\n  npm run setup -- --login google-cli   Sign in to the isolated Google CLI mailbox\n  npm run setup -- --login tabbio       Sign in to the external Tabbio CLI\n  npm run setup -- --login outlook-mcp  Sign in to the optional Microsoft mail bridge\n  npm run setup -- --export-config DIR [--include playwright,tabbio,outlook-mcp]\n  npm run setup -- --check              Check readiness without installing or signing in\n\nNo sign-in runs unless --login is supplied. Client settings are never changed.\n`;

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (['--all', '--browser', '--tabbio', '--check', '--no-build', '--quiet', '--help'].includes(value)) options[value.slice(2)] = true;
    else if (['--export-config', '--include', '--login'].includes(value)) {
      const argument = argv[++index];
      if (!argument || argument.startsWith('--')) throw new Error(`${value} needs a value.`);
      options[value.slice(2)] = argument;
    } else throw new Error(`Unknown setup option: ${value}. Use --help.`);
  }
  if (options.check && Object.keys(options).some(key => key !== 'check')) throw new Error('--check is read-only. Run it separately from installation, login and export options.');
  if (options.login && !['google-cli', 'tabbio', 'outlook-mcp'].includes(options.login)) throw new Error('Choose google-cli, tabbio or outlook-mcp for --login.');
  return options;
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: INTEGRATIONS_ROOT, env: process.env, shell: false, windowsHide: true, stdio: 'inherit', ...options });
    child.once('error', () => reject(new Error('A setup command could not start. Run this command through npm run setup.')));
    child.once('close', code => code === 0 ? accept() : reject(new Error(`Setup command exited with ${code ?? 'an error'}. Review the output above and run npm run doctor.`)));
  });
}

async function npmCommand(args) {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')].filter(Boolean);
  for (const path of candidates) if (await exists(path)) return run(process.execPath, [path, ...args]);
  if (process.platform !== 'win32') return run('npm', args);
  throw new Error('Run setup with npm run setup so the npm executable can be located without a shell.');
}

async function installBrowser() {
  const mcpEntry = join(INTEGRATIONS_ROOT, 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (!(await exists(mcpEntry))) throw new Error('Playwright MCP is missing. Run npm run setup first.');
  const require = createRequire(mcpEntry);
  const playwrightManifest = require.resolve('playwright/package.json');
  await run(process.execPath, [join(dirname(playwrightManifest), 'cli.js'), 'install', 'chromium']);
}

export async function setup(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.help) { process.stdout.write(usage); return; }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 24 or newer before running Apply Tracker.');
  if (options.check) return doctor({ probe: true });
  const dataDir = resolve(process.env.APPLY_TRACKER_DATA || join(INTEGRATIONS_ROOT, '.local'));
  const presets = await integrationPresets({ dataDir });
  const coreInstalled = await exists(join(INTEGRATIONS_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'));
  if (!coreInstalled || presets.filter(item => item.id !== 'tabbio').some(item => !item.ready)) {
    await npmCommand(['ci', '--include=optional', '--no-fund', '--no-audit']);
  }
  if (options.tabbio || options.all || options.login === 'tabbio') {
    const current = (await integrationPresets({ dataDir })).find(item => item.id === 'tabbio');
    if (!current.ready) {
      const prefix = join(dataDir, 'integrations');
      await mkdir(prefix, { recursive: true, mode: 0o700 });
      const tabbio = INTEGRATIONS.find(item => item.id === 'tabbio');
      process.stdout.write('Downloading the external Tabbio CLI (UNLICENSED) into private local tools; it is separate from the MIT tracker source.\n');
      await npmCommand(['install', '--prefix', prefix, '--save-exact', '--no-fund', `${tabbio.package}@${tabbio.version}`]);
    }
  }
  if (options.browser || options.all) await installBrowser();
  if (!options['no-build']) await run(process.execPath, [join(INTEGRATIONS_ROOT, 'scripts', 'build.mjs')]);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setup().then(data => { if (data && !process.argv.includes('--quiet')) process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`); }).catch(error => { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; });
}
