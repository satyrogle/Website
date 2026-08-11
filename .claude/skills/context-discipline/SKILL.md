---
name: context-discipline
description: Keep Claude Code grounded, efficient and concise during repository exploration, complex implementation, long sessions and ambiguous work. Use when context is growing, many files/logs are involved, the task spans multiple systems, or accuracy depends on distinguishing verified facts from assumptions.
---

# Context Discipline

Optimize for correctness per useful token.

## 1. Size the task

### Local
Target is obvious.

1. Read the target and immediate dependencies.
2. Edit.
3. Verify.
4. Stop.

Do not scan the repository.

### Scoped investigation
Relevant owner is unclear.

1. Search symbols, strings, imports, routes and filenames.
2. Read strongest matches.
3. Trace one path.
4. Stop once enough evidence exists to act.

### Wide investigation
Architecture/root cause spans many files.

Delegate to `repo-researcher`.

Ask for:
- relevant paths,
- flow,
- constraints,
- evidence,
- unknowns,
- implementation entry point.

Do not copy dozens of source files into the parent context.

## 2. Map truth explicitly

For non-trivial work, classify important claims:

```text
KNOWN     verified in code/config/docs/tool output
INFERRED  strongly suggested but not directly verified
UNKNOWN   required fact not established
```

Never implement a critical dependency on an `UNKNOWN`.

Resolve it by inspection or authoritative documentation.

Do not turn every trivial fact into a label; use this where mistaken assumptions could change implementation.

## 3. YAGNI ladder

Before adding code, abstraction or dependency:

1. Does this need to exist to meet acceptance?
2. Can the language/browser/platform already do it?
3. Does an installed dependency already do it?
4. Can the existing project primitive be extended?
5. Can it remain a simple local implementation?
6. Only then add the minimum new mechanism.

Never use YAGNI to remove:
- validation at trust boundaries,
- data-integrity checks,
- necessary error handling,
- accessibility,
- required cleanup/security.

## 4. Control context

Prefer:
- `rg`/search,
- targeted file ranges,
- concise command output,
- isolated subagents,
- project config,
- primary docs for current APIs.

Avoid unless directly relevant:
- `node_modules`,
- build artifacts,
- generated/minified files,
- whole lockfiles,
- full test logs,
- huge Git history,
- whole reference manuals.

If a helper script exposes `--help`, use that before reading its implementation.

## 5. Execution contract

For a complex task, establish only:

```text
Goal:
Constraints:
Acceptance:
Non-goals:
```

Do not create a plan document for a local edit.

## 6. Prevent drift

Do not:
- repeat the request,
- create multiple competing plans,
- keep explaining disproven approaches,
- broaden scope while fixing a local issue,
- add generic commentary after every command.

If two materially different fixes fail, stop editing and gather new evidence.

## 7. Long tasks

Maintain compact state:

```text
Goal:
Decisions:
Files changed:
Verification:
Known failure:
Next action:
```

Update only when something changes.

Start a new session for unrelated work.

## 8. Output

For coding work, report:
- change,
- location,
- evidence,
- blocker/risk.

Nothing else unless it materially helps.
