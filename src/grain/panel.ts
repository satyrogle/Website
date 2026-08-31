/**
 * A dev tuning panel, hand rolled.
 *
 * No dependency: this is ten range inputs on a probe page, and the one rule
 * that has cost this project real money is to not install things it does not
 * demonstrably need. Tweakpane would be the choice if this grew.
 *
 * The point of it is not convenience. Every composition failure today came
 * from me changing a number, screenshotting, and guessing at the result from a
 * 450 pixel image. Jacob has the eye. This puts the numbers under his hand and
 * takes the judging away from me.
 *
 * "copy settings" puts the current values on the clipboard so they can be
 * pasted back and baked in as the committed defaults.
 */
export interface Field {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** rebuilding the mass field is expensive; camera and light are not */
  heavy?: boolean;
}

export interface Group {
  title: string;
  fields: Field[];
}

const CSS = `
#tune{position:fixed;top:0;right:0;width:270px;max-height:100vh;overflow-y:auto;
 background:rgba(4,6,8,.88);border-left:1px solid #1e242b;padding:10px 12px 40px;
 font:11px ui-monospace,Menlo,monospace;color:#c3cbd4;z-index:10}
#tune h3{margin:14px 0 6px;font-size:10px;letter-spacing:.16em;color:#5d6874;
 font-weight:400;text-transform:uppercase}
#tune label{display:block;margin:7px 0 2px;display:flex;justify-content:space-between}
#tune label span:last-child{color:#7f8b98}
#tune input[type=range]{width:100%;accent-color:#8fa2b4;height:14px}
#tune button{width:100%;margin-top:14px;padding:7px;background:#12171d;color:#c3cbd4;
 border:1px solid #29313a;cursor:pointer;font:inherit;letter-spacing:.08em}
#tune button:hover{background:#1a2028}
#tune .hint{color:#4d5560;margin-top:10px;line-height:1.5}
`;

export function buildPanel(
  groups: Group[],
  params: Record<string, number>,
  onChange: (key: string, heavy: boolean) => void,
  storageKey: string,
): void {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      Object.assign(params, JSON.parse(saved) as Record<string, number>);
    } catch {
      /* a corrupt save must never stop the scene loading */
    }
  }

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'tune';

  const readouts = new Map<string, HTMLElement>();

  for (const g of groups) {
    const h = document.createElement('h3');
    h.textContent = g.title;
    root.appendChild(h);

    for (const f of g.fields) {
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = f.label;
      const val = document.createElement('span');
      val.textContent = String(params[f.key]);
      readouts.set(f.key, val);
      label.append(name, val);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(f.min);
      input.max = String(f.max);
      input.step = String(f.step);
      input.value = String(params[f.key]);
      input.addEventListener('input', () => {
        params[f.key] = Number(input.value);
        val.textContent = input.value;
        localStorage.setItem(storageKey, JSON.stringify(params));
        onChange(f.key, !!f.heavy);
      });

      root.append(label, input);
    }
  }

  const copy = document.createElement('button');
  copy.textContent = 'copy settings';
  copy.addEventListener('click', async () => {
    const text = JSON.stringify(params, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'copied';
    } catch {
      // clipboard is blocked on some contexts: fall back to a selectable dump
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'width:100%;height:120px;background:#0a0e12;color:#c3cbd4;border:1px solid #29313a';
      root.appendChild(ta);
      ta.select();
      copy.textContent = 'select and copy';
    }
    setTimeout(() => (copy.textContent = 'copy settings'), 1600);
  });

  const reset = document.createElement('button');
  reset.textContent = 'reset';
  reset.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    location.reload();
  });

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Settings persist across reloads. Copy them and paste them back to have them baked in as the defaults.';

  root.append(copy, reset, hint);
  document.body.appendChild(root);

  // keep the readouts honest if anything changes params from code
  (window as unknown as { __grainSync: () => void }).__grainSync = () => {
    for (const [k, el] of readouts) el.textContent = String(params[k]);
  };
}
