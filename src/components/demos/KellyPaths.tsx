import { useMemo, useRef } from 'preact/hooks';
import './demo.css';
import { useSize } from './hooks.ts';
import {
  LIMITS, N_BETS, N_PATHS, growth, kellyFraction, rawKelly, resetKelly, setKelly,
  simulate, useKelly,
} from './kelly.ts';
import { fmtMultiple, fmtPow10, pct, r1, signedPct } from './util.ts';

const LN10 = Math.LN10;
const M = { l: 50, r: 12, t: 10, b: 30 };
const STEP = 2; // draw every second bet: half the SVG, visually identical

export default function KellyPaths() {
  const { p, b, f, seed } = useKelly();
  const box = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(box, { w: 640, h: 360 });

  const fStar = kellyFraction(p, b);
  const edge = p * b - (1 - p);
  const g = growth(p, b, f);
  const gStar = growth(p, b, fStar);

  const paths = useMemo(() => simulate(p, b, f, seed), [p, b, f, seed]);

  // y-domain in decades of wealth; whole decades so the gridlines sit on ticks.
  let minV = 0;
  let maxV = 0;
  const finals: number[] = [];
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const v = path[i]!;
      if (Number.isFinite(v)) {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    finals.push(path[N_BETS]!);
  }
  const lo = Math.max(-12, Math.min(-1, Math.floor(minV)));
  const hi = Math.max(1, Math.ceil(maxV));
  const pw = w - M.l - M.r;
  const ph = h - M.t - M.b;
  const x = (i: number) => M.l + (pw * i) / N_BETS;
  const y = (v: number) => M.t + (ph * (hi - Math.max(lo, Math.min(hi, v)))) / (hi - lo);

  const span = hi - lo;
  const tickStep = Math.max(1, Math.ceil(span / 6));
  const yTicks: number[] = [];
  for (let k = Math.ceil(lo / tickStep); k * tickStep <= hi; k++) yTicks.push(k * tickStep);

  const d = paths.map((path) => {
    let s = '';
    for (let i = 0; i <= N_BETS; i += STEP) {
      s += (i === 0 ? 'M' : 'L') + r1(x(i)) + ' ' + r1(y(path[i]!)) + ' ';
    }
    return s;
  });

  const sorted = [...finals].sort((u, v) => u - v);
  const median = (sorted[N_PATHS / 2 - 1]! + sorted[N_PATHS / 2]!) / 2;
  const below = finals.filter((v) => !(v >= 0)).length;
  const gLine = (gg: number) =>
    Number.isFinite(gg) ? `M${r1(x(0))} ${r1(y(0))} L${r1(x(N_BETS))} ${r1(y((N_BETS * gg) / LN10))}` : '';

  const [pMin, pMax] = LIMITS.p;
  const [bMin, bMax] = LIMITS.b;
  const tickLeft = (frac: number) => `calc(8px + (100% - 16px) * ${frac})`;
  const ariaLabel = `Twenty simulated wealth paths over ${N_BETS} bets on a log scale, betting ${pct(f)} of the bankroll each time. ${below} of ${N_PATHS} end below the starting stake.`;

  return (
    <div class="demo">
      <div class="d-chart d-paths" ref={box}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}>
          <defs>
            <clipPath id="kp-clip">
              <rect x={M.l} y={M.t} width={pw} height={ph} />
            </clipPath>
          </defs>
          {yTicks.map((k) => (
            <g key={k}>
              <line class="d-grid" x1={M.l} x2={M.l + pw} y1={y(k)} y2={y(k)} style={k === 0 ? { stroke: 'var(--axis)', strokeDasharray: '2 3' } : undefined} />
              <line class="d-axis" x1={M.l - 4} x2={M.l} y1={y(k)} y2={y(k)} />
              <text class="num" x={M.l - 7} y={y(k) + 3.5} text-anchor="end">{fmtPow10(k)}</text>
            </g>
          ))}
          {[0, 100, 200, 300, 400, 500].map((i) => (
            <g key={i}>
              <line class="d-axis" x1={x(i)} x2={x(i)} y1={M.t + ph} y2={M.t + ph + 4} />
              <text class="num" x={x(i)} y={M.t + ph + 17} text-anchor={i === 0 ? 'start' : i === N_BETS ? 'end' : 'middle'}>{i}</text>
            </g>
          ))}
          <line class="d-axis" x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} />
          <line class="d-axis" x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} />
          <text x={M.l + pw} y={h - 2} text-anchor="end">bets</text>
          <text class="halo" x={M.l + 6} y={M.t + 12}>wealth (× start, log scale)</text>

          <g clip-path="url(#kp-clip)" fill="none" stroke-linejoin="round">
            {d.map((dd, k) => (
              <path
                key={k}
                d={dd}
                stroke={finals[k]! >= 0 ? 'var(--soft)' : 'var(--accent)'}
                stroke-opacity={finals[k]! >= 0 ? 0.85 : 0.7}
                stroke-width="1"
              />
            ))}
            {fStar !== f && <path d={gLine(gStar)} stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="1 4" stroke-linecap="round" />}
            <path d={gLine(g)} stroke="var(--ink)" stroke-width="1.75" stroke-dasharray="6 4" />
          </g>
        </svg>
      </div>

      <div class="d-legend">
        <span><i style={{ color: 'var(--soft)' }} />path ends above its start</span>
        <span><i style={{ color: 'var(--accent)' }} />ends below</span>
        <span><i class="dash" style={{ color: 'var(--ink)' }} />expected growth at f</span>
        <span><i class="dot" style={{ color: 'var(--muted)' }} />at f*</span>
      </div>

      <div class="d-controls">
        <div class="d-ctl">
          <label for="kp-p">win prob. p</label>
          <input id="kp-p" type="range" min={pMin} max={pMax} step={0.005} value={p}
            onInput={(e) => setKelly({ p: +e.currentTarget.value })} />
          <output class="d-num" for="kp-p">{pct(p)}</output>
        </div>
        <div class="d-ctl">
          <label for="kp-b">payout b</label>
          <input id="kp-b" type="range" min={bMin} max={bMax} step={0.05} value={b}
            onInput={(e) => setKelly({ b: +e.currentTarget.value })} />
          <output class="d-num" for="kp-b">{b.toFixed(2)}:1</output>
        </div>
        <div class="d-ctl">
          <label for="kp-f">bet size f</label>
          <div class={'d-slider' + (fStar > 0 && fStar < 1 ? ' has-tick' : '')}>
            <input id="kp-f" type="range" min={0} max={1} step={0.005} value={f}
              onInput={(e) => setKelly({ f: +e.currentTarget.value })} />
            {fStar > 0 && fStar < 1 && <span class="d-tick" data-label="f*" style={{ left: tickLeft(fStar) }} aria-hidden="true" />}
          </div>
          <output class="d-num" for="kp-f">{pct(f)}</output>
        </div>
      </div>

      <div class="d-btns">
        <button type="button" class="d-btn" style={{ fontVariantCaps: 'normal' }} onClick={() => setKelly({ f: Math.min(1, fStar / 2) })}>f = ½ f*</button>
        <button type="button" class="d-btn" style={{ fontVariantCaps: 'normal' }} onClick={() => setKelly({ f: Math.min(1, fStar) })}>f = f*</button>
        <button type="button" class="d-btn" style={{ fontVariantCaps: 'normal' }} onClick={() => setKelly({ f: Math.min(1, fStar * 2) })}>f = 2 f*</button>
        <span style={{ flex: 1 }} />
        <button type="button" class="d-btn" onClick={() => setKelly({ seed: (Math.random() * 1e6) | 0 })}>Resimulate</button>
        <button type="button" class="d-btn" onClick={resetKelly}>Reset</button>
        <label class="d-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
          seed
          <input class="d-num" type="number" min={0} max={999999} step={1} value={seed} aria-label="PRNG seed"
            style={{ width: '8ch' }}
            onChange={(e) => { const v = Math.floor(+e.currentTarget.value); if (Number.isFinite(v) && v >= 0) setKelly({ seed: v }); }} />
        </label>
      </div>

      <p class="d-readout" aria-live="polite">
        {rawKelly(p, b) <= 0
          ? <>Edge <b class="d-num">{signedPct(edge, 1)}</b> per unit staked: no positive bet exists, so <b>f* = 0</b>.</>
          : <>Edge <b class="d-num">{signedPct(edge, 1)}</b> per unit staked, so <b>f* = {pct(fStar)}</b>.</>}{' '}
        At f = <span class="d-num">{pct(f)}</span> the expected log growth is{' '}
        <b class="d-num">{Number.isFinite(g) ? signedPct(g) : 'ruin'}</b> per bet
        {Number.isFinite(g) && <> (the maximum is <span class="d-num">{signedPct(gStar)}</span>)</>}.
        {' '}Median of these {N_PATHS} paths: <b class="d-num">×{fmtMultiple(median)}</b>;{' '}
        <span class="d-num">{below}/{N_PATHS}</span> end below their start.
      </p>
    </div>
  );
}
