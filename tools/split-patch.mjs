/**
 * split-patch.mjs — take a unified diff and keep only the chosen hunks.
 *
 * Written to land one session's work as commits that each describe one thing.
 * Several files here carry edits from more than one phase — the crust shader
 * holds both the P3 material pass and the P4 lighting pass — and squashing
 * them into one commit would make the history unable to answer "revert the
 * lighting, keep the material", which is exactly how this project works.
 *
 * Every filtered patch is applied to the PRISTINE original rather than on top
 * of a previously filtered one. Sequential application fails: with three lines
 * of context, a later hunk's context can include a line an earlier hunk
 * rewrote, and the match is then against text that no longer exists. Building
 * each intermediate state from HEAD sidesteps that entirely — and the commit
 * after it simply restores the final file, so its diff is whatever is left.
 *
 *   node tools/split-patch.mjs <patch> <1-indexed hunk numbers, comma sep>
 */

import { readFile } from 'node:fs/promises';

const [patchPath, list] = process.argv.slice(2);
if (!patchPath || !list) {
  console.error('usage: split-patch.mjs <patch> <hunks, e.g. 1,4,5>');
  process.exit(1);
}

const wanted = new Set(list.split(',').map((n) => Number(n.trim())));
const lines = (await readFile(patchPath, 'utf8')).split('\n');

const header = [];
const hunks = [];
let current = null;

for (const line of lines) {
  if (line.startsWith('@@')) {
    current = [line];
    hunks.push(current);
    continue;
  }
  if (current) current.push(line);
  else header.push(line);
}

const kept = hunks.filter((_, i) => wanted.has(i + 1));
if (!kept.length) {
  console.error(`no hunks matched (file has ${hunks.length})`);
  process.exit(1);
}

// Always terminate. Dropping the last newline leaves a context line without
// its terminator, and git reports that as "corrupt patch" rather than as a
// missing byte — which is a long way to look for one character.
const out = [...header, ...kept.flat()].join('\n');
process.stdout.write(out.endsWith('\n') ? out : `${out}\n`);
