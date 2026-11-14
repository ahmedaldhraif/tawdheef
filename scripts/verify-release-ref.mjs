import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tag = process.env.RELEASE_TAG || '';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(tag) || tag !== `v${pkg.version}`) throw new Error('The release tag must match the reviewed package version.');
const git = args => { const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error('The reviewed release tag could not be resolved.'); return result.stdout.trim(); };
if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `refs/tags/${tag}^{commit}`])) throw new Error('The checkout is not the exact reviewed release tag.');
console.log(`Reviewed version tag ${tag} matches this checkout.`);
