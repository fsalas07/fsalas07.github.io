import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/** Track an element's pixel size so SVG charts can use a 1:1 viewBox (text stays legible). */
export function useSize(ref: RefObject<Element | null>, init: { w: number; h: number }) {
  const [size, setSize] = useState(init);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && h > 0) setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Calls cb(true/false) as the element enters/leaves the viewport. */
export function observeVisible(el: Element, cb: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true);
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) cb(e.isIntersecting);
  });
  io.observe(el);
  return () => io.disconnect();
}

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
