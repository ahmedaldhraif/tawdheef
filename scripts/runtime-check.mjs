import { access } from 'node:fs/promises';
import { join } from 'node:path';

export async function coreInstalled(root, prebuilt = false) {
  const entries = ['express/package.json', '@modelcontextprotocol/sdk/package.json', ...(!prebuilt ? ['vite/bin/vite.js', 'react/package.json'] : [])];
  for (const entry of entries) try { await access(join(root, 'node_modules', entry)); } catch { return false; }
  return true;
}
