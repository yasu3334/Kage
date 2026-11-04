export interface AnimeGenreMeta {
  genre: string;
  slug: string;
  subtitle: string;
  bannerUrl: string;
  altBannerUrl?: string;
  jikanId?: number;
  anilistGenre?: string;
  anilistTag?: string;
  spotlightMalId?: number;
  kind?: 'genre' | 'theme' | 'demographic' | 'editorial' | 'collection';
}

export function slugifyRealm(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Complete canonical registry of ALL Anime Genres, Themes & Demographics in KAGE.
 */
export const ALL_ANIME_GENRES: AnimeGenreMeta[] = [
  {
    genre: 'Action',
    slug: 'action',
    subtitle: 'High-stakes battles, breathing techniques & legendary hunters',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg',
    altBannerUrl: '/assets/extracted/filter-action.jpg',
    jikanId: 1,
    anilistGenre: 'Action',
    spotlightMalId: 52299,
    kind: 'genre',
  },
  {
    genre: 'Romance',
    slug: 'romance',
    subtitle: 'Unforgettable melodies, fate & heartfelt confessions',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/124080-ARyLAHHgikRq.jpg',
    altBannerUrl: '/assets/extracted/filter-romance.jpg',
    jikanId: 22,
    anilistGenre: 'Romance',
    spotlightMalId: 23273,
    kind: 'genre',
  },
  {
    genre: 'Fantasy',
    slug: 'fantasy',
    subtitle: 'Arcane realms, dungeon gates & timeless journeys',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg',
    altBannerUrl: '/assets/extracted/filter-fantasy.jpg',
    jikanId: 10,
    anilistGenre: 'Fantasy',
    spotlightMalId: 52991,
    kind: 'genre',
  },
  {
    genre: 'Adventure',
    slug: 'adventure',
    subtitle: 'Grand Line voyages, uncharted continents & legendary quests',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    jikanId: 2,
    anilistGenre: 'Adventure',
    spotlightMalId: 21,
    kind: 'genre',
  },
  {
    genre: 'Comedy',
    slug: 'comedy',
    subtitle: 'Sharp wit, chaotic found families & riotous adventures',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg',
    jikanId: 4,
    anilistGenre: 'Comedy',
    spotlightMalId: 50265,
    kind: 'genre',
  },
  {
    genre: 'Drama',
    slug: 'drama',
    subtitle: 'Profound emotion, human resilience & unforgettable arcs',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21827-ROucgYiiiSpR.jpg',
    jikanId: 8,
    anilistGenre: 'Drama',
    spotlightMalId: 33352,
    kind: 'genre',
  },
  {
    genre: 'Sci-Fi',
    slug: 'sci-fi',
    subtitle: 'Worldline shifts, futuristic warfare & cosmic frontiers',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/n9253-JIhmKgBKsWUN.jpg',
    jikanId: 24,
    anilistGenre: 'Sci-Fi',
    spotlightMalId: 9253,
    kind: 'genre',
  },
  {
    genre: 'Mystery',
    slug: 'mystery',
    subtitle: 'Cryptic conspiracies, brilliant detectives & hidden truths',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
    jikanId: 7,
    anilistGenre: 'Mystery',
    spotlightMalId: 1535,
    kind: 'genre',
  },
  {
    genre: 'Thriller',
    slug: 'thriller',
    subtitle: 'Relentless tension, high-wire gambits & shocking turns',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/19-kJhwsB0Z97tL.jpg',
    jikanId: 41,
    anilistGenre: 'Thriller',
    spotlightMalId: 19,
    kind: 'genre',
  },
  {
    genre: 'Horror',
    slug: 'horror',
    subtitle: 'Ghouls in the dark, blood curses & chilling nightmares',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20605-RCJ7M71zLmrh.jpg',
    jikanId: 14,
    anilistGenre: 'Horror',
    spotlightMalId: 22319,
    kind: 'genre',
  },
  {
    genre: 'Slice of Life',
    slug: 'slice-of-life',
    subtitle: 'Everyday warmth, creative sparks & youth that lingers',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/130003-5F90a7BtsPQN.jpg',
    jikanId: 36,
    anilistGenre: 'Slice of Life',
    spotlightMalId: 47917,
    kind: 'genre',
  },
  {
    genre: 'Supernatural',
    slug: 'supernatural',
    subtitle: 'Demons, spirits & powers beyond mortal sight',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg',
    altBannerUrl: '/assets/extracted/filter-supernatural.jpg',
    jikanId: 37,
    anilistGenre: 'Supernatural',
    spotlightMalId: 38000,
    kind: 'genre',
  },
  {
    genre: 'Sports',
    slug: 'sports',
    subtitle: 'Egoist strikers, fierce rivalries & championship glory',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/137822-oevspckMGLuY.jpg',
    jikanId: 30,
    anilistGenre: 'Sports',
    spotlightMalId: 49596,
    kind: 'genre',
  },
  {
    genre: 'Mecha',
    slug: 'mecha',
    subtitle: 'Colossal EVA units, tactical frames & piloted rebellion',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/30-gEMoHHIqxDgN.jpg',
    jikanId: 18,
    anilistGenre: 'Mecha',
    spotlightMalId: 30,
    kind: 'genre',
  },
  {
    genre: 'Psychological',
    slug: 'psychological',
    subtitle: 'Strategic intellect, mind games & philosophical duels',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/98659-u46B5RCNl9il.jpg',
    jikanId: 40,
    anilistGenre: 'Psychological',
    spotlightMalId: 35507,
    kind: 'genre',
  },
  {
    genre: 'Music',
    slug: 'music',
    subtitle: 'Live stage electricity, classical concertos & sonic soul',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20665-j4kSsfhfkM24.jpg',
    jikanId: 19,
    anilistGenre: 'Music',
    spotlightMalId: 47917,
    kind: 'genre',
  },
  {
    genre: 'Historical',
    slug: 'historical',
    subtitle: 'Viking sagas, wandering samurai & dynastic intrigue',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101348-pivKKffCAwAY.jpg',
    jikanId: 13,
    anilistTag: 'Historical',
    spotlightMalId: 37521,
    kind: 'theme',
  },
  {
    genre: 'Family',
    slug: 'family',
    subtitle: 'Found families, wholesome bonds & heartwarming homes',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg',
    anilistTag: 'Family Life',
    spotlightMalId: 50265,
    kind: 'theme',
  },
  {
    genre: 'Dark Fantasy',
    slug: 'dark-fantasy',
    subtitle: 'Eclipses, cursed domains & ruthless survival',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg',
    altBannerUrl: '/assets/extracted/filter-dark-fantasy.jpg',
    anilistTag: 'Dark Fantasy',
    spotlightMalId: 40748,
    kind: 'theme',
  },
  {
    genre: 'Suspense',
    slug: 'suspense',
    subtitle: 'Cat-and-mouse pursuits, high stakes & nerve-shredding twists',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/19-kJhwsB0Z97tL.jpg',
    jikanId: 41,
    anilistGenre: 'Thriller',
    spotlightMalId: 19,
    kind: 'genre',
  },
  {
    genre: 'Isekai',
    slug: 'isekai',
    subtitle: 'Reincarnated realms, parallel worlds & destiny rewritten',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/108465-RgsRpTMhP9Sv.jpg',
    jikanId: 62,
    anilistTag: 'Isekai',
    spotlightMalId: 39535,
    kind: 'theme',
  },
  {
    genre: 'Cyberpunk',
    slug: 'cyberpunk',
    subtitle: 'Neon Night City chrome, cyberware & high-tech outlaws',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/120377-c15oLS8CA31s.jpg',
    anilistTag: 'Cyberpunk',
    spotlightMalId: 42310,
    kind: 'theme',
  },
  {
    genre: 'Martial Arts',
    slug: 'martial-arts',
    subtitle: 'Underground arenas, supreme kata & unbreakable fists',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/97888-0GMFaK3scX5B.jpg',
    jikanId: 17,
    anilistTag: 'Martial Arts',
    spotlightMalId: 34443,
    kind: 'theme',
  },
  {
    genre: 'Military',
    slug: 'military',
    subtitle: 'Frontline squadrons, strategic command & iron resolve',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/116589-SqwYWzaZCdD5.jpg',
    jikanId: 38,
    anilistTag: 'Military',
    spotlightMalId: 41457,
    kind: 'theme',
  },
  {
    genre: 'Super Power',
    slug: 'super-power',
    subtitle: 'Awakened quirks, domain expansions & limitless heroes',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21459-yeVkolGKdGUV.jpg',
    jikanId: 31,
    anilistTag: 'Super Power',
    spotlightMalId: 31964,
    kind: 'theme',
  },
  {
    genre: 'School',
    slug: 'school',
    subtitle: 'Prestigious academies, student councils & rivalries',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101921-GgvvFhlNhzlF.jpg',
    jikanId: 23,
    anilistTag: 'School',
    spotlightMalId: 37999,
    kind: 'theme',
  },
  {
    genre: 'Mythology',
    slug: 'mythology',
    subtitle: 'Ancient gods, cursed talismans & legendary folklore',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20958-Y7eQdz9VENBD.jpg',
    jikanId: 6,
    anilistTag: 'Mythology',
    spotlightMalId: 38000,
    kind: 'theme',
  },
  {
    genre: 'Shounen',
    slug: 'shounen',
    subtitle: 'Iconic rivalries, unbreakable bonds & generational epics',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/11061-8WkkTZ6duKpq.jpg',
    jikanId: 27,
    anilistTag: 'Shounen',
    spotlightMalId: 11061,
    kind: 'demographic',
  },
  {
    genre: 'Seinen',
    slug: 'seinen',
    subtitle: 'Mature storytelling, moral complexity & masterwork art',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21087-sHb9zUZFsHe1.jpg',
    jikanId: 42,
    anilistTag: 'Seinen',
    spotlightMalId: 30276,
    kind: 'demographic',
  },
  {
    genre: 'Shoujo',
    slug: 'shoujo',
    subtitle: 'Emotional resonance, zodiac curses & radiant romance',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21519-1ayMXgNlmByb.jpg',
    jikanId: 25,
    anilistTag: 'Shoujo',
    spotlightMalId: 38680,
    kind: 'demographic',
  },
];

export const ALL_GENRE_NAMES: string[] = ALL_ANIME_GENRES.map((g) => g.genre);

export interface RealmSectionDefinition {
  slug: string;
  title: string;
  subtitle: string;
  kind: 'genre' | 'theme' | 'demographic' | 'editorial' | 'collection';
  anilistGenre?: string;
  anilistTag?: string;
  jikanGenreId?: number;
  collectionRule?:
    | 'award_winning'
    | 'recently_released'
    | 'trending'
    | 'top_rated'
    | 'airing'
    | 'upcoming'
    | 'hidden_gems'
    | 'popular_now';
  bannerUrl?: string;
}

/**
 * Ordered REALMS horizontal carousel sections (Part 5 + Part 15).
 * Editorial & query-backed collections are explicitly modeled via `kind` and `collectionRule`
 * rather than pretending to be upstream genres.
 */
export const REALMS_CATEGORY_SECTIONS: RealmSectionDefinition[] = [
  {
    slug: 'action',
    title: 'Action',
    subtitle: 'High-stakes battles, breathing techniques & legendary hunters',
    kind: 'genre',
    anilistGenre: 'Action',
    jikanGenreId: 1,
  },
  {
    slug: 'romance',
    title: 'Romance',
    subtitle: 'Unforgettable melodies, fate & heartfelt confessions',
    kind: 'genre',
    anilistGenre: 'Romance',
    jikanGenreId: 22,
  },
  {
    slug: 'fantasy',
    title: 'Fantasy',
    subtitle: 'Arcane realms, dungeon gates & timeless journeys',
    kind: 'genre',
    anilistGenre: 'Fantasy',
    jikanGenreId: 10,
  },
  {
    slug: 'adventure',
    title: 'Adventure',
    subtitle: 'Grand Line voyages, uncharted continents & legendary quests',
    kind: 'genre',
    anilistGenre: 'Adventure',
    jikanGenreId: 2,
  },
  {
    slug: 'comedy',
    title: 'Comedy',
    subtitle: 'Sharp wit, chaotic found families & riotous adventures',
    kind: 'genre',
    anilistGenre: 'Comedy',
    jikanGenreId: 4,
  },
  {
    slug: 'drama',
    title: 'Drama',
    subtitle: 'Profound emotion, human resilience & unforgettable arcs',
    kind: 'genre',
    anilistGenre: 'Drama',
    jikanGenreId: 8,
  },
  {
    slug: 'sci-fi',
    title: 'Sci-Fi',
    subtitle: 'Worldline shifts, futuristic warfare & cosmic frontiers',
    kind: 'genre',
    anilistGenre: 'Sci-Fi',
    jikanGenreId: 24,
  },
  {
    slug: 'mystery',
    title: 'Mystery',
    subtitle: 'Cryptic conspiracies, brilliant detectives & hidden truths',
    kind: 'genre',
    anilistGenre: 'Mystery',
    jikanGenreId: 7,
  },
  {
    slug: 'thriller',
    title: 'Thriller',
    subtitle: 'Relentless tension, high-wire gambits & shocking turns',
    kind: 'genre',
    anilistGenre: 'Thriller',
    jikanGenreId: 41,
  },
  {
    slug: 'horror',
    title: 'Horror',
    subtitle: 'Ghouls in the dark, blood curses & chilling nightmares',
    kind: 'genre',
    anilistGenre: 'Horror',
    jikanGenreId: 14,
  },
  {
    slug: 'slice-of-life',
    title: 'Slice of Life',
    subtitle: 'Everyday warmth, creative sparks & youth that lingers',
    kind: 'genre',
    anilistGenre: 'Slice of Life',
    jikanGenreId: 36,
  },
  {
    slug: 'supernatural',
    title: 'Supernatural',
    subtitle: 'Demons, spirits & powers beyond mortal sight',
    kind: 'genre',
    anilistGenre: 'Supernatural',
    jikanGenreId: 37,
  },
  {
    slug: 'sports',
    title: 'Sports',
    subtitle: 'Egoist strikers, fierce rivalries & championship glory',
    kind: 'genre',
    anilistGenre: 'Sports',
    jikanGenreId: 30,
  },
  {
    slug: 'mecha',
    title: 'Mecha',
    subtitle: 'Colossal EVA units, tactical frames & piloted rebellion',
    kind: 'genre',
    anilistGenre: 'Mecha',
    jikanGenreId: 18,
  },
  {
    slug: 'psychological',
    title: 'Psychological',
    subtitle: 'Strategic intellect, mind games & philosophical duels',
    kind: 'genre',
    anilistGenre: 'Psychological',
    jikanGenreId: 40,
  },
  {
    slug: 'music',
    title: 'Music',
    subtitle: 'Live stage electricity, classical concertos & sonic soul',
    kind: 'genre',
    anilistGenre: 'Music',
    jikanGenreId: 19,
  },
  {
    slug: 'historical',
    title: 'Historical',
    subtitle: 'Viking sagas, wandering samurai & dynastic intrigue',
    kind: 'theme',
    anilistTag: 'Historical',
    jikanGenreId: 13,
  },
  {
    slug: 'family',
    title: 'Family',
    subtitle: 'Found families, wholesome bonds & heartwarming homes',
    kind: 'theme',
    anilistTag: 'Family Life',
  },
  {
    slug: 'award-winning',
    title: 'Award-winning',
    subtitle: 'Editorial collection · Major anime award winners & critically acclaimed landmarks',
    kind: 'editorial',
    jikanGenreId: 46,
    collectionRule: 'award_winning',
  },
  {
    slug: 'recently-released',
    title: 'Recently released',
    subtitle: 'Live release filter · Newly premiered anime series & films',
    kind: 'collection',
    collectionRule: 'recently_released',
  },
];

export const REALMS_DISCOVERY_COLLECTIONS: RealmSectionDefinition[] = [
  {
    slug: 'trending',
    title: 'Trending Anime',
    subtitle: 'Most actively watched & discussed titles right now',
    kind: 'collection',
    collectionRule: 'trending',
  },
  {
    slug: 'top-rated',
    title: 'Top Rated',
    subtitle: 'Highest community-scored anime of all time',
    kind: 'collection',
    collectionRule: 'top_rated',
  },
  {
    slug: 'currently-airing',
    title: 'Currently Airing',
    subtitle: 'Simulcast & seasonal series currently broadcasting',
    kind: 'collection',
    collectionRule: 'airing',
  },
  {
    slug: 'upcoming',
    title: 'Upcoming Anime',
    subtitle: 'Announced future anime adaptations & theatrical releases',
    kind: 'collection',
    collectionRule: 'upcoming',
  },
  {
    slug: 'hidden-gems',
    title: 'Hidden Gems',
    subtitle: 'Editorial rule · Score 7.8+ titles with focused cult followings',
    kind: 'editorial',
    collectionRule: 'hidden_gems',
  },
];

const EXTRA_GENRE_SECTIONS: RealmSectionDefinition[] = ALL_ANIME_GENRES.filter(
  (g) => !REALMS_CATEGORY_SECTIONS.some((c) => c.slug === g.slug)
).map((g) => ({
  slug: g.slug,
  title: g.genre,
  subtitle: g.subtitle,
  kind: g.kind || 'theme',
  anilistGenre: g.anilistGenre,
  anilistTag: g.anilistTag,
  jikanGenreId: g.jikanId,
  bannerUrl: g.bannerUrl,
}));

export const ALL_REALMS_SECTIONS: RealmSectionDefinition[] = [
  ...REALMS_CATEGORY_SECTIONS,
  ...REALMS_DISCOVERY_COLLECTIONS,
  ...EXTRA_GENRE_SECTIONS,
];

export function resolveRealmDefinition(slugOrName?: string | null): RealmSectionDefinition | null {
  if (!slugOrName) return null;
  const decoded = decodeURIComponent(slugOrName).trim();
  if (!decoded) return null;
  const lower = decoded.toLowerCase();
  const slugged = slugifyRealm(decoded);

  return (
    ALL_REALMS_SECTIONS.find(
      (s) =>
        s.slug === lower ||
        s.slug === slugged ||
        s.title.toLowerCase() === lower
    ) || null
  );
}
