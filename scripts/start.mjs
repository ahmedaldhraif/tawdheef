import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { runtimeEnvironment } from './runtime-env.mjs';
import { coreInstalled } from './runtime-check.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Install Node.js 26 LTS from https://nodejs.org/en/download, then open Tawdheef again.'); process.exit(1); }
if (process.argv.includes('--help')) { console.log('Start Tawdheef: npm start\nInstalls missing dependencies, builds when files change, and opens the local app. Add -- --no-open to keep the browser closed.'); process.exit(0); }
if (process.argv.slice(2).some(arg => arg !== '--no-open')) { console.error('Only --no-open is supported.'); process.exit(1); }
const prebuilt = existsSync(resolve(root, 'tawdheef-app.json'));
const installed = await coreInstalled(root, prebuilt);
if (!installed) {
  if (prebuilt) { console.error('This app package is incomplete. Download and extract a fresh package. Your private data was not changed.'); process.exit(1); }
  console.log('First launch: installing locked dependencies. This needs an internet connection.');
  const setup = spawnSync(process.execPath, [resolve(root, 'scripts/setup.mjs'), '--no-build', '--quiet'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (setup.status !== 0) process.exit(setup.status || 1);
}
try { const { ensureBuild } = await import('./build.mjs'); await ensureBuild(); }
catch (error) { console.error(error.message); process.exit(1); }
const start=spawnSync(process.execPath,[resolve(root,'scripts/background.mjs'),'start'],{cwd:root,env:runtimeEnvironment(),stdio:'inherit',windowsHide:true});
if(start.status!==0)process.exit(start.status||1);
const url=`http://127.0.0.1:${process.env.APPLY_TRACKER_PORT||4000}`;
console.log(`Tawdheef is open: ${url}\nOpen Connections to choose your accounts. Your agent can follow docs/FIRST-RUN.md.\nStop the background app with npm run background:stop.`);
if (process.argv.includes('--no-open')) process.exit(0);
const args=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
const browser=spawn(args[0],args[1],{env:runtimeEnvironment(),stdio:'ignore',detached:true,windowsHide:true});browser.on('error',()=>{});browser.unref();
