import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, access, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { XMLParser } from 'fast-xml-parser';
import { backgroundCommand, renderStartupLauncher } from '../scripts/background.mjs';

const marker = 'Apply Tracker managed startup launcher';
const options = {
  home: '/Users/Job seeker', root: '/Applications/Tawdheef & careers',
  executable: '/Applications/Tawdheef & careers/runtime/node',
  scriptPath: '/Applications/Tawdheef & careers/scripts/background.mjs',
  dataDir: '/Users/Job seeker/private CVs', port: 4018, env: {},
};

test('macOS login agent preserves argument boundaries and environment without a shell or restart loop', () => {
  const source = renderStartupLauncher({ ...options, platform: 'darwin' });
  const parsed = new XMLParser({ parseTagValue: false }).parse(source.content).plist.dict;
  assert.deepEqual(parsed.array.string, [options.executable, options.scriptPath, 'start']);
  assert.deepEqual(parsed.dict.key, ['APPLY_TRACKER_DATA', 'APPLY_TRACKER_PORT']);
  assert.deepEqual(parsed.dict.string, [options.dataDir, '4018']);
  assert.deepEqual(parsed.string, ['com.tawdheef.tracker', options.root]);
  assert.ok(parsed.key.includes('RunAtLoad'));
  assert.ok(parsed.key.includes('AbandonProcessGroup'));
  assert.ok(!parsed.key.includes('KeepAlive'));
  assert.ok(source.launcher.endsWith(join('Library', 'LaunchAgents', 'com.tawdheef.tracker.plist')));
});

// Parse the two Desktop Entry escaping layers, then token boundaries, so the
// expected argv is checked independently of the renderer's replacements.
function desktopArguments(content) {
  const raw = content.split('\n').find(line => line.startsWith('Exec=')).slice(5);
  const value = raw.replace(/\\([sntr\\])/g, (_, code) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[code]);
  const args = []; let current = '', quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '\\' && quoted) current += value[++index];
    else if (character === '"') quoted = !quoted;
    else if (character === ' ' && !quoted) { args.push(current); current = ''; }
    else if (character === '%') { assert.equal(value[++index], '%'); current += '%'; }
    else current += character;
  }
  assert.equal(quoted, false);
  return [...args, current];
}

test('Linux autostart quotes spaces, percent field codes and shell metacharacters as literal arguments', () => {
  const values = {
    ...options, platform: 'linux',
    root: '/home/job seeker/Tawdheef %f $HOME `literal` \\ "quoted"',
    dataDir: '/home/job seeker/private %U $TOKEN `literal` \\ "CVs"',
    executable: '/home/job seeker/Node $local/node',
    env: { XDG_CONFIG_HOME: join(tmpdir(), 'tawdheef-config-fixture') },
  };
  const source = renderStartupLauncher(values);
  assert.deepEqual(desktopArguments(source.content), [
    '/usr/bin/env', `APPLY_TRACKER_DATA=${values.dataDir}`, 'APPLY_TRACKER_PORT=4018',
    values.executable, values.scriptPath, 'start',
  ]);
  assert.ok(source.launcher.startsWith(values.env.XDG_CONFIG_HOME));
  assert.match(source.content, /^Terminal=false$/m);
  assert.doesNotMatch(source.content, /sh -c|bash|KeepAlive|refreshFrequency|reportFrequency/);
});

test('Windows renderer retains hidden execution and exact data/port settings', () => {
  const source = renderStartupLauncher({ ...options, platform: 'win32', env: { APPDATA: 'C:\\Users\\Job seeker\\AppData\\Roaming' } });
  assert.ok(source.launcher.endsWith(join('Startup', 'Apply Tracker.vbs')));
  assert.ok(source.content.includes('shell.Environment("PROCESS")("APPLY_TRACKER_DATA") = "' + options.dataDir + '"'));
  assert.ok(source.content.includes('shell.Environment("PROCESS")("APPLY_TRACKER_PORT") = "4018"'));
  assert.match(source.content, /shell\.Run .*, 0, False/);
});

test('Linux uses an absolute XDG config directory and ignores a relative one', () => {
  const absolute = join(tmpdir(), 'tawdheef-custom-config');
  const custom = renderStartupLauncher({ ...options, platform: 'linux', env: { XDG_CONFIG_HOME: absolute + '/' } });
  assert.equal(custom.launcher, join(absolute, 'autostart', 'com.tawdheef.tracker.desktop'));
  const fallback = renderStartupLauncher({ ...options, platform: 'linux', env: { XDG_CONFIG_HOME: 'relative-folder' } });
  assert.equal(fallback.launcher, join(options.home, '.config', 'autostart', 'com.tawdheef.tracker.desktop'));
});

for (const platform of ['win32', 'darwin', 'linux']) {
  test(`${platform} startup installation is explicit, preserves foreign files and removes only its own launcher`, async t => {
    const fixture = await mkdtemp(join(tmpdir(), 'tawdheef-startup-'));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const input = {
      platform, home: fixture, root: join(fixture, 'app folder'),
      executable: join(fixture, 'node bin', 'node'), scriptPath: join(fixture, 'app folder', 'scripts', 'background.mjs'),
      dataDir: join(fixture, 'private data'), port: 4018,
      env: { APPDATA: join(fixture, 'roaming'), XDG_CONFIG_HOME: join(fixture, 'config') },
    };
    const definition = renderStartupLauncher(input);
    assert.equal((await backgroundCommand('status', input)).startupInstalled, false);
    await assert.rejects(access(definition.launcher), { code: 'ENOENT' });
    await mkdir(dirname(definition.launcher), { recursive: true });
    await writeFile(definition.launcher, 'User-managed startup configuration');
    await assert.rejects(backgroundCommand('install', input), /not overwritten/);
    await assert.rejects(backgroundCommand('uninstall', input), /not removed/);
    assert.equal(await readFile(definition.launcher, 'utf8'), 'User-managed startup configuration');
    await rm(definition.launcher);

    const installed = await backgroundCommand('install', input);
    assert.equal(installed.installed, true);
    assert.equal(installed.launcher, definition.launcher);
    assert.equal(await readFile(definition.launcher, 'utf8'), definition.content);
    assert.equal((await backgroundCommand('status', input)).startupInstalled, true);
    assert.equal((await backgroundCommand('status', input)).running, false);
    assert.equal((await backgroundCommand('install', input)).installed, true);
    assert.equal((await backgroundCommand('uninstall', input)).installed, false);
    await assert.rejects(access(definition.launcher), { code: 'ENOENT' });
    await assert.rejects(access(input.dataDir), { code: 'ENOENT' });
  });
}

test('startup rendering refuses control characters and supports no unknown operating system', () => {
  assert.throws(() => renderStartupLauncher({ ...options, platform: 'linux', scriptPath: '/tmp/app\nExec=bad' }), /control characters/);
  assert.equal(renderStartupLauncher({ ...options, platform: 'freebsd' }), null);
});

test('startup installation refuses a linked file without changing its target', { skip: process.platform === 'win32' }, async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'tawdheef-startup-link-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const input = { ...options, platform: 'linux', home: fixture, dataDir: join(fixture, 'private'), env: {} };
  const definition = renderStartupLauncher(input);
  const target = join(fixture, 'original');
  await writeFile(target, marker);
  await mkdir(dirname(definition.launcher), { recursive: true });
  await symlink(target, definition.launcher);
  await assert.rejects(backgroundCommand('install', input), /is a link/);
  await assert.rejects(backgroundCommand('uninstall', input), /is a link/);
  assert.equal(await readFile(target, 'utf8'), marker);
});
