import { readFileSync } from 'node:fs';

// Public build metadata only. No device identifier or analytics request.
export const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
