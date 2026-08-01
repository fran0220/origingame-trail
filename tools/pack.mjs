/* Build the deployable directory.
 *
 * There is still no bundler and no transform: this only decides what ships.
 * The distinction matters more here than in a project with a build step,
 * because the repository root contains a capture harness, README screenshots
 * and a Playwright dependency, none of which belong in a game the platform
 * will turn into an offline-capable PWA.
 *
 * Usage:  node tools/pack.mjs [outDir]
 */
import { cpSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'dist';

/* An allowlist, not an ignore list. A new directory at the repository root
 * should have to be named before it can end up in a player's download. */
const SHIP = ['index.html', 'src', 'vendor'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of SHIP) {
  cpSync(entry, join(OUT, entry), { recursive: true });
}

let files = 0, bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else { files++; bytes += st.size; }
  }
};
walk(OUT);

console.log(`${OUT}/  ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(SHIP.map((s) => `  ${s}`).join('\n'));
