import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

import { PAGE_WEIGHT_TOKEN } from '../lib/build-info';

const gz = (b: Buffer | string) => gzipSync(b, { level: 9 }).length;
const fmt = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Same-origin script / stylesheet / modulepreload URLs referenced by a page. */
function referencedAssets(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi)) urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes('stylesheet') && !rel.includes('modulepreload')) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) urls.add(href);
  }
  return [...urls];
}

/**
 * Measures every built page (HTML + the same-origin JS/CSS it references,
 * gzipped, fonts and images excluded) and writes the number into the footer.
 */
export default function pageWeight(): AstroIntegration {
  return {
    name: 'page-weight',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = resolve(fileURLToPath(dir));
        const assetCache = new Map<string, number>();
        const assetSize = (file: string) => {
          let n = assetCache.get(file);
          if (n === undefined) {
            n = existsSync(file) && statSync(file).isFile() ? gz(readFileSync(file)) : 0;
            assetCache.set(file, n);
          }
          return n;
        };
        const results: [string, string][] = [];

        for (const file of walk(root)) {
          const html = readFileSync(file, 'utf8');
          if (!html.includes(PAGE_WEIGHT_TOKEN)) continue;

          const pageDir = dirname(file);
          const assets = referencedAssets(html).flatMap((u) => {
            if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) return []; // external
            const path = decodeURIComponent(u.split(/[?#]/)[0]);
            const abs = resolve(path.startsWith('/') ? join(root, path) : join(pageDir, path));
            return abs.startsWith(root + sep) ? [abs] : [];
          });
          const assetBytes = [...new Set(assets)].reduce((n, f) => n + assetSize(f), 0);

          // The token is longer than the number that replaces it, so measure the
          // page with a same-width stand-in and iterate until it is stable.
          let label = '00.0 KB';
          for (let i = 0; i < 4; i++) {
            const next = fmt(gz(html.replaceAll(PAGE_WEIGHT_TOKEN, label)) + assetBytes);
            if (next === label) break;
            label = next;
          }
          writeFileSync(file, html.replaceAll(PAGE_WEIGHT_TOKEN, label));
          results.push([file.slice(root.length), label]);
        }
        logger.info(`page weight written to ${results.length} pages`);
        for (const [f, l] of results.filter(([f]) => f === `${sep}index.html` || f.includes('writing'))) {
          logger.info(`  ${f}: ${l}`);
        }
      },
    },
  };
}
