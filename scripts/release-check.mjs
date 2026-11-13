import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPublicSource } from './release-files.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
checkPublicSource(root, { git: !process.argv.includes('--archive') }).then(result => console.log(JSON.stringify({ ok: true, ...result }, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
