// Marisol Bay — the entry program for make.fun competition gta6-01.
// It hands the game in: copies game/ and screenshots/ from this repository
// into /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the vendored make.fun library, which summarizes
// the game for the judge. Node 22, standard library only, no network.
//
// Run it locally to preview the exact output the grader sees:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory holding this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });

// The whole static game: index.html, its modules, styles and the vendored
// three.js build. Plain files, no build step, no network request at runtime.
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots of the game itself, taken by its maker in a desktop browser.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier the judge reads: the same caps the gate enforces, so a local
// run refuses exactly what the scorer would refuse.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
