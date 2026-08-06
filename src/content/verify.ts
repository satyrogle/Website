import {
  CARRY_OVER,
  SCALABILITY_STATEMENT,
  SUPPORTED,
  LIMITS,
  GAME_STATES,
  FOUNDATION_LAYERS,
} from './evidence';

/**
 * Development-only factual integrity check.
 *
 * The narrative ships as static HTML so that it survives with JavaScript
 * disabled. That creates one real risk: the copy in the document can
 * drift away from the sourced record in `evidence.ts` during editing,
 * and a factual regression on this particular site is far more damaging
 * than a visual one.
 *
 * This compares what the document actually says against the checked
 * source data and reports any divergence in the console during
 * development. It is stripped from production builds by the
 * `import.meta.env.DEV` guard at the call site.
 */

interface Problem {
  where: string;
  detail: string;
}

function normalise(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase();
}

export function verifyEvidenceIntegrity(): void {
  const problems: Problem[] = [];

  // --- The eleven-row carry-over table ------------------------------
  const rows = Array.from(document.querySelectorAll('.ledger tbody tr'));

  if (rows.length !== CARRY_OVER.length) {
    problems.push({
      where: 'carry-over table',
      detail: `expected ${CARRY_OVER.length} rows, found ${rows.length}`,
    });
  }

  CARRY_OVER.forEach((row, index) => {
    const tr = rows[index];
    if (!tr) return;

    const area = normalise(tr.querySelector('th')?.textContent);
    const stated = normalise(tr.querySelector('.ledger__range')?.textContent);

    if (area !== normalise(row.area)) {
      problems.push({
        where: `carry-over row ${index + 1}`,
        detail: `area is "${area}", source says "${normalise(row.area)}"`,
      });
    }
    if (stated !== normalise(row.stated)) {
      problems.push({
        where: `carry-over row ${index + 1} (${row.area})`,
        detail: `range is "${stated}", source says "${normalise(row.stated)}"`,
      });
    }

    // The bar must encode the same numbers it sits beside.
    const bar = tr.querySelector<HTMLElement>('.ledger__band > span');
    if (bar) {
      const left = parseFloat(bar.style.left);
      const width = parseFloat(bar.style.width);
      const expectedLeft = row.low === row.high ? 0 : row.low;
      const expectedWidth = row.low === row.high ? 100 : row.high - row.low;
      if (left !== expectedLeft || width !== expectedWidth) {
        problems.push({
          where: `carry-over row ${index + 1} (${row.area})`,
          detail: `bar is ${left}%+${width}%, source implies ${expectedLeft}%+${expectedWidth}%`,
        });
      }
    }
  });

  // --- Scalability statement, reproduced verbatim -------------------
  const quote = normalise(document.querySelector('.boundary__pull blockquote')?.textContent);
  if (quote !== normalise(SCALABILITY_STATEMENT)) {
    problems.push({
      where: 'scalability statement',
      detail: 'blockquote does not match the sourced wording verbatim',
    });
  }

  // --- Claim counts --------------------------------------------------
  const supported = document.querySelectorAll('.boundary__col--supported .claims li').length;
  const limits = document.querySelectorAll('.boundary__col--limits .claims li').length;

  if (supported !== SUPPORTED.length) {
    problems.push({
      where: 'supported claims',
      detail: `document lists ${supported}, source has ${SUPPORTED.length}`,
    });
  }
  if (limits !== LIMITS.length) {
    problems.push({
      where: 'limits',
      detail: `document lists ${limits}, source has ${LIMITS.length}`,
    });
  }

  // --- Game states and foundation layers ----------------------------
  GAME_STATES.forEach((state) => {
    const el = document.querySelector(`[data-movement="${state.id}"]`);
    if (!el) {
      problems.push({ where: `game state ${state.id}`, detail: 'movement section missing' });
      return;
    }
    const name = normalise(el.querySelector('.state__name')?.textContent);
    const role = normalise(el.querySelector('.state__role')?.textContent);
    if (name !== normalise(state.name)) {
      problems.push({ where: `game state ${state.id}`, detail: `name is "${name}"` });
    }
    if (role !== normalise(state.role)) {
      problems.push({ where: `game state ${state.id}`, detail: `role is "${role}"` });
    }
  });

  const panels = document.querySelectorAll('[data-layer-panel]');
  if (panels.length !== FOUNDATION_LAYERS.length) {
    problems.push({
      where: 'foundation layers',
      detail: `document has ${panels.length} panels, source has ${FOUNDATION_LAYERS.length}`,
    });
  }

  // --- Prohibited wording -------------------------------------------
  // Language explicitly ruled out by the claim-ladder guardrails.
  const bodyText = normalise(document.body.textContent);
  const forbidden = [
    'dark lattice engine',
    'one proprietary engine',
    'production-ready',
    'market validated',
    'guaranteed revenue',
    'no competitors',
    'impossible to copy',
    'unique in the world',
  ];
  forbidden.forEach((phrase) => {
    // "not one proprietary engine" and similar negations are the point
    // of the limits column, so only flag an unqualified assertion.
    const index = bodyText.indexOf(phrase);
    if (index === -1) return;
    // Look back to the start of the sentence: "it is not described as
    // near-complete, production-ready or market-validated" is the limits
    // column doing its job, not a prohibited assertion.
    const preceding = bodyText.slice(Math.max(0, index - 120), index);
    if (/\b(not|never|no|do not|does not|nor)\b[^.]*$/.test(preceding)) return;
    problems.push({ where: 'prohibited wording', detail: `document contains "${phrase}"` });
  });

  if (problems.length === 0) {
    console.info('[dark-lattice] evidence integrity: OK');
    return;
  }

  console.group(`[dark-lattice] evidence integrity: ${problems.length} problem(s)`);
  problems.forEach((p) => console.warn(`${p.where} — ${p.detail}`));
  console.groupEnd();
}
