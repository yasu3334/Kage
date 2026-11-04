import { ALL_ANIME_GENRES } from './genres';
import type { RealmsAnimeItem } from '../components/RealmsComponents';

export const FALLBACK_ANIME_ITEMS: RealmsAnimeItem[] = [
  {
    malId: 52299,
    canonicalId: 52299,
    title: 'Solo Leveling (Ore dake Level Up na Ken)',
    englishTitle: 'Solo Leveling',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1170/148482.jpg',
    score: 8.42,
    episodes: 12,
    status: 'Finished Airing',
    genres: ['Action', 'Fantasy'],
    synopsis:
      'In a world where hunters face deadly monsters from gates, weak hunter Sung Jin-woo is granted a mysterious system that allows him to level up without limits.',
  },
  {
    malId: 38000,
    canonicalId: 38000,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    englishTitle: 'Demon Slayer: Kimetsu no Yaiba',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',
    score: 8.48,
    episodes: 26,
    status: 'Finished Airing',
    genres: ['Action', 'Fantasy'],
    synopsis:
      'Tanjiro Kamado sets out to become a demon slayer after his family is slaughtered and his sister Nezuko is turned into a demon.',
  },
  {
    malId: 40748,
    canonicalId: 40748,
    title: 'Jujutsu Kaisen',
    englishTitle: 'Jujutsu Kaisen',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1171/109222.jpg',
    score: 8.58,
    episodes: 24,
    status: 'Finished Airing',
    genres: ['Action', 'Supernatural'],
    synopsis:
      'Yuji Itadori swallows a cursed finger of the King of Curses Sukuna and enrolls in Tokyo Jujutsu High to exorcise spirits.',
  },
  {
    malId: 16498,
    canonicalId: 16498,
    title: 'Attack on Titan (Shingeki no Kyojin)',
    englishTitle: 'Attack on Titan',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
    score: 8.55,
    episodes: 25,
    status: 'Finished Airing',
    genres: ['Action', 'Drama', 'Mystery'],
    synopsis:
      'Humanity fights for survival inside concentric walls against giant man-eating humanoids known as Titans.',
  },
  {
    malId: 52991,
    canonicalId: 52991,
    title: 'Sousou no Frieren (Frieren: Beyond Journey’s End)',
    englishTitle: "Frieren: Beyond Journey's End",
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1015/138075.jpg',
    score: 9.32,
    episodes: 28,
    status: 'Finished Airing',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    synopsis:
      'An elven mage reflects on human mortality and connection decades after defeating the Demon King with her hero party.',
  },
  {
    malId: 21,
    canonicalId: 21,
    title: 'One Piece',
    englishTitle: 'One Piece',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1244/138851.jpg',
    score: 8.72,
    episodes: 1100,
    status: 'Currently Airing',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis:
      'Monkey D. Luffy and his Straw Hat Pirates sail the Grand Line in search of the legendary treasure One Piece.',
  },
];

export function getStaticRealmsFallback() {
  const featured = FALLBACK_ANIME_ITEMS[0];
  const featuredPool = FALLBACK_ANIME_ITEMS;

  const initialRows = [
    {
      definition: {
        slug: 'popular-now',
        label: 'Trending Now',
        category: 'Spotlight',
        shortDescription: 'The most watched and talked about anime worldwide.',
      },
      items: FALLBACK_ANIME_ITEMS,
      total: FALLBACK_ANIME_ITEMS.length,
      source: 'curated',
    },
    {
      definition: {
        slug: 'action',
        label: 'High-Octane Action & Battles',
        category: 'Action',
        shortDescription: 'Blade duels, sorcery, and martial prowess.',
      },
      items: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Action')),
      total: 4,
      source: 'curated',
    },
    {
      definition: {
        slug: 'fantasy',
        label: 'Grand Fantasy & Magic',
        category: 'Fantasy',
        shortDescription: 'Immersive realms of spells, dragons, and ancient curses.',
      },
      items: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Fantasy')),
      total: 4,
      source: 'curated',
    },
  ];

  const deferredCategorySections = ALL_ANIME_GENRES.slice(0, 10).map((g) => ({
    slug: g.slug,
    label: g.genre,
    category: g.kind || 'genre',
    shortDescription: g.subtitle,
  }));

  const discoveryCollections = [
    'peak-shounen',
    'dark-fantasy-abyss',
    'psychological-masterminds',
    'timeless-classics',
  ].map((slug: string) => ({
    slug,
    label: slug.replace(/-/g, ' ').toUpperCase(),
    category: 'Collection',
    shortDescription: 'Curated anime selections.',
  }));

  return {
    featured,
    featuredPool,
    initialRows,
    deferredCategorySections,
    discoveryCollections,
    recentlyViewed: [],
    communityHighlights: [],
    featuredGuilds: [
      { id: 1, name: 'SHADOW MONARCH SQUAD', slug: 'shadow-monarch-squad', memberCount: 1420 },
      { id: 2, name: 'INFINITY CASTLE', slug: 'infinity-castle', memberCount: 1190 },
      { id: 3, name: 'WINGS OF FREEDOM', slug: 'wings-of-freedom', memberCount: 1050 },
    ],
  };
}
