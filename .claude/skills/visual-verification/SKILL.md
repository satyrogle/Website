---
name: visual-verification
description: Browser-level completion gate for meaningful Dark Lattice frontend changes. Use after UI, CSS, responsive, animation, Three.js, shader, canvas, interaction or accessibility work. Requires rendered evidence rather than source-code confidence.
---

# Visual Verification

Compilation is not visual evidence.

If an official browser-testing skill/tool is available, use it for mechanics and use this file as the acceptance layer.

## 1. Discover real commands

Read project scripts/docs.

Do not assume:
- port,
- dev command,
- build command,
- browser framework.

## 2. Define expected result

Identify:
- requested behavior,
- what must remain unchanged,
- relevant reference/brief,
- important breakpoints,
- essential interactions.

## 3. Static/build checks

Run available:
- production build,
- lint,
- typecheck,
- relevant tests.

Use actual repository scripts.

## 4. Render

At minimum inspect:
- representative desktop,
- representative mobile.

Add more viewports when framing changes materially.

For scroll-driven hero work, capture meaningful narrative states.

## 5. Visual review

Inspect:
- hierarchy,
- composition,
- camera/crop,
- text wrapping,
- overlap/clipping,
- accidental scrollbars,
- contrast/readability,
- responsive recomposition,
- visual consistency with the requested direction.

If a reference exists, compare concrete mismatches.

## 6. Interaction

Exercise relevant:
- navigation,
- links/buttons,
- pointer response,
- scroll,
- keyboard focus/tab order,
- menus/overlays,
- touch-equivalent behavior.

Canvas must not accidentally block DOM interaction.

## 7. Motion/accessibility

Check:
- normal motion,
- `prefers-reduced-motion`,
- visible focus,
- semantic control behavior,
- essential meaning not only in motion/color.

Reduced motion must preserve the conceptual experience.

## 8. Three.js/WebGL

When changed:
- inspect console for runtime/shader/WebGL errors,
- validate canvas size/DPR,
- resize behavior,
- camera framing,
- asset errors,
- duplicate loops after remount,
- suspicious resource growth when lifecycle matters.

Use `renderer.info` as evidence where relevant.

## 9. No-WebGL/failure path

When the site depends materially on WebGL, verify or inspect the fallback path.

Company content/navigation must remain usable.

## 10. Result

Use:

```text
VERIFICATION: PASS

Build:
- <command> — exit 0

Browser:
- <viewport/state> — result
- ...
- console — result

Unverified:
- ...
```

Or:

```text
VERIFICATION: FAIL

Blocker:
- exact visible/runtime problem

Evidence:
- ...

Likely area:
- ...
```

Do not bury a failure below positive language.
