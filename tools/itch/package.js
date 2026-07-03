// Zips the itch.io build (dist-itch/, produced by `npm run build:itch`) into a
// single archive ready to upload as an HTML5 project on itch.io. See
// docs/itch-io.md for the full publish workflow.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const buildDir = resolve(root, 'dist-itch');
const zipPath = resolve(root, 'peak-district-downhill-itch.zip');

if (!existsSync(buildDir)) {
  console.error('dist-itch/ not found — run `npm run build:itch` first.');
  process.exit(1);
}

rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', zipPath, '.'], { cwd: buildDir, stdio: 'inherit' });

console.log(`\nWrote ${zipPath}`);
console.log('Upload this file on itch.io as an HTML5 project (see docs/itch-io.md).');
