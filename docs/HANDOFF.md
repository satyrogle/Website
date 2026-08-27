# Dark Lattice Genesis — handoff

Status: **HERO ONLY — OWNER RESET 2026-08-25**

Jacob explicitly removed the journey and interior from the live website. The
next approved work is the hero. Do not restore, redesign, or prototype anything
beyond the opening until Jacob asks for the next exact change.

## What exists now

- One live WebGL hero: the approved Split Spire opening.
- One fixed camera pose: position `[0, 10, 262]`, look `[0, 86, 0]`, FOV `45`.
- Hero heading and lede only.
- Wordmark, seed telemetry, privacy, terms, and contact links.
- Deterministic world behaviour and the existing restrained pointer response.
- Static WebGL fallback and reduced-motion behaviour.

## What does not exist in the live site

- no scroll journey or scroll director;
- no System, Desk42, Rule, Brawler, Technology, Studio, Return, or Contact stop;
- no crossing spacer, transfer veil, interior country, latent form, or return;
- no journey camera keys, interior geometry, latent-frame geometry, or journey
  review controls;
- no persistent ledger, section navigation, or journey capture script.

The historical story documents remain deferred reference material only. They
are not implementation authority while the hero-first reset is active:

- `docs/JOURNEY_AND_LATENT_FORM.md`
- `docs/THE_CROSSING_PLAN.md`

## Commands

```text
node node_modules/vite/bin/vite.js . --port 5180 --strictPort
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node tools/quality.mjs
node tools/e0-capture.mjs
```

Hero captures are written to `captures/e0/`. Do not use or regenerate the old
journey capture folders.

## Required workflow

1. Read this file before editing.
2. Take one narrowly named hero change from Jacob.
3. Preserve the approved camera and composition unless Jacob names one of them.
4. Typecheck, run the hero quality checks, and capture desktop/mobile proof.
5. Stop for Jacob's visual verdict.

Do not commit, push, package, add plugins, modify global configuration, or touch
another checkout without explicit permission.
