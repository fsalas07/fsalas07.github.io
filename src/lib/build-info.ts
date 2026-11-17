import { execSync } from 'node:child_process';

/** Token emitted by Footer.astro; the page-weight integration swaps in the measured size. */
export const PAGE_WEIGHT_TOKEN = '__PAGE_WEIGHT__';

export interface BuildInfo {
  /** Full commit sha, or undefined when there is none (no commits yet). */
  sha?: string;
  /** 7-char sha, or "dev". */
  short: string;
  /** YYYY-MM-DD, UTC. */
  date: string;
}

const isSha = (s: string | undefined): s is string => !!s && /^[0-9a-f]{7,40}$/i.test(s);

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

let cached: BuildInfo | undefined;

/** Commit and date of this build. CI sets GITHUB_SHA; locally we ask git. */
export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  const envSha = process.env.GITHUB_SHA?.trim();
  const sha = isSha(envSha) ? envSha : git('rev-parse HEAD');
  const real = isSha(sha) ? sha : undefined;
  cached = {
    sha: real,
    short: real ? real.slice(0, 7) : 'dev',
    date: new Date().toISOString().slice(0, 10),
  };
  return cached;
}
