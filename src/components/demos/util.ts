export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};
export const sup = (n: number) => String(n).replace(/[-0-9]/g, (c) => SUP[c] ?? c);

/** 10^k as a short label: 0.01, 1, 1,000, 10⁴, 10⁻⁵. */
export function fmtPow10(k: number): string {
  if (k >= -3 && k <= 3) return (10 ** k).toLocaleString('en-US', { maximumFractionDigits: 3 });
  return '10' + sup(k);
}

/** A wealth multiple given as log10, e.g. 1.09 -> "12.3", 7.2 -> "1.6×10⁷". */
export function fmtMultiple(log10: number): string {
  if (!Number.isFinite(log10)) return log10 < 0 ? '0' : '∞';
  if (log10 > -2 && log10 < 5) {
    const v = 10 ** log10;
    return v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(1) : v.toPrecision(2);
  }
  const e = Math.floor(log10);
  const m = 10 ** (log10 - e);
  return m.toFixed(1) + '×10' + sup(e);
}

export const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
export const signedPct = (x: number, d = 2) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
/** Round to one decimal, as a short string for SVG path data. */
export const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
