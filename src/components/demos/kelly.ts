import { useEffect, useState } from 'preact/hooks';
import { mulberry32 } from './rng.ts';

export const N_BETS = 500;
export const N_PATHS = 20;

export interface KellyState {
  p: number; // win probability
  b: number; // net odds: win b per 1 staked
  f: number; // fraction of bankroll staked each bet
  seed: number;
}

export const DEFAULTS: KellyState = { p: 0.55, b: 1, f: 0.1, seed: 11 };
export const LIMITS = { p: [0.3, 0.75], b: [0.25, 3], f: [0, 1] } as const;

/** Unclamped Kelly fraction p - (1-p)/b; negative means no edge. */
export const rawKelly = (p: number, b: number) => p - (1 - p) / b;
export const kellyFraction = (p: number, b: number) => Math.max(0, rawKelly(p, b));

/** Expected log growth per bet, in nats. -Infinity if f >= 1 (a loss is ruin). */
export function growth(p: number, b: number, f: number): number {
  const win = p * Math.log1p(b * f);
  if (f >= 1) return -Infinity;
  return win + (1 - p) * Math.log1p(-f);
}

// ---- shared state: both figures read and write the same (p, b, f, seed) ----
let state: KellyState = DEFAULTS;
const subs = new Set<(s: KellyState) => void>();

export function setKelly(patch: Partial<KellyState>) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn(state));
}
export const resetKelly = () => setKelly({ ...DEFAULTS });

/**
 * Hydration-safe: always renders DEFAULTS first (matches the server HTML), then
 * syncs to the shared state, which may have been changed by the other figure.
 */
export function useKelly(): KellyState {
  const [s, setS] = useState(DEFAULTS);
  useEffect(() => {
    setS(state);
    subs.add(setS);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

// ---- simulation ----
let cacheSeed = NaN;
let cacheU: Float64Array | null = null;
function uniforms(seed: number): Float64Array {
  if (cacheU === null || cacheSeed !== seed) {
    const rng = mulberry32(seed);
    const u = new Float64Array(N_PATHS * N_BETS);
    for (let i = 0; i < u.length; i++) u[i] = rng();
    cacheU = u;
    cacheSeed = seed;
  }
  return cacheU;
}

/**
 * N_PATHS wealth paths of N_BETS bets, as log10(wealth / starting wealth).
 * The uniforms depend only on the seed, so changing p, b or f replays the same
 * random draws: a bet wins iff u < p. That makes the sliders morph the paths
 * instead of re-rolling them.
 */
export function simulate(p: number, b: number, f: number, seed: number): Float64Array[] {
  const u = uniforms(seed);
  const up = Math.log10(1 + b * f);
  const down = f >= 1 ? -Infinity : Math.log10(1 - f);
  const paths: Float64Array[] = [];
  for (let k = 0; k < N_PATHS; k++) {
    const path = new Float64Array(N_BETS + 1);
    let lw = 0;
    for (let i = 0; i < N_BETS; i++) {
      lw += u[k * N_BETS + i]! < p ? up : down;
      path[i + 1] = lw;
    }
    paths.push(path);
  }
  return paths;
}
