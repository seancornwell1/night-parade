import { TUNING_DEFS, TUNING_KEYS, changedTuningText, resetTuning, setTuning, tuning, type TuningKey } from '../config/tuning';

// Hidden DOM panel with a slider for every tuning number.

const CSS = `
#tuning{position:fixed;inset:0;z-index:20;display:none;flex-direction:column;background:rgba(10,10,10,.92);color:#ddd;
  font:13px -apple-system,system-ui,sans-serif;touch-action:auto;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
#tuning.open{display:flex}
#tuning .bar{display:flex;gap:8px;padding:8px 12px;align-items:center;border-bottom:1px solid #333}
#tuning .bar strong{flex:1;font-size:15px}
#tuning button{font:inherit;font-size:14px;padding:8px 12px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#eee}
#tuning .body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 12px 24px;touch-action:pan-y}
#tuning h3{margin:14px 0 4px;font-size:13px;color:#999;text-transform:uppercase;letter-spacing:.05em}
#tuning .row{display:grid;grid-template-columns:minmax(150px,1fr) 2fr 64px;gap:10px;align-items:center;padding:5px 0}
#tuning .row small{display:block;color:#777;font-size:11px}
#tuning .row.changed span{color:#fff}
#tuning .row.changed output{color:#fff;font-weight:600}
#tuning input[type=range]{width:100%;height:28px;touch-action:auto}
#tuning output{text-align:right;font-variant-numeric:tabular-nums}
#tuning textarea{width:100%;box-sizing:border-box;height:110px;background:#111;color:#eee;border:1px solid #444;
  font:12px ui-monospace,Menlo,monospace;margin-top:6px}
`;

function decimals(step: number): number {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export class TuningPanel {
  private root: HTMLDivElement;
  private style: HTMLStyleElement;
  private textarea: HTMLTextAreaElement;
  private rows = new Map<TuningKey, { row: HTMLDivElement; input: HTMLInputElement; out: HTMLOutputElement }>();

  constructor(
    private onOpen: () => void,
    private onClose: () => void,
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = document.createElement('div');
    this.root.id = 'tuning';
    this.root.innerHTML = `
      <div class="bar"><strong>Tuning</strong>
        <button data-act="copy">Copy changes</button>
        <button data-act="reset">Reset all</button>
        <button data-act="close">Close</button></div>
      <div class="body"><textarea readonly></textarea></div>`;
    document.body.appendChild(this.root);
    this.textarea = this.root.querySelector('textarea')!;
    const body = this.root.querySelector('.body')!;

    let group = '';
    for (const key of TUNING_KEYS) {
      const def = TUNING_DEFS[key];
      if (def.group !== group) {
        group = def.group;
        const h = document.createElement('h3');
        h.textContent = group;
        body.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${def.label}<small>${key}</small></span><input type="range"><output></output>`;
      const input = row.querySelector('input')!;
      const out = row.querySelector('output')!;
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.addEventListener('input', () => {
        setTuning(key, Number(Number(input.value).toFixed(decimals(def.step))));
        this.refresh();
      });
      body.appendChild(row);
      this.rows.set(key, { row, input, out });
    }

    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset?.act;
      if (act === 'close') this.close();
      if (act === 'reset') {
        resetTuning();
        this.refresh();
      }
      if (act === 'copy') {
        this.textarea.select();
        navigator.clipboard?.writeText(this.textarea.value).catch(() => document.execCommand('copy'));
      }
    });
    this.refresh();
  }

  private refresh(): void {
    for (const [key, { row, input, out }] of this.rows) {
      const def = TUNING_DEFS[key];
      input.value = String(tuning[key]);
      out.textContent = tuning[key].toFixed(decimals(def.step));
      row.classList.toggle('changed', tuning[key] !== def.value);
    }
    this.textarea.value = changedTuningText();
  }

  open(): void {
    this.refresh();
    this.root.classList.add('open');
    this.onOpen();
  }

  close(): void {
    this.root.classList.remove('open');
    this.onClose();
  }

  destroy(): void {
    this.root.remove();
    this.style.remove();
  }
}
