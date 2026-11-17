// Keyboard layer: command palette (⌘K, /), help (?), list nav (j/k), post nav ([ ]),
// go-to sequences (g h/w/p/c/n) and theme (t). No dependencies.

type Head = { t: string; s: string };
type Idx = {
  posts: { title: string; url: string; date: string; description: string; tags: string[]; headings: Head[] }[];
  pages: { title: string; url: string }[];
};
type Item = {
  g: string; // group label
  t: string; // title
  r?: string; // right-hand text (date / key hint)
  x?: string[]; // extra searchable fields (lower weight)
  hd?: Head[]; // headings (lower weight, deep-linked)
  u?: string; // destination
  run?: (it: Item) => boolean | void; // return true to keep the palette open
  el?: HTMLElement;
  ix?: number[];
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘ K' : 'Ctrl K';
const GITHUB = 'https://github.com/fsalas07/fsalas07.github.io';
const LS = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};

/* ---------- fuzzy matching ---------- */
const wordStart = (t: string, i: number) => i === 0 || /[^a-z0-9]/.test(t[i - 1]);

/** Substring match (scored high), or in-order subsequence when `loose`. */
function fz(q: string, s: string, loose: boolean): { n: number; ix: number[] } | null {
  const t = s.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) {
    return {
      n: 100 + (wordStart(t, at) ? 20 : 0) - at * 0.1 - (t.length - q.length) * 0.05,
      ix: Array.from({ length: q.length }, (_, i) => at + i),
    };
  }
  if (!loose) return null;
  const ix: number[] = [];
  let n = 0;
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] !== q[j]) continue;
    n += 1 + (ix.length && i === ix[ix.length - 1] + 1 ? 4 : 0) + (wordStart(t, i) ? 5 : 0);
    ix.push(i);
    j++;
  }
  return j === q.length && ix[j - 1] - ix[0] <= q.length * 2 + 2 ? { n: n - ix[0] * 0.1 - (ix[ix.length - 1] - ix[0]) * 0.2, ix } : null;
}

/** Score an item against whitespace-separated terms; null if any term misses. */
function match(terms: string[], it: Item): { n: number; ix: number[]; u?: string; r?: string } | null {
  let n = 0;
  const ix: number[] = [];
  let u: string | undefined;
  let r: string | undefined;
  for (const q of terms) {
    const a = fz(q, it.t, true);
    if (a) { n += a.n; ix.push(...a.ix); continue; }
    let b = 0;
    for (const x of it.x ?? []) b = Math.max(b, (fz(q, x, false)?.n ?? 0) * 0.3);
    for (const h of it.hd ?? []) {
      const m = fz(q, h.t, false);
      if (m && m.n * 0.4 > b) { b = m.n * 0.4; u = `${it.u}#${h.s}`; r = '§ ' + h.t; }
    }
    if (!b) return null;
    n += b;
  }
  return { n, ix, u, r };
}

/* ---------- palette ---------- */
function initPalette() {
  const dlg = $<HTMLDialogElement>('palette');
  const input = $<HTMLInputElement>('pal-input');
  const list = $('pal-list');
  if (!dlg || !input || !list) return;

  let idx: Idx | null = null;
  let loading: Promise<void> | null = null;
  let items: Item[] = [];
  let sel = 0;
  let prevFocus: Element | null = null;

  const load = () =>
    (loading ??= fetch('/search.json')
      .then((r) => r.json())
      .then((d: Idx) => { idx = d; if (dlg.open) update(); })
      .catch(() => { loading = null; }));

  const path = () => location.pathname.replace(/\/?$/, '/');
  const close = () => dlg.close();
  const go = (u: string, newTab = false) => {
    if (newTab || /^https?:/.test(u)) window.open(u, '_blank', 'noopener');
    else location.assign(u);
  };

  const actions = (): Item[] => [
    { g: 'Actions', t: 'Toggle theme', r: 't', x: ['dark light mode appearance'], run: () => { (window as any).toggleTheme?.(); } },
    {
      g: 'Actions', t: 'Copy link to this page', x: ['url share clipboard'],
      run: (it) => {
        const done = (m: string) => {
          const r = it.el?.querySelector('.pal-r');
          if (r) r.textContent = m;
          setTimeout(close, 700);
        };
        navigator.clipboard.writeText(location.href).then(() => done('Copied'), () => done('Failed'));
        return true;
      },
    },
    { g: 'Actions', t: 'Go to RSS', r: '/rss.xml', x: ['feed subscribe atom'], u: '/rss.xml' },
    { g: 'Actions', t: 'View source on GitHub', x: ['code repository repo'], u: GITHUB },
    { g: 'Actions', t: 'Print / save as PDF', x: ['export'], run: () => { setTimeout(() => window.print(), 80); } },
    { g: 'Actions', t: 'Go home', r: 'g h', x: ['index start'], u: '/' },
  ];

  const postItems = (g: string): Item[] =>
    (idx?.posts ?? []).map((p) => ({
      g, t: p.title, r: p.date, u: p.url, x: [p.description, ...p.tags], hd: p.headings,
    }));

  function compute(q: string): Item[] {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      let recent: { t: string; u: string }[] = [];
      try { recent = JSON.parse(LS.get('recent') ?? '[]'); } catch { /* ignore */ }
      return [
        ...actions(),
        ...recent.filter((x) => x.u !== path()).map((x) => ({ g: 'Recent', t: x.t, u: x.u })),
        ...postItems('Latest writing').slice(0, 5),
      ];
    }
    const out: Item[] = [];
    const caps: Record<string, number> = { Actions: 6, Pages: 5, Writing: 8 };
    const pool: Item[] = [
      ...actions(),
      ...(idx?.pages ?? []).map((p) => ({ g: 'Pages', t: p.title, u: p.url })),
      ...postItems('Writing'),
    ];
    for (const g of ['Actions', 'Pages', 'Writing']) {
      const hits: { it: Item; n: number }[] = [];
      for (const it of pool) {
        if (it.g !== g) continue;
        const m = match(terms, it);
        if (m) hits.push({ it: { ...it, ix: m.ix, u: m.u ?? it.u, r: m.r ?? it.r }, n: m.n });
      }
      hits.sort((a, b) => b.n - a.n);
      out.push(...hits.slice(0, caps[g]).map((h) => h.it));
    }
    return out;
  }

  function mark(el: HTMLElement, text: string, ix: number[] = []) {
    const set = new Set(ix);
    let buf = '';
    let on = false;
    const flush = () => {
      if (!buf) return;
      if (on) { const m = document.createElement('mark'); m.textContent = buf; el.append(m); }
      else el.append(buf);
      buf = '';
    };
    for (let i = 0; i < text.length; i++) {
      if (set.has(i) !== on) { flush(); on = !on; }
      buf += text[i];
    }
    flush();
  }

  function update() {
    items = compute(input!.value);
    sel = 0;
    list!.textContent = '';
    let box: HTMLElement | null = null;
    let last = '';
    items.forEach((it, i) => {
      if (it.g !== last) {
        last = it.g;
        box = document.createElement('div');
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', it.g);
        const h = document.createElement('div');
        h.className = 'pal-g';
        h.setAttribute('aria-hidden', 'true');
        h.textContent = it.g;
        box.append(h);
        list!.append(box);
      }
      const o = document.createElement('div');
      o.className = 'pal-o';
      o.id = 'pal-o' + i;
      o.setAttribute('role', 'option');
      const t = document.createElement('span');
      t.className = 'pal-t';
      mark(t, it.t, it.ix);
      o.append(t);
      if (it.r) {
        const r = document.createElement('span');
        r.className = 'pal-r';
        r.textContent = it.r;
        o.append(r);
      }
      o.addEventListener('click', (e) => choose(i, e.metaKey || e.ctrlKey));
      o.addEventListener('mousemove', () => { if (sel !== i) pick(i, false); });
      it.el = o;
      box!.append(o);
    });
    if (!items.length) {
      const e = document.createElement('div');
      e.className = 'pal-empty';
      e.textContent = loading && !idx ? 'Loading…' : 'No results';
      list!.append(e);
    }
    pick(0, true);
  }

  function pick(i: number, scroll: boolean) {
    items[sel]?.el?.setAttribute('aria-selected', 'false');
    sel = i;
    const el = items[i]?.el;
    if (!el) { input!.removeAttribute('aria-activedescendant'); return; }
    el.setAttribute('aria-selected', 'true');
    input!.setAttribute('aria-activedescendant', el.id);
    if (scroll) {
      if (i === 0) list!.scrollTop = 0;
      else el.scrollIntoView({ block: 'nearest' });
    }
  }

  function choose(i: number, newTab = false) {
    const it = items[i];
    if (!it) return;
    if (it.run) {
      if (it.run(it) === true) return;
      close();
    } else if (it.u) {
      go(it.u, newTab);
      if (newTab || /^https?:/.test(it.u)) close();
    }
  }

  const open = () => {
    if (dlg.open) { input.focus(); return; }
    prevFocus = document.activeElement;
    input.value = '';
    dlg.showModal();
    input.setAttribute('aria-expanded', 'true');
    update();
    input.focus();
    load();
  };
  const toggle = () => (dlg.open ? close() : open());
  (window as any).__palette = { open, toggle };

  dlg.addEventListener('close', () => {
    input.setAttribute('aria-expanded', 'false');
    if (prevFocus instanceof HTMLElement && prevFocus.isConnected) prevFocus.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  input.addEventListener('input', update);
  dlg.addEventListener('keydown', (e) => {
    const n = items.length;
    const down = e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n');
    const up = e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p');
    if (down || up) {
      e.preventDefault();
      if (n) pick((sel + (down ? 1 : -1) + n) % n, true);
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      choose(sel, e.metaKey || e.ctrlKey);
    }
  });

  // Remember visited pages (last 5).
  if (!document.title.startsWith('404')) {
    try {
      const rec: { t: string; u: string }[] = JSON.parse(LS.get('recent') ?? '[]');
      const u = path();
      const next = [{ t: document.title.replace(/ — .*$/, ''), u }, ...rec.filter((x) => x.u !== u)].slice(0, 5);
      LS.set('recent', JSON.stringify(next));
    } catch { /* ignore */ }
  }
}

/* ---------- help overlay ---------- */
const HELP: [string, [string, string][]][] = [
  ['Search', [[MOD, 'Open command palette'], ['/', 'Search']]],
  ['In the palette', [['↑ ↓', 'Move selection'], ['Ctrl N|Ctrl P', 'Move selection'], ['↵', 'Open'], ['Esc', 'Close']]],
  ['Lists', [['j', 'Next item'], ['k', 'Previous item'], ['↵', 'Open focused item']]],
  ['Posts', [['[', 'Older post'], [']', 'Newer post']]],
  ['Go to', [['g h', 'Home'], ['g w', 'Writing'], ['g p', 'Projects'], ['g c', 'CV'], ['g n', 'Now']]],
  ['Other', [['t', 'Toggle theme'], ['?', 'Show this help']]],
];

function buildHelp(dlg: HTMLDialogElement) {
  const body = dlg.querySelector('tbody')!;
  for (const [sec, rows] of HELP) {
    const h = body.insertRow();
    const th = document.createElement('th');
    th.colSpan = 2;
    th.scope = 'colgroup';
    th.textContent = sec;
    h.append(th);
    for (const [keys, desc] of rows) {
      const tr = body.insertRow();
      const k = tr.insertCell();
      keys.split('|').forEach((alt, i) => {
        if (i) k.append(' / ');
        alt.split(' ').forEach((key) => {
          const kbd = document.createElement('kbd');
          kbd.textContent = key;
          k.append(kbd);
        });
      });
      tr.insertCell().textContent = desc;
    }
  }
}

/* ---------- global shortcuts ---------- */
function init() {
  initPalette();
  const palette = () => (window as any).__palette as { open(): void; toggle(): void } | undefined;
  const help = $<HTMLDialogElement>('kb-help');
  let built = false;
  const openHelp = () => {
    if (!help) return;
    if (!built) { buildHelp(help); built = true; }
    help.showModal();
  };
  help?.addEventListener('click', (e) => { if (e.target === help) help.close(); });

  // Platform-specific label on the header chip.
  document.querySelectorAll('[data-mod-key]').forEach((el) => (el.textContent = MOD.replace(' ', '')));
  document.addEventListener('click', (e) => {
    const el = e.target as Element;
    if (el.closest('[data-palette-open]')) palette()?.open();
    else if (el.closest('[data-shortcuts-help]')) openHelp();
  });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let seq = 0; // timestamp of the last `g`
  let cur = -1;
  const go = (u: string) => location.assign(u);
  const GOTO: Record<string, string> = { h: '/', w: '/writing/', p: '/projects/', c: '/cv/', n: '/now/' };

  const listMove = (dir: 1 | -1) => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-list-item]')].filter((e) => e.getClientRects().length);
    if (!els.length) return;
    const at = els.indexOf(document.activeElement as HTMLElement);
    cur = at >= 0 ? at + dir : dir > 0 ? 0 : els.length - 1;
    cur = Math.max(0, Math.min(els.length - 1, cur));
    els[cur].focus({ preventScroll: true });
    els[cur].scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
  };

  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    // ⌘K / Ctrl+K toggles the palette from anywhere.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (help?.open) help.close();
      palette()?.toggle();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]') || t.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;

    const k = e.key;
    if (seq) {
      const fresh = Date.now() - seq < 1000;
      seq = 0;
      if (fresh && GOTO[k]) { e.preventDefault(); go(GOTO[k]); return; }
    }
    if (k === '/') { e.preventDefault(); palette()?.open(); }
    else if (k === '?') { e.preventDefault(); openHelp(); }
    else if (e.shiftKey) return;
    else if (k === 'j' || k === 'k') { e.preventDefault(); listMove(k === 'j' ? 1 : -1); }
    else if (k === '[' || k === ']') {
      const a = document.querySelector<HTMLAnchorElement>(`[data-nav="${k === '[' ? 'prev' : 'next'}"]`);
      if (a) go(a.href);
    }
    else if (k === 'g') seq = Date.now();
    else if (k === 't') (window as any).toggleTheme?.();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
