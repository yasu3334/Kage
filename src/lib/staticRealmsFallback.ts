import { ALL_ANIME_GENRES } from './genres';
import type { RealmsAnimeItem } from '../components/RealmsComponents';

export const FALLBACK_ANIME_ITEMS: RealmsAnimeItem[] = [
  {
    malId: 52299,
    canonicalId: 52299,
    title: 'Solo Leveling (Ore dake Level Up na Ken)',
    englishTitle: 'Solo Leveling',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
    score: 8.52,
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
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
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
  {
    malId: 57334,
    canonicalId: 57334,
    title: 'Dandadan',
    englishTitle: 'DAN DA DAN',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1584/143719.jpg',
    score: 8.65,
    episodes: 12,
    status: 'Currently Airing',
    genres: ['Action', 'Comedy', 'Supernatural', 'Sci-Fi'],
    synopsis:
      'Momo Ayase and Okarun discover that extraterrestrial beings and demonic yokai are shockingly real in this high-octane battle comedy.',
  },
  {
    malId: 54790,
    canonicalId: 54790,
    title: 'Kaiju No. 8',
    englishTitle: 'Kaiju No. 8',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1946/136661.jpg',
    score: 8.35,
    episodes: 12,
    status: 'Finished Airing',
    genres: ['Action', 'Sci-Fi'],
    synopsis:
      'Kafka Hibino gains the ability to transform into a humanoid Kaiju and enlists in the Defense Force to protect humanity.',
  },
  {
    malId: 41467,
    canonicalId: 41467,
    title: 'Bleach: Sennen Kessen-hen (Thousand-Year Blood War)',
    englishTitle: 'Bleach: Thousand-Year Blood War',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1764/126627.jpg',
    score: 8.92,
    episodes: 13,
    status: 'Finished Airing',
    genres: ['Action', 'Supernatural'],
    synopsis:
      'The Soul Society faces extinction as Yhwach and the Quincy Empire declare war. Ichigo Kurosaki enters the fray with unprecedented bankai power.',
  },
  {
    malId: 44511,
    canonicalId: 44511,
    title: 'Chainsaw Man',
    englishTitle: 'Chainsaw Man',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1806/126216.jpg',
    score: 8.51,
    episodes: 12,
    status: 'Finished Airing',
    genres: ['Action', 'Supernatural'],
    synopsis:
      'Denji fuses with his pet devil Pochita to become Chainsaw Man, hunting down deadly fiends for the Public Safety Division.',
  },
  {
    malId: 1535,
    canonicalId: 1535,
    title: 'Death Note',
    englishTitle: 'Death Note',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/9/9453.jpg',
    score: 8.62,
    episodes: 37,
    status: 'Finished Airing',
    genres: ['Psychological', 'Supernatural', 'Mystery'],
    synopsis:
      'Light Yagami obtains a supernatural notebook capable of killing anyone whose name is written inside, battling world-class detective L in a battle of wits.',
  },
  {
    malId: 5114,
    canonicalId: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    englishTitle: 'Fullmetal Alchemist: Brotherhood',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1223/96541.jpg',
    score: 9.1,
    episodes: 64,
    status: 'Finished Airing',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis:
      'Brothers Edward and Alphonse Elric search for the Philosopher\'s Stone to restore their bodies after a disastrous alchemy ritual.',
  },
  {
    malId: 11061,
    canonicalId: 11061,
    title: 'Hunter x Hunter (2011)',
    englishTitle: 'Hunter x Hunter',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1337/99013.jpg',
    score: 9.04,
    episodes: 148,
    status: 'Finished Airing',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis:
      'Gon Freecss trains to become an elite Hunter and master the deadly martial art of Nen in search of his father.',
  },
  {
    malId: 42310,
    canonicalId: 42310,
    title: 'Cyberpunk: Edgerunners',
    englishTitle: 'Cyberpunk: Edgerunners',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1818/126435.jpg',
    score: 8.6,
    episodes: 10,
    status: 'Finished Airing',
    genres: ['Action', 'Sci-Fi'],
    synopsis:
      'A street kid trying to survive in Night City becomes an edgerunner—a mercenary outlaw in a tech and body-modification obsessed metropolis.',
  },
  {
    malId: 37521,
    canonicalId: 37521,
    title: 'Vinland Saga',
    englishTitle: 'Vinland Saga',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1500/103005.jpg',
    score: 8.75,
    episodes: 24,
    status: 'Finished Airing',
    genres: ['Action', 'Adventure', 'Drama'],
    synopsis:
      'Thorfinn pursues vengeance against the Viking mercenary leader Askeladd across blood-soaked 11th-century England.',
  },
  {
    malId: 1575,
    canonicalId: 1575,
    title: 'Code Geass: Hangyaku no Lelouch',
    englishTitle: 'Code Geass: Lelouch of the Rebellion',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1032/135088.jpg',
    score: 8.7,
    episodes: 25,
    status: 'Finished Airing',
    genres: ['Action', 'Drama', 'Sci-Fi'],
    synopsis:
      'Exiled prince Lelouch vi Britannia gains the absolute power of Geass to command anyone to do his bidding, waging war against an empire.',
  },
  {
    malId: 9253,
    canonicalId: 9253,
    title: 'Steins;Gate',
    englishTitle: 'Steins;Gate',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1935/127974.jpg',
    score: 9.07,
    episodes: 24,
    status: 'Finished Airing',
    genres: ['Drama', 'Sci-Fi', 'Suspense'],
    synopsis:
      'Self-proclaimed mad scientist Rintaro Okabe accidentally invents a microwave that can send text messages into the past, triggering timeline shifts.',
  },
  {
    malId: 52034,
    canonicalId: 52034,
    title: 'Oshi no Ko',
    englishTitle: '[Oshi No Ko]',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1812/134736.jpg',
    score: 8.7,
    episodes: 11,
    status: 'Finished Airing',
    genres: ['Drama', 'Mystery', 'Supernatural'],
    synopsis:
      'Reincarnated as twins of idol sensation Ai Hoshino, Aqua and Ruby navigate the dazzling yet dangerous secrets of the entertainment industry.',
  },
  {
    malId: 46569,
    canonicalId: 46569,
    title: 'Jigokuraku (Hell’s Paradise)',
    englishTitle: "Hell's Paradise",
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1075/131925.jpg',
    score: 8.24,
    episodes: 13,
    status: 'Finished Airing',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis:
      'Gabimaru the Hollow journeys to a supernatural island to recover the Elixir of Life in exchange for a full pardon.',
  },
  {
    malId: 54900,
    canonicalId: 54900,
    title: 'Wind Breaker',
    englishTitle: 'WIND BREAKER',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1438/141816.jpg',
    score: 8.12,
    episodes: 13,
    status: 'Finished Airing',
    genres: ['Action'],
    synopsis:
      'Haruka Sakura enters Furin High to fight to the top, discovering that the school’s delinquents protect their town from danger.',
  },
  {
    malId: 23273,
    canonicalId: 23273,
    title: 'Shigatsu wa Kimi no Uso',
    englishTitle: 'Your Lie in April',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1405/143284.jpg',
    score: 8.65,
    episodes: 22,
    status: 'Finished Airing',
    genres: ['Drama', 'Romance'],
    synopsis:
      'Traumatized piano prodigy Kosei Arima regains his passion for music after meeting free-spirited violinist Kaori Miyazono.',
  },
  {
    malId: 30,
    canonicalId: 30,
    title: 'Neon Genesis Evangelion',
    englishTitle: 'Neon Genesis Evangelion',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1314/108941.jpg',
    score: 8.35,
    episodes: 26,
    status: 'Finished Airing',
    genres: ['Action', 'Drama', 'Sci-Fi', 'Suspense'],
    synopsis:
      'Shinji Ikari pilots giant biomechanical Evangelion Unit-01 against celestial Entities known as Angels threatening Earth.',
  },
];

export function getStaticRealmsFallback() {
  const featured = FALLBACK_ANIME_ITEMS[0];
  const featuredPool = FALLBACK_ANIME_ITEMS.slice(0, 8);

  const initialRows = [
    {
      definition: {
        slug: 'popular-now',
        label: 'Trending Now Across Realms',
        category: 'Spotlight',
        shortDescription: 'The most watched, talked about, and celebrated anime worldwide.',
      },
      items: FALLBACK_ANIME_ITEMS.slice(0, 10),
      total: 10,
      source: 'curated',
    },
    {
      definition: {
        slug: 'action',
        label: 'High-Octane Action & Battles',
        category: 'Action',
        shortDescription: 'Sorcery showdowns, bankai clashes, and blade-sharp animation.',
      },
      items: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Action')),
      total: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Action')).length,
      source: 'curated',
    },
    {
      definition: {
        slug: 'fantasy',
        label: 'Grand Fantasy & Magic',
        category: 'Fantasy',
        shortDescription: 'Ancient curses, leveling systems, and sprawling mystical worlds.',
      },
      items: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Fantasy')),
      total: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Fantasy')).length,
      source: 'curated',
    },
    {
      definition: {
        slug: 'psychological',
        label: 'Psychological & Masterminds',
        category: 'Psychological',
        shortDescription: 'Intellectual mind games, cat-and-mouse traps, and moral ambiguity.',
      },
      items: FALLBACK_ANIME_ITEMS.filter(
        (a) =>
          (a.genres || []).includes('Psychological') ||
          (a.genres || []).includes('Mystery') ||
          (a.genres || []).includes('Suspense')
      ),
      total: 5,
      source: 'curated',
    },
    {
      definition: {
        slug: 'sci-fi',
        label: 'Cyberpunk & Futuristic Sci-Fi',
        category: 'Sci-Fi',
        shortDescription: 'Neon cyber-dystopias, time paradoxes, and mech warfare.',
      },
      items: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Sci-Fi')),
      total: FALLBACK_ANIME_ITEMS.filter((a) => (a.genres || []).includes('Sci-Fi')).length,
      source: 'curated',
    },
    {
      definition: {
        slug: 'drama-romance',
        label: 'Emotion, Music & Human Connection',
        category: 'Drama',
        shortDescription: 'Unforgettable soundtracks, heartfelt journeys, and tears.',
      },
      items: FALLBACK_ANIME_ITEMS.filter(
        (a) => (a.genres || []).includes('Drama') || (a.genres || []).includes('Romance')
      ),
      total: 6,
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
