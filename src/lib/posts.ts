import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'writing'>;

/** All posts, newest first. Drafts are visible in `astro dev` only. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('writing', ({ data }) =>
    import.meta.env.DEV ? true : !data.draft,
  );
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** `prev` is the next-older post, `next` the next-newer one. */
export function adjacent(posts: Post[], id: string) {
  const i = posts.findIndex((p) => p.id === id);
  return {
    prev: i >= 0 ? posts[i + 1] : undefined,
    next: i > 0 ? posts[i - 1] : undefined,
  };
}

/** Whole minutes at 230 wpm, ignoring fenced code, imports and markup. */
export function readingTime(body: string | undefined): number {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^(import|export) .*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ');
  const words = text.split(/\s+/).filter((w) => /\w/.test(w)).length;
  return Math.max(1, Math.ceil(words / 230));
}

const utc = { timeZone: 'UTC' } as const;

/** "17 November 2026" */
export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...utc });

/** "17 Nov" */
export const formatDayMonth = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...utc });

/** "2026-11-17" */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const postUrl = (p: Post) => `/writing/${p.id}/`;
