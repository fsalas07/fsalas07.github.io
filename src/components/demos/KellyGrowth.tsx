import { useRef, useState } from 'preact/hooks';
import './demo.css';
import { useSize } from './hooks.ts';
import { growth, kellyFraction, setKelly, useKelly } from './kelly.ts';
import { clamp, pct, r1, signedPct } from './util.ts';

const M = { l: 52, r: 22, t: 14, b: 32 };

export default function KellyGrowth() {
  const { p, b, f } = useKelly();
  const box = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(box, { w: 640, h: 320 });
  const [drag, setDrag] = useState(false);

  const fStar = kellyFraction(p, b);
  const gStar = growth(p, b, fStar);
  const gScale = Math.max(gStar, 0.002);
  const xMax = Math.min(1, Math.max(0.25, 3 * fStar));
  const yMax = gScale * 1.3;
  const yMin = -gScale * 1.7;

  const pw = w - M.l - M.r;
  const ph = h - M.t - M.b;
  const x = (v: number) => M.l + (pw * v) / xMax;
  const y = (v: number) => M.t + (ph * (yMax - clamp(v, yMin - gScale, yMax))) / (yMax - yMin);
  const fv = Math.min(f, xMax);
  const g = growth(p, b, f);
  const g2 = growth(p, b, 2 * fStar);

  // Sample the curve; stop short of f = 1 where ln(1 - f) diverges.
  const S = 160;
  let curve = '';
  let area = '';
  let zero = 0; // first f > f* where g <= 0
  let prevPos = false;
  for (let i = 0; i <= S; i++) {
    const fi = Math.min((xMax * i) / S, 0.9995);
    const gi = growth(p, b, fi);
    curve += (i === 0 ? 'M' : 'L') + r1(x(fi)) + ' ' + r1(y(gi)) + ' ';
    if (gi > 0) {
      area += (prevPos ? 'L' : 'M' + r1(x(fi)) + ' ' + r1(y(0)) + ' L') + r1(x(fi)) + ' ' + r1(y(gi)) + ' ';
      zero = fi;
      prevPos = true;
    }
  }
  if (prevPos) area += 'L' + r1(x(zero)) + ' ' + r1(y(0)) + ' Z';

  const set = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const v = clamp(((clientX - r.left - M.l) / pw) * xMax, 0, xMax);
    setKelly({ f: Math.round(v * 1000) / 1000 });
  };
  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 0.05 : 0.005;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = f + big;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = f - big;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = xMax;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setKelly({ f: Math.round(clamp(next, 0, xMax) * 1000) / 1000 });
  };

  const xTicks: number[] = [];
  const xs = xMax <= 0.3 ? 0.05 : xMax <= 0.6 ? 0.1 : 0.2;
  for (let v = 0; v <= xMax + 1e-9; v += xs) xTicks.push(Math.round(v * 100) / 100);
  const yStep = gScale >= 0.02 ? 0.01 : gScale >= 0.006 ? 0.005 : gScale >= 0.003 ? 0.002 : 0.001;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-12; v += yStep) yTicks.push(Math.round(v * 1e6) / 1e6);

  const showStar = fStar > 0 && fStar <= xMax;
  const show2 = fStar > 0 && 2 * fStar <= xMax && Number.isFinite(g2);
  const ratio = gStar > 0 && Number.isFinite(g) && g >= 0 ? g / gStar : NaN;

  return (
    <div class="demo">
      <div class="d-chart d-curve" ref={box}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="group"
          aria-label="Expected log growth per bet as a function of bet fraction f"
          style={{ touchAction: 'pan-y', cursor: drag ? 'grabbing' : 'crosshair' }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(true);
            set(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => { if (drag) set(e.clientX, e.currentTarget); }}
          onPointerUp={() => setDrag(false)}
          onPointerCancel={() => setDrag(false)}
        >
          <defs>
            <clipPath id="kg-clip">
              <rect x={M.l} y={M.t} width={pw} height={ph} />
            </clipPath>
          </defs>
          {yTicks.map((v) => (
            <g key={v}>
              <line class="d-grid" x1={M.l} x2={M.l + pw} y1={y(v)} y2={y(v)} />
              <line class="d-axis" x1={M.l - 4} x2={M.l} y1={y(v)} y2={y(v)} />
              <text class="num" x={M.l - 7} y={y(v) + 3.5} text-anchor="end">{(v * 100).toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map((v) => (
            <g key={v}>
              <line class="d-axis" x1={x(v)} x2={x(v)} y1={M.t + ph} y2={M.t + ph + 4} />
              <text class="num" x={x(v)} y={M.t + ph + 17} text-anchor="middle">{Math.round(v * 100)}%</text>
            </g>
          ))}
          <line class="d-axis" x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} />
          <line class="d-axis" x1={M.l} x2={M.l + pw} y1={y(0)} y2={y(0)} style={{ stroke: 'var(--ink)' }} />
          <text x={M.l + pw} y={h - 2} text-anchor="end">bet fraction f</text>
          <text class="halo" x={M.l + 6} y={M.t + 12}>growth g(f), % per bet</text>

          <g clip-path="url(#kg-clip)">
            {area && <path d={area} fill="var(--mark)" opacity="0.9" />}
            <path d={curve} fill="none" stroke="var(--ink)" stroke-width="1.75" stroke-linejoin="round" />
          </g>

          {showStar && (
            <g>
              <line x1={x(fStar)} x2={x(fStar)} y1={y(gStar)} y2={y(0)} stroke="var(--accent)" stroke-dasharray="3 3" />
              <circle cx={x(fStar)} cy={y(gStar)} r="4" fill="var(--accent)" />
              <text class="halo acc" x={x(fStar)} y={y(gStar) - 9} text-anchor="middle">f* = {pct(fStar)}</text>
            </g>
          )}
          {show2 && (
            <g>
              <circle cx={x(2 * fStar)} cy={y(g2)} r="4" fill="var(--bg)" stroke="var(--ink)" stroke-width="1.5" />
              <text class="halo" x={x(2 * fStar)} y={y(0) - 9} text-anchor="middle">2f*</text>
            </g>
          )}

          {/* draggable marker */}
          <g
            class="d-handle"
            tabIndex={0}
            role="slider"
            aria-label="Bet fraction f"
            aria-valuemin={0}
            aria-valuemax={xMax}
            aria-valuenow={fv}
            aria-valuetext={`f equals ${pct(f)}, growth ${Number.isFinite(g) ? signedPct(g) : 'ruin'} per bet`}
            onKeyDown={onKey}
            style={{ outline: 'none', cursor: 'grab' }}
          >
            <line x1={x(fv)} x2={x(fv)} y1={y(Number.isFinite(g) ? g : yMin)} y2={M.t + ph} stroke="var(--ink)" stroke-opacity="0.4" stroke-dasharray="1 3" />
            <circle class="ring" cx={x(fv)} cy={y(Number.isFinite(g) ? g : yMin)} r="9" fill="none" stroke="none" stroke-width="2" />
            <circle cx={x(fv)} cy={y(Number.isFinite(g) ? g : yMin)} r="5.5" fill="var(--ink)" stroke="var(--bg)" stroke-width="1.5" />
            <circle cx={x(fv)} cy={y(Number.isFinite(g) ? g : yMin)} r="16" fill="transparent" />
          </g>
        </svg>
      </div>

      <p class="d-readout" aria-live="polite">
        At <b>f = <span class="d-num">{pct(f)}</span></b> the growth rate is{' '}
        <b class="d-num">{Number.isFinite(g) ? signedPct(g) : 'ruin'}</b> per bet
        {Number.isFinite(ratio) && <>, or <span class="d-num">{pct(ratio, 0)}</span> of the maximum</>}.
        {fStar > 0 && (2 * fStar >= 1
          ? <> At 2f* = <span class="d-num">{pct(2 * fStar, 0)}</span>, more than the whole bankroll, one loss is ruin.</>
          : <> At 2f* = <span class="d-num">{pct(2 * fStar)}</span> it is{' '}
            <span class="d-num">{signedPct(g2, 3)}</span>: all the risk, almost none of the reward when the edge is modest.</>)}
        {f > xMax && <> <span class="d-muted">(f is past the right edge of this plot.)</span></>}
      </p>
      <div class="d-ctl" style={{ marginTop: '0.4em' }}>
        <label for="kg-f">bet size f</label>
        <input id="kg-f" type="range" min={0} max={1} step={0.005} value={f}
          onInput={(e) => setKelly({ f: +e.currentTarget.value })} />
        <output class="d-num" for="kg-f">{pct(f)}</output>
      </div>
    </div>
  );
}
