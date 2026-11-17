/**
 * A price-time-priority limit order book.
 *
 * Prices are integer ticks (1 tick = $0.01) so there is no floating-point
 * drift in comparisons. Each price level is a FIFO queue of resting orders;
 * a new order that cannot trade rests at the back of its level's queue.
 */
import { mulberry32 } from './rng.ts';

export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';

export interface Order {
  id: number;
  side: Side;
  price: number;
  qty: number; // remaining quantity
  mine: boolean; // placed by the reader (never touched by the random flow)
}

export interface Fill {
  price: number; // always the resting (maker) order's price
  qty: number;
  taker: Side; // side of the incoming order
  takerId: number;
  makerId: number;
  takerMine: boolean;
  makerMine: boolean;
}

export interface SubmitResult {
  id: number;
  fills: Fill[];
  rested: number; // quantity left resting in the book
  cancelled: number; // unfilled market-order quantity (book ran out)
}

export interface Level {
  price: number;
  size: number;
  orders: number;
  mine: number; // reader's quantity at this level
}

export const fmtPx = (ticks: number) => (ticks / 100).toFixed(2);
export const fmtMid = (twiceTicks: number) => (twiceTicks / 200).toFixed(3);

export class Book {
  private bids = new Map<number, Order[]>();
  private asks = new Map<number, Order[]>();
  private byId = new Map<number, Order>();
  private nextId = 1;
  last: number | null = null;

  private side(s: Side) {
    return s === 'buy' ? this.bids : this.asks;
  }

  bestBid(): number | null {
    let best: number | null = null;
    for (const p of this.bids.keys()) if (best === null || p > best) best = p;
    return best;
  }

  bestAsk(): number | null {
    let best: number | null = null;
    for (const p of this.asks.keys()) if (best === null || p < best) best = p;
    return best;
  }

  /** Match an incoming order against the opposite side, then rest any limit remainder. */
  submit(side: Side, type: OrderType, price: number, qty: number, mine = false): SubmitResult {
    const id = this.nextId++;
    const opposite = this.side(side === 'buy' ? 'sell' : 'buy');
    const fills: Fill[] = [];
    let left = qty;

    while (left > 0) {
      const best = side === 'buy' ? this.bestAsk() : this.bestBid();
      if (best === null) break;
      if (type === 'limit' && (side === 'buy' ? best > price : best < price)) break;

      const queue = opposite.get(best)!;
      while (left > 0 && queue.length > 0) {
        const maker = queue[0]!; // front of the queue: oldest order at this price
        const take = Math.min(left, maker.qty);
        maker.qty -= take;
        left -= take;
        this.last = best;
        fills.push({
          price: best, qty: take, taker: side, takerId: id, makerId: maker.id,
          takerMine: mine, makerMine: maker.mine,
        });
        if (maker.qty === 0) {
          queue.shift();
          this.byId.delete(maker.id);
        }
      }
      if (queue.length === 0) opposite.delete(best);
    }

    let rested = 0;
    let cancelled = 0;
    if (left > 0) {
      if (type === 'limit') {
        const order: Order = { id, side, price, qty: left, mine };
        const own = this.side(side);
        const queue = own.get(price);
        if (queue) queue.push(order);
        else own.set(price, [order]);
        this.byId.set(id, order);
        rested = left;
      } else {
        cancelled = left;
      }
    }
    return { id, fills, rested, cancelled };
  }

  cancel(id: number): boolean {
    const order = this.byId.get(id);
    if (!order) return false;
    const book = this.side(order.side);
    const queue = book.get(order.price)!;
    queue.splice(queue.indexOf(order), 1);
    if (queue.length === 0) book.delete(order.price);
    this.byId.delete(id);
    return true;
  }

  /** Shares ahead of this order in its price level's queue (null if it is gone). */
  queueAhead(id: number): number | null {
    const order = this.byId.get(id);
    if (!order) return null;
    let ahead = 0;
    for (const o of this.side(order.side).get(order.price)!) {
      if (o === order) return ahead;
      ahead += o.qty;
    }
    return null;
  }

  /** Price levels, best first. */
  levels(side: Side, max = Infinity): Level[] {
    const book = this.side(side);
    const prices = [...book.keys()].sort((a, b) => (side === 'buy' ? b - a : a - b));
    return prices.slice(0, max).map((price) => {
      const q = book.get(price)!;
      let size = 0;
      let mine = 0;
      for (const o of q) {
        size += o.qty;
        if (o.mine) mine += o.qty;
      }
      return { price, size, orders: q.length, mine };
    });
  }

  myOrders(): Order[] {
    return [...this.byId.values()].filter((o) => o.mine).sort((a, b) => a.id - b.id);
  }

  /** A random resting order that is not the reader's. */
  randomOrder(rng: () => number): Order | null {
    const pool = [...this.byId.values()].filter((o) => !o.mine);
    return pool.length ? pool[Math.floor(rng() * pool.length)]! : null;
  }

  /** Invariant check used by the tests: the book must never be crossed. */
  crossed(): boolean {
    const b = this.bestBid();
    const a = this.bestAsk();
    return b !== null && a !== null && b >= a;
  }
}

// ---------------------------------------------------------------------------
// Seeding and synthetic order flow
// ---------------------------------------------------------------------------

const lots = (rng: () => number) => 5 * (1 + Math.floor(rng() * (rng() < 0.08 ? 80 : 20)));

export function seedBook(book: Book, rng: () => number, mid = 10000) {
  for (let i = 0; i < 12; i++) {
    for (const [side, price] of [['buy', mid - 1 - i], ['sell', mid + 2 + i]] as const) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) book.submit(side, 'limit', price, lots(rng));
    }
  }
}

export interface FlowEvent {
  text: string;
  fills: Fill[];
}

/** One random event: mostly passive limits, with some cancels, market orders and aggressive limits. */
export function flowStep(book: Book, rng: () => number): FlowEvent {
  const bb = book.bestBid();
  const ba = book.bestAsk();
  const buy = rng() < 0.5;
  const side: Side = buy ? 'buy' : 'sell';
  const verb = buy ? 'buy' : 'sell';

  // Keep the book two-sided and the spread sane: post a limit inside the gap.
  if (bb === null || ba === null || ba - bb > 8) {
    const ref = book.last ?? 10000;
    const s: Side = bb === null ? 'buy' : ba === null ? 'sell' : side;
    const price = s === 'buy' ? (ba ?? ref + 2) - 3 : (bb ?? ref - 1) + 3;
    const q = lots(rng);
    const res = book.submit(s, 'limit', price, q);
    return { text: `limit ${s} ${q} @ ${fmtPx(price)}`, fills: res.fills };
  }

  const r = rng();
  if (r < 0.5) {
    // Passive limit order, placed relative to the opposite best so it never crosses.
    // Usually joins or sits behind the best price; occasionally improves it by a tick.
    const off = rng() < 0.1 ? -1 : Math.floor(-Math.log(1 - rng()) * 3);
    const price = buy ? ba - 3 - off : bb + 3 + off;
    const q = lots(rng);
    const res = book.submit(side, 'limit', price, q);
    return { text: `limit ${verb} ${q} @ ${fmtPx(price)}`, fills: res.fills };
  }
  if (r < 0.62) {
    // Marketable limit: crosses the spread by up to two ticks.
    const price = buy ? ba + Math.floor(rng() * 3) : bb - Math.floor(rng() * 3);
    const q = 5 * (1 + Math.floor(rng() * 12));
    const res = book.submit(side, 'limit', price, q);
    return { text: `limit ${verb} ${q} @ ${fmtPx(price)} (crosses)`, fills: res.fills };
  }
  if (r < 0.74) {
    const q = 5 * (1 + Math.floor(rng() * 12));
    const res = book.submit(side, 'market', 0, q);
    return { text: `market ${verb} ${q}`, fills: res.fills };
  }
  const victim = book.randomOrder(rng);
  if (victim) {
    book.cancel(victim.id);
    return { text: `cancel ${victim.side} ${victim.qty} @ ${fmtPx(victim.price)}`, fills: [] };
  }
  return { text: 'quiet', fills: [] };
}

export function makeBook(seed: number) {
  const rng = mulberry32(seed);
  const book = new Book();
  seedBook(book, rng);
  return { book, rng };
}
