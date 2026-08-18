# Constitution Section 13 audit, run before presenting

Date 2026-08-18, branch `claude/genesis`, high-end pass. Evidence:
`captures/` (real GPU, headed Chrome), `tools/quality.mjs` output 6/6,
build clean, zero console errors.

## Gate A: banned-pattern register

| # | Pattern | Result | Note |
|---|---|---|---|
| 4.1 | Harsh gradients | PASS | Only readability scrims (single hue to transparent) and physically motivated light inside the render |
| 4.2 | Generic icons | PASS | No icons anywhere; text and marks only |
| 4.3 | Pure white background | PASS | |
| 4.4 | Rainbow colouring | PASS | |
| 4.5 | Drop shadows | PASS | Separation by border, spacing, tone |
| 4.6 | Three feature cards | PASS | Editorial sequence, no card system |
| 4.7 | Emojis | PASS | |
| 4.8 | Glassmorphism | PASS | Panels are solid carbon; no blur anywhere |
| 4.9 | Em dashes | PASS | Swept; middle dots and colons carry rhythm |
| 4.10 | Inter/Geist/Space Grotesk | PASS | Archivo Variable + Fragment Mono, documented in docs/DECISION_FRAME.md section 6, self-hosted |
| 4.11 | Coloured left stripes | PASS | Numbered structure with hairlines |
| 4.12 | Fake social proof | PASS | No testimonials, logos, counts or metrics |
| 4.13 | Bento grids | PASS | |
| 4.14 | Decorative terminals | PASS | The ledger contains only true data from the running world; no window chrome, no typing simulation |
| 4.15 | "Not X, it is Y" | PASS | One rhetorical contrast survives in Desk42 copy ("You are not fighting the machine. You are the part of it that signs.") as a single load-bearing product statement, not a repeated device |
| 4.16 | Checkmark bullets | PASS | |
| 4.17 | Three pricing tiers | N/A | No pricing surface |
| 4.18 | Claims without demonstration | PASS | The central claim runs live behind the page; determinism proven by tools/quality.mjs replay test |
| 4.19 | Soft corner radius | PASS | Zero radius throughout |
| 4.20 | Purple-and-black | PASS | Violet reserved for correction semantics and currently unused |
| 4.21 | Missing loading states | PASS | Staged warm-up surfaced in the chip, world fades in formed, WebGL failure and context-loss states real |
| 4.22 | Decorative orbs | PASS | The volumetric form is the subject and the system; it responds to input and cannot be removed without removing the site |
| 4.23 | Dot grids | PASS | |
| 4.24 | Sparkle icons | PASS | |
| 4.25 | Animated arrows | PASS | Static SCROLL mark only |
| 4.26 | Missing Terms | PASS | terms.html, real text |
| 4.27 | Missing Privacy | PASS | privacy.html documents actual handling: none |
| 4.28 | Generic hover animation | PASS | Colour/border affordance on real controls only |
| 4.29 | Neon ambient | PASS | Cherenkov appears only on placed-mark data; field whites are lit material |
| 4.30 | Pastels | PASS | |

## Gate B: disguised equivalents

Open risk, recorded rather than argued away: an independent vision-model
read of the opening capture called the field "glowing smoke" and
pattern-matched "generic ShaderToy effect" while also judging the page
expensive and intentional. Structural mitigations present: height-field
lit material rather than additive glow, junction structure, survival of
the flat static-frame test, one converging constellation. A four-seed
sweep (7, 1187, 424242, 20260818) confirmed the shipped seed is the most
connected and least ring-forming. Jacob's eye decides; if he names a
kill word, the response is at premise level, not parameters.

No other element exists because modern sites usually include it. No
motion exists as polish; each animation states causality, state change
or entry.

## Gate C: evidence

Claims supported: live simulation, true agent count injected into copy,
true seed and tick in telemetry and ledger, replay determinism proven in
the tested environment, first action recorded under 500 ms. Limitations
visible: Desk42 described as a bounded causal slice; no benchmarks
published because none measured. Historical and active work separated.

## Gate D: interaction

The press reveals system behaviour and writes the record (touch,
pointer, and keyboard button all work). Scroll delivers scale change,
severity change and new information at every stop. Reduced motion keeps
all content, state and navigation. No purely decorative animation
remains.

## Gate E: production

Desktop, mobile 390px, reduced-motion, flat static-frame, and
WebGL-fallback still all captured or tested. Keyboard focus visible,
skip link present, one h1, landmarks and labels verified, anchors
resolve. Legal links in footer. Fonts self-hosted and preloaded, no
third-party requests. Console clean. Not done: a full screen-reader
session (NVDA/VoiceOver) has not been run; structure was smoke-tested
only.

## Section 14 scorecard

| Category | Score | Justification |
|---|---|---|
| Specificity | 2 | The page's form is its thesis: a merciless deterministic system, its ledger, and its law. Not transplantable |
| Evidence | 2 | The claim runs live; determinism and first-action proven by harness; honest limits stated |
| Composition | 1 | Editorial and typographic composition are authored; the opening field's coherence carries a recorded fresh-eyes risk that only Jacob can clear |
| Restraint | 2 | No decoration without function; semantic colours spent only on events |
| Interaction | 2 | Input reveals the system's behaviour and is permanently recorded |
| Legibility | 2 | Verified across desktop, mobile, reduced motion, no-WebGL and keyboard |

Total 11/12. Specificity 2, Evidence 2, Legibility 2, no automatic
failures. Required threshold met, subject to the cold audit below.

## Cold audit (dark-lattice-auditor), and the disposition of each finding

An independent cold audit returned FAIL with six findings. Disposition:

1. **Em dash in titles and og:title (4.9).** Accepted, fixed. All three
   pages now use "Dark Lattice: a systems studio" form.
2. **Colour law contradicted by the shader** (severity-driven cyan
   regrade vs "cyan only on live events"). Accepted as a documentation
   defect. The written law now states the truth: DOM cyan is event-only;
   the render's descent regrade is an authored observational grading
   tied to scroll, recorded as an intentional exception, never a claim
   of live deviation.
3. **Visible-primitives risk: the macro field reads as a few glossy
   tubes, not an immense field.** Accepted as real and OPEN. Two
   structural attempts were made (per-agent explorer split with a denser
   constellation; a 2048 world fabric) and both produced worse frames on
   capture. Both were reverted rather than tuned further, per the
   kill-word law: this is a premise-level composition question that only
   Jacob's eye can settle. The shipped field is the strongest state this
   direction has produced. If Jacob names it with a kill word, the
   response is at premise level.
4. **Mobile is a crop, not a recomposition.** Partially accepted. The
   different-world artifact is fixed: every device now runs the same
   262,144-agent world (weaker hardware runs it at half step rate and
   lower DPR, never a smaller world). Portrait deliberately frames the
   full funnel axis, the editorial layer recomposes to one column, and
   the mark interaction moves to the button. A bespoke portrait
   composition beyond this is future work and is recorded, not hidden.
5. **Generic fade reveal (cosmetic).** Considered, retained. Entry
   reveals direct attention and state at 14px/0.8s once per element,
   disabled under reduced motion. Recorded as an accepted convention.
6. **Silent press cooldown (cosmetic).** Accepted, fixed. A refused
   press now answers in the chip: STILL TAKING THE LAST MARK.

Scorecard positions the auditor scored lower (Specificity 1,
Composition 1, Restraint 1) all trace to findings 2 and 3. Finding 2 is
resolved; finding 3 is open and belongs to Jacob. The audit's clean
list (harness, radius/shadow/blur-free CSS, copy, legal, fallback,
DOM colour discipline) matches this document.
