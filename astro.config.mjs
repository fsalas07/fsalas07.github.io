// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { unified } from '@astrojs/markdown-remark';
import pageWeight from './src/integrations/page-weight.ts';

// https://fsalas07.github.io is a GitHub Pages *user* site, served from the
// root, so there is deliberately no `base`.
export default defineConfig({
  site: 'https://fsalas07.github.io',
  integrations: [mdx(), preact(), sitemap(), pageWeight()],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  build: { inlineStylesheets: 'always' },
  markdown: {
    // Astro 7 defaults to the native Sätteri processor; remark-math and
    // rehype-katex need the unified (remark/rehype) pipeline.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        // Slugs first, so ids come from the heading text and not KaTeX markup.
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'prepend',
            properties: { className: ['heading-anchor'], ariaLabel: 'Link to this section' },
            // Empty on purpose: the glyph is drawn in CSS, so it never ends up
            // in the extracted headings (TOC, search index, feed).
            content: { type: 'element', tagName: 'span', properties: { ariaHidden: 'true' }, children: [] },
          },
        ],
        rehypeKatex,
      ],
    }),
    syntaxHighlight: 'shiki',
    shikiConfig: {
      // `light-dark()` follows the CSS `color-scheme`, so the manual
      // data-theme override works for code blocks with no extra CSS.
      themes: { light: 'min-light', dark: 'min-dark' },
      defaultColor: 'light-dark()',
    },
  },
});
