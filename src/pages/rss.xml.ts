import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer';
import { getContainerRenderer as preactRenderer } from '@astrojs/preact/container-renderer';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import { getPosts, postUrl } from '../lib/posts';
import { SITE } from '../lib/site';
import Sidenote from '../components/Sidenote.astro';
import MarginNote from '../components/MarginNote.astro';
import Figure from '../components/Figure.astro';

/** Make root-relative URLs absolute and neutralise interactive islands for feed readers. */
function forFeed(html: string, site: string, pageUrl: string): string {
  return html
    .replace(
      /<astro-island\b[\s\S]*?<\/astro-island>/g,
      `<p><em>[Interactive demo: <a href="${pageUrl}">view it on the site</a>.]</em></p>`,
    )
    .replace(/<link\b[^>]*>|<input\b[^>]*>|<script\b[\s\S]*?<\/script>/g, '')
    .replace(/(\s(?:href|src))="\/(?!\/)/g, `$1="${site}/`)
    .replace(/(\s(?:href|src))="#/g, `$1="${pageUrl}#`);
}

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL(SITE.url)).href.replace(/\/$/, '');
  const posts = await getPosts();
  const renderers = await loadRenderers([mdxRenderer(), preactRenderer()]);
  const container = await AstroContainer.create({ renderers });
  const components = { Sidenote, MarginNote, Figure };

  const items = await Promise.all(
    posts.map(async (post) => {
      const link = postUrl(post);
      let content: string;
      try {
        const { Content } = await render(post);
        const html = await container.renderToString(Content, { props: { components } });
        content = forFeed(html, site, `${site}${link}`);
      } catch (err) {
        // A post that can't render standalone still gets an entry: summary + link.
        console.warn(`[rss] full content unavailable for ${post.id}:`, err);
        content = `<p>${post.data.description} <a href="${site}${link}">Read on the site.</a></p>`;
      }
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link,
        categories: post.data.tags,
        content,
      };
    }),
  );

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items,
    customData:
      `<language>${SITE.lang}</language>` +
      `<atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />`,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
  });
}
