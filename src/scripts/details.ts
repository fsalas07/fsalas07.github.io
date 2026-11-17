// Post-page niceties: copy-to-clipboard and sidenote collision nudging.
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];

for (const b of $$('[data-copy]')) {
  b.hidden = false;
  b.onclick = async () => {
    try {
      await navigator.clipboard.writeText(b.closest('details')!.querySelector('pre')!.innerText);
      b.textContent = 'Copied';
    } catch {
      b.textContent = 'Press ⌘C';
    }
    setTimeout(() => (b.textContent = 'copy'), 1800);
  };
}

const wide = matchMedia('(min-width:1100px)');
let raf = 0;
function nudge() {
  let bottom = -Infinity;
  for (const n of $$('.sidenote,.marginnote')) {
    n.style.top = '';
    if (!wide.matches) continue;
    const r = n.getBoundingClientRect();
    const dy = Math.max(0, bottom + 12 - r.top);
    if (dy) n.style.top = dy + 'px';
    bottom = r.bottom + dy;
  }
}
const queue = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(nudge)));
queue();
addEventListener('resize', queue);
document.fonts?.ready.then(queue);
