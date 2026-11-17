/**
 * Shared order-book state for the two order-book figures. One engine, one
 * random-flow generator and one timer live at module level; the islands are
 * thin views over it. The timer only runs while an island is on screen, the
 * tab is visible and the reader has pressed play.
 */
import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Book, flowStep, fmtPx, makeBook, type Fill, type Level, type OrderType, type Side } from './orderbook.ts';
import { observeVisible, reducedMotion } from './hooks.ts';

const SEED = 7;
const INTERVAL: Record<number, number> = { 1: 900, 2: 450, 4: 200 };

export interface TradeRow { n: number; price: number; qty: number; taker: Side; mine: boolean }
export interface MyOrder { id: number; side: Side; price: number; qty: number; ahead: number }
export interface BookView {
  bids: Level[];
  asks: Level[];
  bestBid: number | null;
  bestAsk: number | null;
  last: number | null;
  trades: TradeRow[];
  mine: MyOrder[];
  status: { text: string; n: number };
  flow: string;
  playing: boolean;
  speed: number;
  events: number;
}

let book: Book;
let rng: () => number;
let trades: TradeRow[] = [];
let tradeNo = 0;
let status = { text: 'Ready. The book is pre-seeded; submit an order or press play.', n: 0 };
let flow = '';
let playing = false;
let speed = 1;
let events = 0;
let current: BookView;
const subs = new Set<() => void>();

function build(): BookView {
  return {
    bids: book.levels('buy', 40),
    asks: book.levels('sell', 40),
    bestBid: book.bestBid(),
    bestAsk: book.bestAsk(),
    last: book.last,
    trades,
    mine: book.myOrders().map((o) => ({ id: o.id, side: o.side, price: o.price, qty: o.qty, ahead: book.queueAhead(o.id) ?? 0 })),
    status, flow, playing, speed, events,
  };
}

function emit() {
  current = build();
  subs.forEach((fn) => fn());
}

function init() {
  ({ book, rng } = makeBook(SEED));
  trades = [];
  tradeNo = 0;
  flow = '';
  events = 0;
  status = { text: 'Ready. The book is pre-seeded; submit an order or press play.', n: 0 };
  current = build();
}
init();
/** Immutable snapshot used for the first render on server and client, so hydration matches. */
export const INITIAL_VIEW: BookView = current!;

function record(fills: Fill[]) {
  if (!fills.length) return;
  const rows = fills.map((f) => ({ n: ++tradeNo, price: f.price, qty: f.qty, taker: f.taker, mine: f.takerMine || f.makerMine }));
  trades = [...rows.reverse(), ...trades].slice(0, 30);
}

const avg = (fills: Fill[]) => fills.reduce((a, f) => a + f.price * f.qty, 0) / fills.reduce((a, f) => a + f.qty, 0);

export function step() {
  const before = new Set(book.myOrders().map((o) => o.id));
  const ev = flowStep(book, rng);
  events++;
  flow = ev.text;
  record(ev.fills);
  // Tell the reader when the random flow trades against one of their resting orders.
  const hit = new Map<number, number>();
  for (const f of ev.fills) if (f.makerMine) hit.set(f.makerId, (hit.get(f.makerId) ?? 0) + f.qty);
  if (hit.size) {
    const live = new Map(book.myOrders().map((o) => [o.id, o]));
    const parts = [...hit].filter(([id]) => before.has(id)).map(([id, q]) => {
      const o = live.get(id);
      return o ? `${q} of your order filled, ${o.qty} left` : `your order filled (${q})`;
    });
    status = { text: parts.join('; ') + '.', n: status.n + 1 };
  }
  emit();
}

export function submit(side: Side, type: OrderType, priceTicks: number, qty: number) {
  const res = book.submit(side, type, priceTicks, qty, true);
  record(res.fills);
  const filled = qty - res.rested - res.cancelled;
  const parts: string[] = [];
  const label = `${type} ${side} ${qty}${type === 'limit' ? ' @ ' + fmtPx(priceTicks) : ''}`;
  if (filled > 0) {
    const levels = new Set(res.fills.map((f) => f.price)).size;
    parts.push(`${side === 'buy' ? 'bought' : 'sold'} ${filled} at avg ${(avg(res.fills) / 100).toFixed(3)}${levels > 1 ? `, sweeping ${levels} levels` : ''}`);
  }
  if (res.rested > 0) {
    parts.push(`${res.rested} resting at ${fmtPx(priceTicks)}, ${book.queueAhead(res.id) ?? 0} shares ahead in the queue`);
  }
  if (res.cancelled > 0) parts.push(`${res.cancelled} cancelled: nothing left to trade against`);
  status = { text: `Your ${label}: ${parts.join('; ') || 'no effect'}.`, n: status.n + 1 };
  emit();
}

export function cancel(id: number) {
  if (book.cancel(id)) status = { text: 'Order cancelled.', n: status.n + 1 };
  emit();
}

export function reset() {
  init();
  playing = false;
  reconcile();
  emit();
}

// ---- timer ----
let timer: ReturnType<typeof setInterval> | undefined;
const visible = new Set<number>();

function reconcile() {
  const hidden = typeof document !== 'undefined' && document.hidden;
  const want = playing && visible.size > 0 && !hidden;
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  if (want) timer = setInterval(step, INTERVAL[speed] ?? 900);
}

export function setPlaying(on: boolean) {
  playing = on;
  reconcile();
  emit();
}
export function setSpeed(s: number) {
  speed = s;
  reconcile();
  emit();
}

let docListener = false;
let uid = 0;
/** Register an island's root element; the timer runs only while at least one is on screen. */
export function useReportVisible(ref: RefObject<Element | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = ++uid;
    if (!docListener && typeof document !== 'undefined') {
      docListener = true;
      document.addEventListener('visibilitychange', reconcile);
    }
    const stop = observeVisible(el, (v) => {
      if (v) visible.add(key);
      else visible.delete(key);
      reconcile();
    });
    return () => {
      stop();
      visible.delete(key);
      reconcile();
    };
  }, [ref]);
}

let autoplayDone = false;
/** Start the random flow once per page, unless the reader prefers reduced motion. */
export function autoplayOnce() {
  if (autoplayDone) return;
  autoplayDone = true;
  if (!reducedMotion()) setPlaying(true);
}

/** Hydration-safe: first render uses INITIAL_VIEW, then syncs to the live store. */
export function useBookView(): BookView {
  const [v, setV] = useState(INITIAL_VIEW);
  useEffect(() => {
    const fn = () => setV(current);
    fn();
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  }, []);
  return v;
}
