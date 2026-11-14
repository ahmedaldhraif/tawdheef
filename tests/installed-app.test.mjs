import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, link, rm, unlink, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getInstalledAppLaunch, installedAppLaunchSpec } from '../scripts/installed-app.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const entryNames = ['scripts/start.mjs', 'scripts/background.mjs', 'scripts/agent-setup.mjs', 'bin/apply-tracker.mjs', 'server/mcp.mjs'];
async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-installed-app-'), folder = await mkdtemp(prefix);
  const sourceRoot = join(folder, 'source checkout'), appRoot = join(folder, 'reviewed app'), dataDir = join(sourceRoot, 'isolated data');
  for (const path of [sourceRoot, appRoot, dataDir, join(sourceRoot, '.tawdheef-setup')]) await mkdir(path, { recursive: true });
  const pointer = { format: 1, appRoot, dataDir, workspace: sourceRoot, port: 4017 };
  const manifest = { format: 1, name: 'Tawdheef', prebuilt: true, platform: process.platform, arch: process.arch };
  const pointerPath = join(sourceRoot, '.tawdheef-setup', 'active-install.json');
  await writeFile(pointerPath, JSON.stringify(pointer)); await writeFile(join(appRoot, 'tawdheef-app.json'), JSON.stringify(manifest));
  const executable = join(appRoot, 'runtime', ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']));
  await mkdir(dirname(executable), { recursive: true });
  try { await link(process.execPath, executable); } catch (error) { if (['EXDEV', 'EPERM', 'EACCES'].includes(error.code)) await copyFile(process.execPath, executable); else throw error; }
  const installedProgram = `process.stdout.write(JSON.stringify({entry:process.argv[1],args:process.argv.slice(2),data:process.env.APPLY_TRACKER_DATA,workspace:process.env.TAWDHEEF_WORKSPACE,port:process.env.APPLY_TRACKER_PORT,client:process.env.APPLY_TRACKER_CLIENT,monitor:process.env.APPLY_TRACKER_MONITOR,permissions:process.env.FIXTURE_PERMISSION,cwd:process.cwd()}));process.stderr.write('fixture-installed-stderr');process.exitCode=7;`;
  for (const entry of entryNames) { await mkdir(dirname(join(appRoot, entry)), { recursive: true }); await writeFile(join(appRoot, entry), installedProgram); }
  for (const file of ['scripts/installed-app.mjs', 'scripts/runtime-env.mjs', 'scripts/is-direct.mjs', 'scripts/start.mjs', 'scripts/background.mjs', 'scripts/agent-setup.mjs', 'scripts/agent-config-merge.mjs', 'scripts/runtime-check.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'server/integrations.mjs', 'bin/apply-tracker.mjs']) {
    const target = join(sourceRoot, file); await mkdir(dirname(target), { recursive: true }); await copyFile(join(root, file), target);
  }
  // This source fixture deliberately has no node_modules, source MCP or SQLite.
  const env = { ...process.env, APPLY_TRACKER_CLIENT: 'claude-code', APPLY_TRACKER_MONITOR: '1', FIXTURE_PERMISSION: 'unchanged' };
  for (const key of ['APPLY_TRACKER_DATA', 'TAWDHEEF_WORKSPACE', 'APPLY_TRACKER_PORT']) delete env[key];
  t.after(async () => { assert.ok(resolve(folder).startsWith(resolve(prefix))); await rm(folder, { recursive: true, force: true, maxRetries: 5 }); });
  return { sourceRoot, appRoot, dataDir, pointer, manifest, pointerPath, executable, env };
}

test('installed launch specifications use exact reviewed entries, bundled Node and unchanged client permission metadata', async t => {
  const f = await fixture(t), original = { ...f.env };
  for (const entry of entryNames) {
    const spec = installedAppLaunchSpec({ ...f, entry, cwd: f.sourceRoot, args: ['argument with spaces', '--json', '{"notes":"$() `literal`"}'] });
    assert.equal(spec.command, f.executable); assert.deepEqual(spec.args, [join(f.appRoot, entry), 'argument with spaces', '--json', '{"notes":"$() `literal`"}']);
    assert.equal(spec.options.cwd, f.sourceRoot); assert.equal(spec.options.stdio, 'inherit'); assert.equal(spec.options.windowsHide, true);
    assert.equal(spec.options.env.APPLY_TRACKER_DATA, f.dataDir); assert.equal(spec.options.env.TAWDHEEF_WORKSPACE, f.sourceRoot); assert.equal(spec.options.env.APPLY_TRACKER_PORT, '4017');
    for (const key of ['APPLY_TRACKER_CLIENT', 'APPLY_TRACKER_MONITOR', 'FIXTURE_PERMISSION']) assert.equal(spec.options.env[key], original[key]);
  }
  assert.deepEqual(f.env, original);
});

test('explicit source data, workspace or port requests never redirect to installed private data', async t => {
  const f = await fixture(t);
  for (const env of [{ ...f.env, APPLY_TRACKER_DATA: join(f.sourceRoot, 'another fixture') }, { ...f.env, TAWDHEEF_WORKSPACE: join(f.sourceRoot, 'another workspace') }, { ...f.env, APPLY_TRACKER_PORT: '43210' }]) {
    assert.equal(await getInstalledAppLaunch({ ...f, entry: 'server/mcp.mjs', env }), null);
  }
  assert.ok(await getInstalledAppLaunch({ ...f, entry: 'server/mcp.mjs', env: { ...f.env, APPLY_TRACKER_DATA: f.dataDir, TAWDHEEF_WORKSPACE: f.sourceRoot, APPLY_TRACKER_PORT: '4017' } }));
});

test('canonical module paths accept unchanged pointer aliases and equivalent client environment paths', async t => {
  const f = await fixture(t), aliases = join(dirname(f.sourceRoot), 'filesystem aliases'); await mkdir(aliases);
  const sourceAlias = join(aliases, 'source'), appAlias = join(aliases, 'app'), dataAlias = join(aliases, 'data');
  for (const [target, alias] of [[f.sourceRoot, sourceAlias], [f.appRoot, appAlias], [f.dataDir, dataAlias]]) await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const pointer = { ...f.pointer, appRoot: appAlias, workspace: sourceAlias, dataDir: dataAlias };
  await writeFile(f.pointerPath, JSON.stringify(pointer)); const before = await readFile(f.pointerPath);
  const canonicalSource = await realpath(f.sourceRoot), canonicalData = await realpath(f.dataDir);
  for (const env of [f.env, { ...f.env, APPLY_TRACKER_DATA: canonicalData, TAWDHEEF_WORKSPACE: canonicalSource }, { ...f.env, APPLY_TRACKER_DATA: dataAlias, TAWDHEEF_WORKSPACE: sourceAlias }]) {
    const spec = await getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs', env });
    assert.equal(spec.command, join(appAlias, 'runtime', ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node'])));
    assert.equal(spec.options.env.APPLY_TRACKER_DATA, dataAlias); assert.equal(spec.options.env.TAWDHEEF_WORKSPACE, sourceAlias);
    assert.equal(spec.options.env.APPLY_TRACKER_CLIENT, 'claude-code'); assert.equal(spec.options.env.FIXTURE_PERMISSION, 'unchanged');
  }
  const alternate = join(aliases, 'genuinely different data'); await mkdir(alternate);
  assert.equal(await getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs', env: { ...f.env, APPLY_TRACKER_DATA: alternate } }), null);
  assert.equal(await getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs', env: { ...f.env, APPLY_TRACKER_DATA: join(aliases, 'not-created alternate') } }), null);
  assert.equal(await getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs', env: { ...f.env, TAWDHEEF_WORKSPACE: alternate } }), null);
  const forwarded = spawnSync(process.execPath, [join(canonicalSource, 'scripts/start.mjs'), '--no-open'], { cwd: canonicalSource, env: { ...f.env, APPLY_TRACKER_DATA: canonicalData, TAWDHEEF_WORKSPACE: canonicalSource }, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(forwarded.status, 7, forwarded.stderr);
  const observed = JSON.parse(forwarded.stdout);
  assert.equal(await realpath(observed.entry), await realpath(join(f.appRoot, 'scripts/start.mjs')));
  assert.equal(observed.data, dataAlias); assert.equal(observed.workspace, sourceAlias); assert.equal(observed.client, 'claude-code');
  assert.deepEqual(await readFile(f.pointerPath), before);
  await writeFile(f.pointerPath, JSON.stringify({ ...pointer, workspace: alternate }));
  await assert.rejects(getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs' }), /different source workspace/);
  await writeFile(f.pointerPath, JSON.stringify({ ...pointer, appRoot: sourceAlias }));
  await assert.rejects(getInstalledAppLaunch({ ...f, sourceRoot: canonicalSource, entry: 'scripts/start.mjs' }), /resolves to this source checkout/);
  await writeFile(f.pointerPath, before); assert.deepEqual(await readFile(f.pointerPath), before);
});

test('invalid private pointers and mismatched package metadata fail closed', async t => {
  const f = await fixture(t);
  const input = { ...f, entry: 'scripts/start.mjs' };
  for (const pointer of [null, { ...f.pointer, format: 2 }, { ...f.pointer, appRoot: 'relative' }, { ...f.pointer, dataDir: 'relative' }, { ...f.pointer, workspace: 'relative' }, { ...f.pointer, appRoot: f.sourceRoot }, { ...f.pointer, workspace: f.appRoot }, { ...f.pointer, dataDir: f.dataDir + '\n' }, { ...f.pointer, port: '4017' }, { ...f.pointer, port: 65536 }, { ...f.pointer, unsupported: true }]) {
    assert.throws(() => installedAppLaunchSpec({ ...input, pointer }), /Active Tawdheef installation/);
  }
  for (const manifest of [{ ...f.manifest, prebuilt: false }, { ...f.manifest, format: 2 }, { ...f.manifest, name: 'Different app' }, { ...f.manifest, platform: 'different-platform' }, { ...f.manifest, arch: 'different-arch' }]) {
    assert.throws(() => installedAppLaunchSpec({ ...input, manifest }), /prebuilt Tawdheef package/);
  }
  assert.throws(() => installedAppLaunchSpec({ ...input, entry: '../other.mjs' }), /supported/);
  await writeFile(f.pointerPath, '{invalid json');
  await assert.rejects(getInstalledAppLaunch(input), /not valid JSON/);
});

test('missing installed runtime or entry fails instead of falling back, while packaged apps skip pointers', async t => {
  const f = await fixture(t), input = { ...f, entry: 'scripts/start.mjs' };
  await unlink(f.executable);
  await assert.rejects(getInstalledAppLaunch(input), /Bundled Node runtime is missing/);
  await writeFile(f.executable, 'fixture runtime metadata'); await unlink(join(f.appRoot, input.entry));
  await assert.rejects(getInstalledAppLaunch(input), /Installed entry point is missing/);
  await writeFile(join(f.sourceRoot, 'tawdheef-app.json'), JSON.stringify(f.manifest));
  await writeFile(f.pointerPath, '{invalid and deliberately ignored inside package');
  assert.equal(await getInstalledAppLaunch(input), null);
  await unlink(join(f.sourceRoot, 'tawdheef-app.json')); await unlink(f.pointerPath);
  assert.equal(await getInstalledAppLaunch(input), null);
});

test('an installation cannot silently replace a missing original data folder with an empty database', async t => {
  const f = await fixture(t), missing = join(f.sourceRoot, 'missing original data');
  await writeFile(f.pointerPath, JSON.stringify({ ...f.pointer, dataDir: missing }));
  await assert.rejects(getInstalledAppLaunch({ ...f, entry: 'scripts/start.mjs' }), /existing private data directory is missing/);
  const file = join(f.sourceRoot, 'not-a-data-directory'); await writeFile(file, 'fixture');
  await writeFile(f.pointerPath, JSON.stringify({ ...f.pointer, dataDir: file }));
  await assert.rejects(getInstalledAppLaunch({ ...f, entry: 'scripts/start.mjs' }), /not a directory/);
});

test('forwarded CLI paths remain relative to the caller rather than a different workspace', async t => {
  const f = await fixture(t), caller = join(f.sourceRoot, 'caller directory'); await mkdir(caller);
  const result = spawnSync(process.execPath, [join(f.sourceRoot, 'bin/apply-tracker.mjs'), 'call', 'fixture', '--input-file', 'arguments.json'], { cwd: caller, env: f.env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 7); const observed = JSON.parse(result.stdout);
  assert.equal(observed.cwd, caller); assert.equal(observed.workspace, f.sourceRoot);
  assert.deepEqual(observed.args, ['call', 'fixture', '--input-file', 'arguments.json']);
});

for (const entry of ['scripts/start.mjs', 'scripts/background.mjs', 'scripts/agent-setup.mjs', 'bin/apply-tracker.mjs']) {
  test(`${entry} forwards before source dependencies or local app execution and propagates the real exit code`, async t => {
    const f = await fixture(t), pointerBefore = await readFile(f.pointerPath, 'utf8');
    const result = spawnSync(process.execPath, [join(f.sourceRoot, entry), 'unchanged argument', '--fixture'], { cwd: f.sourceRoot, env: f.env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 7); assert.equal(result.stderr, 'fixture-installed-stderr');
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.entry, join(f.appRoot, entry)); assert.deepEqual(observed.args, ['unchanged argument', '--fixture']);
    assert.equal(observed.data, f.dataDir); assert.equal(observed.workspace, f.sourceRoot); assert.equal(observed.port, '4017');
    assert.equal(observed.client, 'claude-code'); assert.equal(observed.monitor, '1'); assert.equal(observed.permissions, 'unchanged'); assert.equal(observed.cwd, f.sourceRoot);
    assert.equal(await readFile(f.pointerPath, 'utf8'), pointerBefore);
  });
}

test('an invalid installed pointer stops source start without installing or creating data', async t => {
  const f = await fixture(t); await writeFile(f.pointerPath, '{invalid');
  const result = spawnSync(process.execPath, [join(f.sourceRoot, 'scripts/start.mjs')], { cwd: f.sourceRoot, env: f.env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /active-install.json is not valid JSON/); assert.equal(result.stdout, '');
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(f.dataDir), []); assert.equal((await readdir(f.sourceRoot)).includes('node_modules'), false);
});

test('installed agent setup preserves an existing source checkout guidance while owning only selected client configuration and skill', async t => {
  const f = await fixture(t);
  for (const file of ['scripts/agent-setup.mjs', 'scripts/agent-config-merge.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'scripts/runtime-env.mjs', 'scripts/is-direct.mjs', 'scripts/installed-app.mjs', 'server/integrations.mjs']) {
    const target = join(f.appRoot, file); await mkdir(dirname(target), { recursive: true }); await copyFile(join(root, file), target);
  }
  await mkdir(join(f.appRoot, 'skills/tawdheef'), { recursive: true }); await writeFile(join(f.appRoot, 'skills/tawdheef/SKILL.md'), 'Synthetic installed Native guidance');
  const sourceFiles = {
    'package.json': JSON.stringify({ name: 'apply-tracker', type: 'module' }),
    'server/store.mjs': '// Active source work must remain untouched\r\n',
    'src/main.jsx': '// Active interface work must remain untouched\r\n',
    'AGENTS.md': '# Existing source instructions\r\nKeep concurrent source work. السيرة\r\n',
    'CLAUDE.md': '@AGENTS.md\r\n# Existing project instruction\r\n',
    'docs/AGENT-GUIDE.md': '# Existing guide\r\nPrivate local customization stays here.\r\n',
    '.agents/skills/unrelated/SKILL.md': 'Keep unrelated project skill',
  };
  for (const [file, content] of Object.entries(sourceFiles)) { const target = join(f.sourceRoot, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); }
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'docs/AGENT-GUIDE.md']) { const target = join(f.appRoot, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, 'Different installed instructions must not replace source work'); }
  const before = Object.fromEntries(await Promise.all(Object.keys(sourceFiles).map(async file => [file, await readFile(join(f.sourceRoot, file))])));
  const pointerBefore = await readFile(f.pointerPath);
  function setup() { return spawnSync(process.execPath, [join(f.sourceRoot, 'scripts/agent-setup.mjs'), 'codex', '--json'], { cwd: f.sourceRoot, env: f.env, encoding: 'utf8', windowsHide: true, timeout: 10_000 }); }
  const first = setup(); assert.equal(first.status, 0, first.stderr); const result = JSON.parse(first.stdout);
  assert.equal(await realpath(result.appRoot), await realpath(f.appRoot)); assert.equal(await realpath(result.workspace), await realpath(f.sourceRoot)); assert.deepEqual(result.clients, ['codex']);
  const config = await readFile(join(f.sourceRoot, '.codex/config.toml'), 'utf8');
  const configuredCommand = JSON.parse(config.match(/^command = (".*")$/m)[1]), configuredArgs = JSON.parse(config.match(/^args = (\[.*\])$/m)[1]);
  assert.equal(await realpath(configuredCommand), await realpath(f.executable)); assert.deepEqual(await Promise.all(configuredArgs.map(path => realpath(path))), [await realpath(join(f.appRoot, 'server/mcp.mjs'))]);
  assert.match(config, /APPLY_TRACKER_CLIENT = "codex"/); assert.ok(config.includes(JSON.stringify(f.dataDir)));
  assert.equal(await readFile(join(f.sourceRoot, '.agents/skills/tawdheef/SKILL.md'), 'utf8'), 'Synthetic installed Native guidance');
  assert.ok(result.files.every(file => !/AGENTS\.md$|CLAUDE\.md$|[\\/]docs[\\/]/.test(file.path)));
  const repeated = setup(); assert.equal(repeated.status, 0, repeated.stderr); assert.ok(JSON.parse(repeated.stdout).files.every(file => file.status === 'already configured'));
  assert.equal(await readFile(join(f.sourceRoot, '.codex/config.toml'), 'utf8'), config);
  for (const [file, bytes] of Object.entries(before)) assert.deepEqual(await readFile(join(f.sourceRoot, file)), bytes, file);
  assert.deepEqual(await readFile(f.pointerPath), pointerBefore);
  const { access } = await import('node:fs/promises'); await assert.rejects(access(join(f.sourceRoot, '.mcp.json')), { code: 'ENOENT' });
});
