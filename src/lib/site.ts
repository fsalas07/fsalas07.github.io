export const SITE = {
  name: 'Fabian Salas',
  url: 'https://fsalas07.github.io',
  // TODO: one-line description of what you do
  description: 'Personal website and writing of Fabian Salas.',
  github: 'https://github.com/fsalas07',
  /** Repository path under `github`. */
  repo: 'fsalas07.github.io',
  rss: '/rss.xml',
  lang: 'en',
} as const;

export const NAV = [
  { href: '/writing/', label: 'writing' },
  { href: '/projects/', label: 'projects' },
  { href: '/cv/', label: 'cv' },
  { href: '/now/', label: 'now' },
] as const;
