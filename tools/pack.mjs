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
/* Back to three entries, and it should never grow again.
 *
 * This briefly read ['index.html', 'src', 'vendor', 'media/lake-assets'],
 * because the lake had acquired a scanned PBR ground and eleven families of
 * glTF plants and could not boot without 57 MB of them. Adding them to the
 * allowlist made the deploy work and made the project's first claim false;
 * they are gone now and so is the entry.
 *
 * A new line here is a signal, not a chore: this game generates every texture,
 * mesh and sound in code, so anything that needs shipping alongside the source
 * is either a mistake or a change of principle. */
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
