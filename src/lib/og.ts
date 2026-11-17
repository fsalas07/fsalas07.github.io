import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const W = 1200;
const H = 630;
const PAPER = '#fffff8';
const INK = '#1a1a1a';
const MUTED = '#666259';
const RULE = '#d9d5c8';
const ACCENT = '#8c2a1f';

// satori reads TTF/OTF/WOFF (not WOFF2), so use the static @fontsource files.
const font = (pkg: string, file: string) =>
  readFileSync(join(process.cwd(), 'node_modules', pkg, 'files', file));

let fonts: Parameters<typeof satori>[1]['fonts'] | undefined;
const loadFonts = () =>
  (fonts ??= [
    { name: 'Newsreader', data: font('@fontsource/newsreader', 'newsreader-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Newsreader', data: font('@fontsource/newsreader', 'newsreader-latin-500-normal.woff'), weight: 500, style: 'normal' },
    { name: 'JetBrains Mono', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
  ]);

type Style = Record<string, string | number>;
type El = { type: string; props: { style: Style; children?: unknown } };
const h = (style: Style, children?: unknown): El => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

export interface OgCard {
  title: string;
  /** Metadata line, e.g. "17 Nov 2026 · 4 min read". The site host is appended. */
  meta?: string;
}

export async function renderOg({ title, meta }: OgCard): Promise<Buffer> {
  const size = title.length <= 36 ? 92 : title.length <= 70 ? 76 : title.length <= 110 ? 62 : 52;
  const line = [meta, 'fsalas07.github.io'].filter(Boolean).join('  ·  ');

  const tree = h(
    { boxSizing: 'border-box', width: W, height: H, flexDirection: 'column', justifyContent: 'space-between', padding: '72px 88px', background: PAPER, color: INK, fontFamily: 'Newsreader' },
    [
      h({ alignItems: 'center', gap: 20 }, [
        h({ width: 40, height: 4, background: ACCENT }),
        h({ fontFamily: 'JetBrains Mono', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: MUTED }, 'Fabian Salas'),
      ]),
      h({ display: 'block', fontSize: size, lineHeight: 1.12, letterSpacing: -1, fontWeight: 400, maxHeight: 360, overflow: 'hidden' }, title),
      h({ flexDirection: 'column', gap: 24 }, [
        h({ height: 2, width: '100%', background: RULE }),
        h({ display: 'block', fontFamily: 'JetBrains Mono', fontSize: 24, color: MUTED }, line),
      ]),
    ],
  );

  const svg = await satori(tree as never, { width: W, height: H, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
