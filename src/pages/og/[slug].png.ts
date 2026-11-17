import type { APIRoute, GetStaticPaths } from 'astro';
import { getPosts, formatDayMonth, readingTime } from '../../lib/posts';
import { renderOg, type OgCard } from '../../lib/og';
import { SITE } from '../../lib/site';

/** /og/default.png for the site, /og/<slug>.png for each post. */
export const getStaticPaths = (async () => {
  const posts = await getPosts();
  const cards: { slug: string; card: OgCard }[] = [
    { slug: 'default', card: { title: SITE.name, meta: 'Writing, projects and notes' } },
    ...posts.map((p) => ({
      slug: p.id,
      card: {
        title: p.data.title,
        meta: `${formatDayMonth(p.data.date)} ${p.data.date.getUTCFullYear()}  ·  ${readingTime(p.body)} min read`,
      },
    })),
  ];
  return cards.map(({ slug, card }) => ({ params: { slug }, props: { card } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props.card as OgCard);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
