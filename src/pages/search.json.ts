import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { getPosts, isoDate, postUrl } from '../lib/posts';
import { NAV } from '../lib/site';

/** Static search index for the command palette (fetched lazily on first open). */
export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const entries = await Promise.all(
    posts.map(async (p) => {
      const { headings } = await render(p);
      return {
        title: p.data.title,
        url: postUrl(p),
        date: isoDate(p.data.date),
        description: p.data.description,
        tags: p.data.tags,
        headings: headings
          .filter((h) => h.depth >= 2 && h.depth <= 3)
          .slice(0, 8)
          .map((h) => ({ t: h.text.replace(/^#\s*/, ''), s: h.slug })),
      };
    }),
  );
  const label = (s: string) => (s === 'cv' ? 'CV' : s[0].toUpperCase() + s.slice(1));
  const pages = [{ title: 'Home', url: '/' }, ...NAV.map((n) => ({ title: label(n.label), url: n.href }))];
  return new Response(JSON.stringify({ posts: entries, pages }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
