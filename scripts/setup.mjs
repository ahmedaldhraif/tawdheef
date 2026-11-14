import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { isDirectInvocation } from './is-direct.mjs';
import { INTEGRATIONS_ROOT, exportClientConfig } from '../server/integrations.mjs';
import { doctor } from './doctor.mjs';
import { findNpmCli } from './npm-cli.mjs';
import { runtimeEnvironment } from './runtime-env.mjs';
import { coreInstalled } from './runtime-check.mjs';
import { defaultDataDir } from './app-paths.mjs';
const usage = 'Tawdheef setup\n\n  npm run setup                         Install missing source dependencies and build the tracker\n  npm run setup -- --check              Read local readiness\n  npm run agent -- codex --tabbio       Add direct Tabbio MCP to the actual client\n  npm run agent -- claude-code          Configure the actual Claude Code project\n  npm run setup -- --export-config DIR [--include tabbio]\n\nExternal connections belong to your actual Codex/Claude Code client. Prebuilt apps never rebuild or install developer tools.\n';
function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (['--check', '--no-build', '--quiet', '--help'].includes(value)) options[value.slice(2)] = true;
    else if (['--export-config', '--include'].includes(value)) {
      const argument = argv[++index];
      if (!argument || argument.startsWith('--')) throw new Error(value + ' needs a value.');
      options[value.slice(2)] = argument;
    } else throw new Error('Unsupported setup option: ' + value + '. External connections belong to your actual Codex/Claude Code client. Use --help.');
  }
  if (options.check && Object.keys(options).some(key => key !== 'check')) throw new Error('--check is read-only. Run it separately from installation and export options.');
  if (options.include && !options['export-config']) throw new Error('--include is used with --export-config DIR.');
  if (options.include && options.include.split(',').some(id => id !== 'tabbio')) throw new Error('Only direct Tabbio MCP can be included. Use your actual client’s native external tools.');
  return options;
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
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


export async function setup(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.help) { process.stdout.write(usage); return; }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 26 LTS before running Tawdheef.');
  if (options.check) return doctor();
  const dataDir = defaultDataDir(INTEGRATIONS_ROOT);
  const prebuilt = await exists(join(INTEGRATIONS_ROOT, 'tawdheef-app.json'));
  const installed = await coreInstalled(INTEGRATIONS_ROOT, prebuilt);
  if (!installed && prebuilt) throw new Error('This app package is incomplete. Download a fresh copy; your private data was not changed.');
  if (!installed) await npmCommand(['ci', '--no-fund', '--no-audit']);
  if (!options['no-build'] && !prebuilt) await run(process.execPath, [join(INTEGRATIONS_ROOT, 'scripts', 'build.mjs')]);
  const exported = options['export-config'] ? await exportClientConfig(options['export-config'], { dataDir, include: options.include ? options.include.split(',') : [] }) : undefined;
  return { ...await doctor(), mode: 'native', ...(exported ? { exported } : {}), nextStep: 'Open your selected Codex/Claude Code client. It owns Tabbio, email, calendar, browser and password-manager connections. Tawdheef stores local guidance and recorded results; configuration alone does not verify accounts.' };
}
if (isDirectInvocation(import.meta.url)) {
  setup().then(data => { if (data && !process.argv.includes('--quiet')) process.stdout.write(JSON.stringify({ ok: true, data }, null, 2) + '\n'); }).catch(error => { process.stderr.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); process.exitCode = 1; });
}
