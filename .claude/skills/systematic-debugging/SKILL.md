---
name: systematic-debugging
description: Diagnose bugs, regressions, build/test failures, DOM/TypeScript problems, CSS/layout faults, Three.js/WebGL errors, visual glitches and performance regressions before patching. Use whenever something is broken or previous fixes failed.
---

# Systematic Debugging

Do not guess-and-patch.

## 1. Reproduce

Record:
- exact symptom,
- expected behavior,
- actual behavior,
- command/action,
- viewport/environment if relevant,
- error/stack/log,
- whether deterministic.

If reproduction is missing, gather evidence before editing.

## 2. Scope

Inspect the smallest useful set:
- failing frame/file,
- immediate caller/callee,
- recent relevant diff,
- inputs/state at the failing boundary,
- browser console/network for frontend failures.

Use `repo-researcher` if the trace spans many modules.

## 3. Trace backward

Find the earliest incorrect assumption/state.

Common frontend causes:
- ownership/lifecycle,
- stale closure,
- incorrect Effect,
- async race,
- CSS containing block/stacking/overflow,
- wrong coordinate space,
- resize/camera error,
- duplicate loop/listener,
- shader/uniform mismatch,
- resource lifetime,
- configuration/version mismatch.

## 4. One falsifiable hypothesis

Use:

```text
I think X causes Y because Z.
If true, observing/changing A should produce B.
```

Run the smallest experiment.

Do not change several unrelated variables simultaneously.

## 5. Fix cause, not symptom

Reject fake fixes:
- swallowing exceptions,
- disabling checks,
- arbitrary timeout,
- random retry,
- `!important` as first response,
- endless z-index escalation,
- hardcoded viewport offsets,
- removing cleanup to stop a crash.

Use a workaround only for a real external constraint and document it.

## 6. Failed-fix rule

After two materially different failed fixes:
- stop editing,
- discard the current causal story,
- gather new evidence,
- re-map the relevant flow.

Do not stack a third patch on two disproven assumptions.

## 7. Verify fresh

Re-run the original reproduction.

Then verify the nearest regression surface:
- focused test → broader build,
- failing viewport → adjacent viewport,
- shader fix → console + resize,
- lifecycle fix → repeated mount/unmount,
- visual fix → screenshot.

## 8. Report

State only:
- root cause,
- correction,
- evidence,
- unverified environment/risk.
