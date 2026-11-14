/** Shared public source boundary for Git review and downloadable archives. */
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';

export const publicRoots = ['src', 'server', 'bin', 'scripts', 'data', 'docs', 'skills', 'directories', 'website', 'public', 'tests', '.github', '.agents/skills', '.claude/skills'];
export const publicFiles = ['package.json', 'package-lock.json', 'index.html', 'vite.config.mjs', 'vercel.json', 'playwright.config.mjs', 'skills-lock.json', 'AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'Start Apply Tracker.cmd', 'Start Tawdheef.cmd', 'Start Tawdheef.command', 'start-tawdheef.sh', '.gitignore', '.gitattributes', '.nvmrc', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'llms.txt', 'SECURITY.md', 'CHANGELOG.md', '.agents/product-marketing.md'];
const privatePath = /(^|\/)(?:\.local|\.git|node_modules|outputs|release|agent-config|dist|site-dist|test-results|playwright-report|__pycache__)(\/|$)|(^|\/)\.env|(^|\/)(?:credentials[^/]*|client_secret[^/]*|connections\.private|token-cache|selected-account)\.json$|\.(?:sqlite[^/]*|db(?:3|-wal|-shm)?|log|pem|key|zip)$/i;
// Country sources are versioned once. Download packs regenerate these copies.
const generatedDirectoryFile = /^directories\/[^/]+\/[^/]+-directory(?:-\d+)?\.(?:json|csv)$/i;
const generatedDownload = /^public\/downloads(?:\/|$)/i;
export function isPublicSource(path) {
  const name = path.replaceAll('\\', '/');
  return !name.split('/').some(part => part === '..') && !privatePath.test(name) && !generatedDirectoryFile.test(name) && !generatedDownload.test(name) &&
    (publicFiles.includes(name) || publicRoots.some(root => name.startsWith(`${root}/`)));
}
export async function sourceFiles(root) {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const name = `${path}/${entry.name}`;
      if (privatePath.test(name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Public source must not include a symbolic link: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && isPublicSource(name)) files.push(name);
    }
  }
  for (const path of publicRoots) {
    try {
      if ((await lstat(join(root, path))).isSymbolicLink()) throw new Error(`Public source root must not be a link: ${path}`);
      await walk(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const path of publicFiles) {
    try {
      const info = await lstat(join(root, path));
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid public source file: ${path}`);
      files.push(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return [...new Set(files)].sort();
}
export async function checkPublicSource(root, { git = true } = {}) {
  const files = await sourceFiles(root), findings = [];
  if (git) {
    const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('Run release:check inside a Git checkout, or use the archive verifier for a downloaded ZIP.');
    for (const path of result.stdout.split('\0').filter(Boolean)) if (!isPublicSource(path)) findings.push(`${path}: outside the public source boundary`);
  }
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{40,}|AIza[A-Za-z0-9_-]{35})\b/,
    /["'](?:refresh_token|access_token|client_secret)["']\s*:\s*["'][A-Za-z0-9_\/.+=-]{32,}["']/,
  ];
  const userProfile = process.env.USERPROFILE?.replaceAll('\\', '/');
  let bytes = 0;
  for (const file of files) {
    const buffer = await readFile(join(root, file)); bytes += buffer.length;
    if (!/\.(?:mjs|js|jsx|json|md|txt|html|css|yml|yaml|toml|csv|py|cmd|sh|command)$/.test(file) && !publicFiles.includes(file)) continue;
    const content = buffer.toString('utf8');
    if (secretPatterns.some(pattern => pattern.test(content))) findings.push(`${file}: possible embedded credential (value withheld)`);
    if (userProfile && content.replaceAll('\\\\', '/').replaceAll('\\', '/').includes(`${userProfile}/`)) findings.push(`${file}: contains this computer's private profile path`);
  }
  if (findings.length) throw new Error(`Public release check failed:\n${findings.join('\n')}`);
  return { files: files.length, bytes, checks: ['public source boundary', 'no linked source files', 'credential signatures', 'private profile paths'], limits: 'Pattern checks do not replace review of new data and assets.' };
}
export async function sourceArchive(root, { prefix = 'tawdheef', paths } = {}) {
  const zip = new JSZip();
  for (const path of paths || await sourceFiles(root)) {
    if (!isPublicSource(path)) throw new Error(`Refusing non-public source: ${path}`);
    zip.file(`${prefix}/${path}`, await readFile(join(root, path)), { date: new Date('2026-01-01T00:00:00Z'), unixPermissions: /\.(command|sh)$/.test(path) ? 0o100755 : 0o100644 });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
}
