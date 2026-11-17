import { useEffect, useRef, useState } from 'preact/hooks';
import './demo.css';
import {
  autoplayOnce, cancel, reset, setPlaying, setSpeed, step, submit, useBookView, useReportVisible,
} from './bookStore.ts';
import type { Level } from './orderbook.ts';
import { fmtMid, fmtPx, type OrderType, type Side } from './orderbook.ts';

const DEPTH = 7;
const TAPE = 10;

function parsePrice(s: string): number | null {
  if (s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : NaN;
}

export default function OrderBook() {
  const v = useBookView();
  const root = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('25');
  const [err, setErr] = useState('');

  useReportVisible(root);
  useEffect(() => {
    autoplayOnce();
  }, []);

  const { bestBid: bb, bestAsk: ba } = v;
  const passive = side === 'buy' ? bb : ba;
  const typed = parsePrice(price);
  const px = typed ?? passive;
  const q = Math.floor(Number(qty));

  // ---- live explanation of what this order would do ----
  let hint = '';
  if (type === 'market') {
    hint = 'A market order trades at the best available prices until it is filled; any shortfall is cancelled.';
  } else if (px === null || Number.isNaN(px)) {
    hint = 'Enter a positive price.';
  } else {
    const crosses = side === 'buy' ? ba !== null && px >= ba : bb !== null && px <= bb;
    if (crosses) {
      hint = `Marketable: this crosses the spread, so it trades now at the resting prices (never worse than ${fmtPx(px)}). Any remainder rests.`;
    } else {
      const lv = (side === 'buy' ? v.bids : v.asks).find((l) => l.price === px);
      const improves = side === 'buy' ? bb !== null && px > bb : ba !== null && px < ba;
      hint = improves
        ? `Improves the best ${side === 'buy' ? 'bid' : 'ask'}: you would be first in line at a new best price.`
        : lv
          ? `Rests behind ${lv.size} shares already queued at ${fmtPx(px)} (${lv.orders} order${lv.orders > 1 ? 's' : ''}).`
          : `Rests at a new price level, first in its queue.`;
    }
  }

  const onSubmit = (e: Event) => {
    e.preventDefault();
    if (!Number.isInteger(q) || q < 1 || q > 100000) return setErr('Quantity must be a whole number from 1 to 100,000.');
    if (type === 'limit') {
      if (px === null || Number.isNaN(px)) return setErr('Enter a limit price greater than zero.');
      setErr('');
      submit(side, 'limit', px, q);
    } else {
      setErr('');
      submit(side, 'market', 0, q);
    }
  };

  // Keys act only while focus is inside this demo; consumed keys never reach the site's shortcuts.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'text')) {
      e.stopPropagation(); // typing a price must not trigger page shortcuts
      return;
    }
    if (t instanceof HTMLSelectElement) {
      e.stopPropagation();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'b') setSide('buy');
    else if (k === 's') setSide('sell');
    else if (k === 'l') setType('limit');
    else if (k === 'm') setType('market');
    else if (k === 'n') step();
    else if (k === 'p') setPlaying(!v.playing);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const shownAsks = v.asks.slice(0, DEPTH);
  const shownBids = v.bids.slice(0, DEPTH);
  const maxSize = Math.max(100, ...shownAsks.map((l) => l.size), ...shownBids.map((l) => l.size));
  const spread = bb !== null && ba !== null ? ba - bb : null;
  const mid2 = bb !== null && ba !== null ? bb + ba : null;

  const fill = (price: number) => {
    setPrice((price / 100).toFixed(2));
    setType('limit');
  };

  const row = (kind: 'ask' | 'bid', l: Level | undefined, i: number) => (
    <tr class={kind} key={kind + i}>
      <td>
        {l && (
          <button type="button" class="px" onClick={() => fill(l.price)} aria-label={`Use price ${fmtPx(l.price)}`}>
            {fmtPx(l.price)}
          </button>
        )}
      </td>
      <td class="d-num">
        {l && l.mine > 0 && <span class="you" title={`${l.mine} yours`}>◆ </span>}
        {l ? l.size : ''}
      </td>
      <td class="depthcell" aria-hidden="true">
        {l && <span class="bar" style={{ width: `${(100 * l.size) / maxSize}%` }} />}
      </td>
    </tr>
  );
  const asksTopDown = Array.from({ length: DEPTH }, (_, i) => shownAsks[DEPTH - 1 - i]);

  return (
    <div class="demo" ref={root} onKeyDown={onKeyDown}>
      <div class="d-ob">
        <div class="bar">
          <div class="d-bar">
            <button type="button" class="d-btn" aria-pressed={v.playing} onClick={() => setPlaying(!v.playing)}>
              {v.playing ? 'Pause' : 'Play'} flow
            </button>
            <button type="button" class="d-btn" onClick={() => step()}>Step</button>
            <label class="d-muted">
              speed
              <select value={v.speed} aria-label="Order flow speed" onChange={(e) => setSpeed(+e.currentTarget.value)}>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <span class="sp" />
            <button type="button" class="d-btn" onClick={() => { reset(); setErr(''); setPrice(''); }}>Reset</button>
          </div>
          <dl class="d-stats" style={{ marginTop: '0.7em' }} aria-live="polite">
            <div><dt>bid</dt><dd class="d-num">{bb !== null ? fmtPx(bb) : '–'}</dd></div>
            <div><dt>ask</dt><dd class="d-num">{ba !== null ? fmtPx(ba) : '–'}</dd></div>
            <div><dt>spread</dt><dd class="d-num">{spread !== null ? fmtPx(spread) : '–'}</dd></div>
            <div><dt>mid</dt><dd class="d-num">{mid2 !== null ? fmtMid(mid2) : '–'}</dd></div>
            <div><dt>last</dt><dd class="d-num">{v.last !== null ? fmtPx(v.last) : '–'}</dd></div>
          </dl>
          <p class="d-flow">{v.flow ? <>random flow: <span class="d-num">{v.flow}</span></> : 'random flow: idle'}</p>
        </div>

        <div class="ladder">
          <table class="d-ladder">
            <caption class="d-sr">Order book. Asks above the spread, bids below. Click a price to copy it into the order form.</caption>
            <thead><tr><th scope="col">Price</th><th scope="col">Size</th><th scope="col"><span class="d-sr">Depth</span></th></tr></thead>
            <tbody>
              {asksTopDown.map((l, i) => row('ask', l, i))}
              <tr class="mid"><td colspan={3} class="d-num">
                {spread !== null && mid2 !== null ? `spread ${fmtPx(spread)}  ·  mid ${fmtMid(mid2)}` : 'one-sided book'}
              </td></tr>
              {Array.from({ length: DEPTH }, (_, i) => row('bid', shownBids[i], i))}
            </tbody>
          </table>
        </div>

        <form class="form d-form" noValidate onSubmit={onSubmit} aria-label="Submit an order">
          <h4 class="d-h">Your order</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6em' }}>
            <div class="d-seg" role="radiogroup" aria-label="Side">
              <label><input type="radio" name="ob-side" checked={side === 'buy'} onChange={() => setSide('buy')} />Buy</label>
              <label><input type="radio" name="ob-side" checked={side === 'sell'} onChange={() => setSide('sell')} />Sell</label>
            </div>
            <div class="d-seg" role="radiogroup" aria-label="Order type">
              <label><input type="radio" name="ob-type" checked={type === 'limit'} onChange={() => setType('limit')} />Limit</label>
              <label><input type="radio" name="ob-type" checked={type === 'market'} onChange={() => setType('market')} />Market</label>
            </div>
          </div>
          <div class="d-fields">
            <label>
              <span>Price</span>
              <input type="number" inputMode="decimal" step="0.01" min="0.01" value={price} disabled={type === 'market'}
                placeholder={type === 'market' ? 'market' : passive !== null ? fmtPx(passive) : ''}
                onInput={(e) => { setPrice(e.currentTarget.value); setErr(''); }} />
            </label>
            <label>
              <span>Quantity</span>
              <input type="number" inputMode="numeric" step="1" min="1" value={qty}
                onInput={(e) => { setQty(e.currentTarget.value); setErr(''); }} />
            </label>
          </div>
          <button type="submit" class="d-btn">Submit {type} {side}</button>
          <p class="d-hint" aria-live="polite">{err || hint}</p>
          <p class="d-keys">
            Keys, with focus here: <kbd>b</kbd> buy · <kbd>s</kbd> sell · <kbd>l</kbd> limit · <kbd>m</kbd> market · <kbd>n</kbd> step · <kbd>p</kbd> play/pause
          </p>
          <p class="d-status" aria-live="polite">{v.status.text}</p>
        </form>

        <div class="tape">
          <h4 class="d-h">Trade tape</h4>
          <div class="d-tape-wrap">
            <table class="d-tape">
              <caption class="d-sr">Recent trades, newest first</caption>
              <thead><tr><th scope="col">#</th><th scope="col">Price</th><th scope="col">Qty</th><th scope="col">Taker</th></tr></thead>
              <tbody>
                {Array.from({ length: TAPE }, (_, i) => {
                  const t = v.trades[i];
                  return (
                    <tr key={i}>
                      <td class="d-num d-muted">{t ? <>{t.mine && <span class="you" style={{ color: 'var(--accent)' }}>◆ </span>}{t.n}</> : ''}</td>
                      <td class={'d-num ' + (t ? t.taker : '')}>{t ? fmtPx(t.price) : ''}</td>
                      <td class="d-num">{t ? t.qty : ''}</td>
                      <td class={t ? t.taker : ''}>{t ? (t.taker === 'buy' ? 'buy' : 'sell') : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div class="mine">
          <h4 class="d-h">Your resting orders</h4>
          <ul class="d-mine">
            {v.mine.length === 0 && <li class="empty">None. A limit order that does not cross will rest here.</li>}
            {v.mine.slice(0, 4).map((o) => (
              <li key={o.id}>
                <span class={'d-num ' + o.side}>{o.side === 'buy' ? 'BUY' : 'SELL'} {o.qty} @ {fmtPx(o.price)}</span>
                <span class="sp" />
                <span class="d-muted d-num">{o.ahead} ahead</span>
                <button type="button" class="d-btn sm" onClick={() => cancel(o.id)} aria-label={`Cancel ${o.side} ${o.qty} at ${fmtPx(o.price)}`}>cancel</button>
              </li>
            ))}
            {v.mine.length > 4 && <li class="empty">+{v.mine.length - 4} more</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
