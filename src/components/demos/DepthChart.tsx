import { useRef } from 'preact/hooks';
import './demo.css';
import { setPlaying, step, useBookView, useReportVisible } from './bookStore.ts';
import { useSize } from './hooks.ts';
import { fmtMid, fmtPx, type Level } from './orderbook.ts';
import { r1 } from './util.ts';

const M = { l: 44, r: 14, t: 12, b: 30 };

/** Cumulative size from the best price outward, as a step path closed to the baseline. */
function stairs(levels: Level[], x: (p: number) => number, y: (v: number) => number, edge: number) {
  let cum = 0;
  let d = '';
  let line = '';
  for (const l of levels) {
    line += (line ? 'L' : 'M') + r1(x(l.price)) + ' ' + r1(y(cum)) + ' ';
    cum += l.size;
    line += 'L' + r1(x(l.price)) + ' ' + r1(y(cum)) + ' ';
  }
  if (!line) return { line: '', area: '', total: 0 };
  line += 'L' + r1(edge) + ' ' + r1(y(cum));
  d = line + ` L${r1(edge)} ${r1(y(0))} L${r1(x(levels[0]!.price))} ${r1(y(0))} Z`;
  return { line, area: d, total: cum };
}

export default function DepthChart() {
  const v = useBookView();
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(box, { w: 640, h: 320 });
  useReportVisible(root);

  const { bestBid: bb, bestAsk: ba } = v;
  const two = bb !== null && ba !== null;
  const mid = two ? (bb + ba) / 2 : 10000;

  // Window: wide enough for the first dozen levels, quantised so it does not twitch.
  const reach = (ls: Level[]) => (ls.length ? Math.abs(ls[Math.min(11, ls.length - 1)]!.price - mid) : 10);
  const R = Math.max(15, Math.ceil(Math.max(reach(v.bids), reach(v.asks)) / 5) * 5);
  const lo = mid - R;
  const hi = mid + R;
  const bids = v.bids.filter((l) => l.price >= lo);
  const asks = v.asks.filter((l) => l.price <= hi);

  const pw = w - M.l - M.r;
  const ph = h - M.t - M.b;
  const x = (p: number) => M.l + (pw * (p - lo)) / (hi - lo);

  const total = (ls: Level[]) => ls.reduce((a, l) => a + l.size, 0);
  const peak = Math.max(total(bids), total(asks), 1);
  const stepY = peak > 2000 ? 500 : peak > 800 ? 200 : 100;
  const yMax = Math.ceil(peak / stepY) * stepY;
  const y = (s: number) => M.t + ph - (ph * s) / yMax;

  const B = stairs(bids, x, y, x(lo));
  const A = stairs(asks, x, y, x(hi));
  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [-2, -1, 0, 1, 2].map((k) => mid + (k * R) / 2);

  return (
    <div class="demo" ref={root}>
      <div class="d-chart d-depth" ref={box}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img"
          aria-label={two ? `Depth chart. Best bid ${fmtPx(bb)}, best ask ${fmtPx(ba)}. ${total(bids)} shares bid and ${total(asks)} offered within ${R} ticks of the mid price.` : 'Depth chart of a one-sided book'}>
          {yTicks.map((t) => (
            <g key={t}>
              <line class="d-grid" x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} />
              <line class="d-axis" x1={M.l - 4} x2={M.l} y1={y(t)} y2={y(t)} />
              <text class="num" x={M.l - 7} y={y(t) + 3.5} text-anchor="end">{t}</text>
            </g>
          ))}
          {xTicks.map((p, i) => (
            <g key={i}>
              <line class="d-axis" x1={x(p)} x2={x(p)} y1={M.t + ph} y2={M.t + ph + 4} />
              <text class="num" x={x(p)} y={M.t + ph + 17} text-anchor={i === 4 ? 'end' : i === 0 ? 'start' : 'middle'}>{i === 2 ? fmtMid(2 * p) : fmtPx(Math.round(p))}</text>
            </g>
          ))}
          <line class="d-axis" x1={M.l} x2={M.l} y1={M.t} y2={M.t + ph} />
          <line class="d-axis" x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} />
          <text class="halo" x={M.l + 6} y={M.t + 12}>cumulative shares</text>
          <text x={M.l + pw} y={h - 2} text-anchor="end">price</text>

          <line x1={x(mid)} x2={x(mid)} y1={M.t} y2={M.t + ph} stroke="var(--muted)" stroke-dasharray="1 3" />
          {B.area && <path d={B.area} fill="var(--bid)" fill-opacity="0.22" />}
          {A.area && <path d={A.area} fill="var(--ask)" fill-opacity="0.22" />}
          {B.line && <path d={B.line} fill="none" stroke="var(--bid)" stroke-width="1.6" stroke-linejoin="round" />}
          {A.line && <path d={A.line} fill="none" stroke="var(--ask)" stroke-width="1.6" stroke-linejoin="round" />}
          {v.mine.filter((o) => o.price >= lo && o.price <= hi).map((o) => (
            <path key={o.id} class="acc" d={`M${r1(x(o.price))} ${r1(M.t + ph - 1)} l-4 -8 h8 z`}>
              <title>{`your ${o.side} ${o.qty} @ ${fmtPx(o.price)}`}</title>
            </path>
          ))}
        </svg>
      </div>
      <div class="d-legend">
        <span><i style={{ color: 'var(--bid)' }} />bids</span>
        <span><i style={{ color: 'var(--ask)' }} />asks</span>
        <span><i class="dot" style={{ color: 'var(--muted)' }} />mid</span>
        <span style={{ color: 'var(--accent)' }}>▲ your orders</span>
      </div>
      <div class="d-btns">
        <button type="button" class="d-btn" aria-pressed={v.playing} onClick={() => setPlaying(!v.playing)}>{v.playing ? 'Pause' : 'Play'} flow</button>
        <button type="button" class="d-btn" onClick={() => step()}>Step</button>
        <span class="d-muted">
          {two && <>bid <span class="d-num">{fmtPx(bb)}</span> · ask <span class="d-num">{fmtPx(ba)}</span> · bids <span class="d-num">{B.total}</span> vs asks <span class="d-num">{A.total}</span> within ±{R} ticks</>}
        </span>
      </div>
    </div>
  );
}
