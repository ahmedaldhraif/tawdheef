import { mkdir, readFile, writeFile, cp, mkdtemp, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { runtimeEnvironment } from './runtime-env.mjs';

export function nativeLayout(platform) {
  return platform === 'darwin'
    ? { codeRoot: 'Tawdheef.app/Contents/Resources/app', launcher: 'Tawdheef.app/Contents/MacOS/Tawdheef', bundle: 'Tawdheef.app' }
    : { codeRoot: '.', launcher: platform === 'win32' ? 'Tawdheef.exe' : 'start-tawdheef.sh', bundle: null };
}
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function macInfoPlist(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Error('Invalid app version for the native bundle.');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundleIdentifier</key><string>com.tawdheef.app</string>\n<key>CFBundleName</key><string>Tawdheef</string>\n<key>CFBundleDisplayName</key><string>Tawdheef</string>\n<key>CFBundleExecutable</key><string>Tawdheef</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleShortVersionString</key><string>${xml(version.split(/[-+]/)[0])}</string>\n<key>CFBundleVersion</key><string>${xml(version.split(/[-+]/)[0])}</string>\n<key>CFBundleIconFile</key><string>AppIcon</string>\n<key>LSMinimumSystemVersion</key><string>13.5</string>\n<key>LSUIElement</key><true/>\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n`;
}
export async function nativeCommand(command, args, { cwd, env = runtimeEnvironment(), capture = false, timeout = 120_000, windowsVerbatimArguments = false } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, windowsVerbatimArguments, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) {
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-4_000_000); });
      // Compiler/signing errors can contain account metadata. Never copy their
      // stderr or command arguments into receipts or app logs.
      child.stderr.on('data', () => {});
    }
    const timer = setTimeout(() => { child.kill(); reject(new Error('Native packaging command timed out.')); }, timeout);
    child.once('error', () => { clearTimeout(timer); reject(new Error('A required native packaging tool could not start.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(output) : reject(new Error(`Native packaging tool failed (${code}).`)); });
  });
}
async function msvcEnvironment(arch, run) {
  const env = runtimeEnvironment();
  if (env.VCToolsInstallDir && env.WindowsSdkDir) return env;
  const vswhere = join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  await access(vswhere);
  const component = arch === 'arm64' ? 'Microsoft.VisualStudio.Component.VC.Tools.ARM64' : 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64';
  const installation = (await run(vswhere, ['-latest', '-products', '*', '-requires', component, '-property', 'installationPath'], { capture: true, env })).trim();
  // Only a Microsoft installation path is placed into this fixed bootstrap.
  // App/output/source paths are always passed as argument arrays to cl/rc.
  if (!installation || /["%\r\n]/.test(installation)) throw new Error('MSVC developer tools were not found. Run from a Visual Studio developer command prompt.');
  const batch = join(installation, 'Common7', 'Tools', 'VsDevCmd.bat');
  await access(batch);
  const host = process.arch === 'arm64' ? 'arm64' : 'x64';
  const command = `"call "${batch}" -no_logo -arch=${arch === 'arm64' ? 'arm64' : 'x64'} -host_arch=${host} >nul && set"`;
  const values = await run(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { capture: true, env, windowsVerbatimArguments: true });
  const next = { ...env };
  for (const line of values.split(/\r?\n/)) {
    const equals = line.indexOf('=');
    if (equals > 0) { const name = line.slice(0, equals); for (const key of Object.keys(next)) if (key.toLowerCase() === name.toLowerCase()) delete next[key]; next[name] = line.slice(equals + 1); }
  }
  return next;
}
export async function buildNativeLauncher({ root, folder, version, platform = process.platform, arch = process.arch, run = nativeCommand } = {}) {
  const layout = nativeLayout(platform);
  if (platform === 'linux') return layout;
  const temporary = await mkdtemp(join(tmpdir(), 'tawdheef-native-build-'));
  try {
    const target = join(folder, layout.launcher); await mkdir(dirname(target), { recursive: true });
    if (platform === 'darwin') {
      const contents = join(folder, 'Tawdheef.app', 'Contents');
      await writeFile(join(contents, 'Info.plist'), macInfoPlist(version));
      await writeFile(join(contents, 'PkgInfo'), 'APPL????');
      await run('xcrun', ['clang', '-fobjc-arc', '-Os', '-Wall', '-Wextra', '-mmacosx-version-min=13.5', '-arch', arch === 'arm64' ? 'arm64' : 'x86_64', '-framework', 'Cocoa', '-o', target, join(root, 'scripts/native/launcher-macos.m')], { cwd: temporary });
      const iconset = join(temporary, 'AppIcon.iconset'); await mkdir(iconset);
      for (const size of [16, 32, 128, 256, 512]) {
        await cp(join(root, `public/brand/app-icon-${size}.png`), join(iconset, `icon_${size}x${size}.png`));
        await cp(join(root, `public/brand/app-icon-${size * 2}.png`), join(iconset, `icon_${size}x${size}@2x.png`));
      }
      await run('iconutil', ['-c', 'icns', iconset, '-o', join(contents, 'Resources', 'AppIcon.icns')], { cwd: temporary });
    } else {
      const env = await msvcEnvironment(arch, run);
      await cp(join(root, 'public/brand/favicon.ico'), join(temporary, 'launcher.ico'));
      const parts = version.split(/[.+-]/).slice(0, 3).map(Number); if (parts.length !== 3 || parts.some(value => !Number.isInteger(value))) throw new Error('Invalid native app version.');
      const resource = `1 ICON "launcher.ico"\n1 VERSIONINFO\n FILEVERSION ${parts.join(',')},0\n PRODUCTVERSION ${parts.join(',')},0\n FILETYPE 1\n BEGIN\n BLOCK "StringFileInfo"\n BEGIN\n BLOCK "040904b0"\n BEGIN\n VALUE "FileDescription", "Tawdheef\\0"\n VALUE "ProductName", "Tawdheef\\0"\n VALUE "FileVersion", "${parts.join('.')}\\0"\n END\n END\n BLOCK "VarFileInfo"\n BEGIN\n VALUE "Translation", 0x409, 1200\n END\n END\n`;
      await writeFile(join(temporary, 'launcher.rc'), resource);
      await run('rc.exe', ['/nologo', '/fo', join(temporary, 'launcher.res'), join(temporary, 'launcher.rc')], { cwd: temporary, env });
      await run('cl.exe', ['/nologo', '/O2', '/W4', `/Fo${join(temporary, 'launcher.obj')}`, `/Fe${target}`, join(root, 'scripts/native/launcher-windows.c'), join(temporary, 'launcher.res'), '/link', `/MACHINE:${arch === 'arm64' ? 'ARM64' : 'X64'}`, '/SUBSYSTEM:WINDOWS', '/DYNAMICBASE', '/NXCOMPAT', 'shell32.lib', 'user32.lib'], { cwd: temporary, env });
    }
    return layout;
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 5 }); }
}
