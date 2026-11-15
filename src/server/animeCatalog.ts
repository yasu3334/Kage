import { ALL_ANIME_GENRES, ALL_GENRE_NAMES } from '../lib/genres.ts';

export interface AnimeItem {
  malId: number;
  title: string;
  englishTitle?: string | null;
  year?: number | null;
  seasonsLabel?: string | null;
  episodes?: number | null;
  score?: number | null;
  status?: string | null;
  synopsis: string;
  imageUrl: string;
  bannerUrl?: string | null;
  genres: string[];
  studios: string[];
  streaming: { name: string; url: string }[];
  trailerUrl?: string | null;
}

export interface AnimeCharacterItem {
  id: number;
  name: string;
  role: string;
  imageUrl: string;
  voiceActor?: string | null;
}

export interface AnimeStaffItem {
  id: number;
  name: string;
  positions: string[];
  imageUrl: string;
}

export interface AnimeEpisodeItem {
  number: number;
  title: string;
  aired?: string | null;
  score?: number | null;
}

export interface RecommendationResult {
  anime: AnimeItem;
  matchScore: number;
  reasons: string[];
  matchedGenres: string[];
}

export interface UserTasteSignals {
  animeEntries: {
    animeMalId: number;
    animeTitle: string;
    genres: string[];
    status: string;
    score: number | null;
    episodesWatched: number;
  }[];
  genreRatings: {
    genre: string;
    rating: number;
  }[];
  favoriteGenres: string[];
  joinedGuilds: {
    name: string;
    animeMalId: number | null;
    genreTags: string[];
  }[];
  authoredPosts: {
    animeMalId: number | null;
    animeTitle: string | null;
    genreTags: string[];
  }[];
  interactedGenres: string[];
}

export interface TasteProfileSummary {
  hasSignals: boolean;
  totalSignals: number;
  watchedCount: number;
  ratedGenresCount: number;
  communitySignalCount: number;
  topAffinities: { genre: string; weight: number; normalized: number }[];
}

// Verified canonical anime metadata grounded in MyAnimeList IDs, crisp 1920px AniList banners & official streaming links.
export const VERIFIED_ANIME_CATALOG: AnimeItem[] = [
  {
    malId: 52299,
    title: 'Solo Leveling',
    englishTitle: 'Solo Leveling',
    year: 2024,
    seasonsLabel: '2 seasons',
    episodes: 12,
    score: 8.5,
    status: 'Finished Airing',
    synopsis:
      'Ten years ago, "the Gate" appeared and connected the real world with the realm of magic and monsters. Ordinary E-rank hunter Sung Jinwoo discovers a mysterious double dungeon that grants him a unique System capable of leveling up without limits.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
    bannerUrl: '/assets/extracted/solo-hero-home.jpg',
    genres: ['Action', 'Adventure', 'Fantasy', 'Dark Fantasy', 'Super Power'],
    studios: ['A-1 Pictures'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GDKHZEJ0K/solo-leveling' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 38000,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    englishTitle: 'Demon Slayer: Kimetsu no Yaiba',
    year: 2019,
    seasonsLabel: '4 seasons',
    episodes: 26,
    score: 8.5,
    status: 'Finished Airing',
    synopsis:
      'Ever since the death of his father, Tanjiro Kamado has supported his family until tragedy strikes and his sister Nezuko is turned into a demon. Alongside fellow slayers Zenitsu Agatsuma and Inosuke Hashibira, Tanjiro joins the Demon Slayer Corps.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg',
    genres: ['Action', 'Supernatural', 'Fantasy', 'Dark Fantasy', 'Historical', 'Mythology', 'Shounen'],
    studios: ['ufotable'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 16498,
    title: 'Attack on Titan',
    englishTitle: 'Attack on Titan',
    year: 2013,
    seasonsLabel: '4 seasons',
    episodes: 25,
    score: 8.6,
    status: 'Finished Airing',
    synopsis:
      'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans, forcing humans to hide in fear behind enormous concentric walls. Eren Yeager vows to eradicate every last Titan.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    genres: ['Action', 'Drama', 'Suspense', 'Mystery', 'Dark Fantasy', 'Military', 'Shounen'],
    studios: ['Wit Studio', 'MAPPA'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GR751KNZY/attack-on-titan' },
      { name: 'Hulu', url: 'https://www.hulu.com/' },
    ],
  },
  {
    malId: 21,
    title: 'One Piece',
    englishTitle: 'One Piece',
    year: 1999,
    seasonsLabel: 'Ongoing',
    episodes: 1122,
    score: 8.7,
    status: 'Currently Airing',
    synopsis:
      'Monkey D. Luffy refuses to let anyone or anything stand in the way of his quest to become the King of All Pirates. With a course charted for the treacherous waters of the Grand Line, this captain never anchors until he claims the One Piece.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1244/138851l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    genres: ['Action', 'Adventure', 'Comedy', 'Fantasy', 'Super Power', 'Shounen'],
    studios: ['Toei Animation'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GRMG8ZQZR/one-piece' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 40748,
    title: 'Jujutsu Kaisen',
    englishTitle: 'Jujutsu Kaisen',
    year: 2020,
    seasonsLabel: '2 seasons',
    episodes: 24,
    score: 8.6,
    status: 'Finished Airing',
    synopsis:
      'Idly indulging in baseless paranormal activities with the Occult Club, high schooler Yuji Itadori swallows a cursed talisman—the finger of Ryomen Sukuna—and enters Tokyo Jujutsu High under Satoru Gojo.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg',
    genres: ['Action', 'Supernatural', 'Dark Fantasy', 'School', 'Mythology', 'Shounen'],
    studios: ['MAPPA'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GRDV0019R/jujutsu-kaisen' },
    ],
  },
  {
    malId: 52991,
    title: "Frieren: Beyond Journey's End",
    englishTitle: "Frieren: Beyond Journey's End",
    year: 2023,
    seasonsLabel: '1 season',
    episodes: 28,
    score: 9.3,
    status: 'Finished Airing',
    synopsis:
      'During their decade-long quest to defeat the Demon King, the elven mage Frieren and her courageous party brought peace to the land. Decades later, Frieren embarks on a new journey to understand humanity and fleeting time.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
    bannerUrl: '/assets/extracted/filter-fantasy.jpg',
    genres: ['Adventure', 'Drama', 'Fantasy', 'Slice of Life', 'Shounen'],
    studios: ['Madhouse'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren-beyond-journeys-end' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 23273,
    title: 'Your Lie in April',
    englishTitle: 'Your Lie in April',
    year: 2014,
    seasonsLabel: '1 season',
    episodes: 22,
    score: 8.6,
    status: 'Finished Airing',
    synopsis:
      'Kousei Arima is a child prodigy known as the "Human Metronome" until his mother passes away, leaving him unable to hear the sound of his piano. Everything changes in April when he meets free-spirited violinist Kaori Miyazono.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/3/67177l.jpg',
    bannerUrl: '/assets/extracted/your-lie-banner.jpg',
    genres: ['Drama', 'Romance', 'Music', 'School', 'Shounen'],
    studios: ['A-1 Pictures'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G63V7KN9Y/your-lie-in-april' },
    ],
  },
  {
    malId: 32281,
    title: 'Your Name.',
    englishTitle: 'Your Name.',
    year: 2016,
    seasonsLabel: 'Movie',
    episodes: 1,
    score: 8.8,
    status: 'Finished Airing',
    synopsis:
      'Mitsuha Miyamizu, a high school girl yearning to live in bustling Tokyo, and Taki Tachibana, a busy city boy, wake up one day to discover they are mysteriously swapping bodies across time and distance.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/5/87048l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21519-1ayMXgNlmByb.jpg',
    genres: ['Drama', 'Romance', 'Supernatural'],
    studios: ['CoMix Wave Films'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 28851,
    title: 'A Silent Voice',
    englishTitle: 'A Silent Voice',
    year: 2016,
    seasonsLabel: 'Movie',
    episodes: 1,
    score: 8.9,
    status: 'Finished Airing',
    synopsis:
      'Haunted by regret over bullying his deaf classmate Shouko Nishimiya in elementary school, Shouya Ishida sets out years later to make amends and rediscover the courage to listen.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1122/96435l.jpg',
    bannerUrl: '/assets/extracted/filter-romance.jpg',
    genres: ['Drama', 'Romance', 'Slice of Life', 'School'],
    studios: ['Kyoto Animation'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 42897,
    title: 'Horimiya',
    englishTitle: 'Horimiya',
    year: 2021,
    seasonsLabel: '2 seasons',
    episodes: 13,
    score: 8.2,
    status: 'Finished Airing',
    synopsis:
      'On the surface, Kyouko Hori and Izumi Miyamura could not be more different. Outside school walls, their hidden sides collide in an effortless, heartfelt high school romance.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1695/111486l.jpg',
    bannerUrl: '/assets/extracted/filter-romance.jpg',
    genres: ['Romance', 'Comedy', 'Slice of Life', 'School', 'Shounen'],
    studios: ['CloverWorks'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G9VHN9P43/horimiya' }],
  },
  {
    malId: 37999,
    title: 'Kaguya-sama: Love is War',
    englishTitle: 'Kaguya-sama: Love is War',
    year: 2019,
    seasonsLabel: '3 seasons',
    episodes: 12,
    score: 8.4,
    status: 'Finished Airing',
    synopsis:
      'At the renowned Shuchiin Academy, student council president Miyuki Shirogane and vice president Kaguya Shinomiya treat romance as psychological warfare: whoever confesses first loses.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1295/106551l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101921-GgvvFhlNhzlF.jpg',
    genres: ['Comedy', 'Romance', 'Psychological', 'School', 'Seinen'],
    studios: ['A-1 Pictures'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GRJ0J828Y/kaguya-sama-love-is-war' },
    ],
  },
  {
    malId: 38680,
    title: 'Fruits Basket',
    englishTitle: 'Fruits Basket',
    year: 2019,
    seasonsLabel: '3 seasons',
    episodes: 25,
    score: 8.2,
    status: 'Finished Airing',
    synopsis:
      'Tohru Honda begins living with the mysterious Sohma clan and discovers their ancient curse: twelve family members transform into animals of the Chinese zodiac.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1447/99827l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21519-1ayMXgNlmByb.jpg',
    genres: ['Drama', 'Romance', 'Supernatural', 'Mythology', 'Shoujo'],
    studios: ['TMS Entertainment'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G6ZJMGEXY/fruits-basket' },
    ],
  },
  {
    malId: 44511,
    title: 'Chainsaw Man',
    englishTitle: 'Chainsaw Man',
    year: 2022,
    seasonsLabel: '1 season',
    episodes: 12,
    score: 8.5,
    status: 'Finished Airing',
    synopsis:
      'Betrayed and fused with his Chainsaw Devil companion Pochita, Denji is reborn as Chainsaw Man and inducted into Public Safety Devil Hunters.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
    bannerUrl: '/assets/extracted/filter-dark-fantasy.jpg',
    genres: ['Action', 'Fantasy', 'Dark Fantasy', 'Supernatural', 'Horror', 'Shounen'],
    studios: ['MAPPA'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GVDHX8QNW/chainsaw-man' }],
  },
  {
    malId: 1535,
    title: 'Death Note',
    englishTitle: 'Death Note',
    year: 2006,
    seasonsLabel: '1 season',
    episodes: 37,
    score: 8.6,
    status: 'Finished Airing',
    synopsis:
      'Genius student Light Yagami discovers the Shinigami Ryuk’s Death Note, igniting a legendary cat-and-mouse war of intellect against the enigmatic detective L.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1079/138100l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
    genres: ['Mystery', 'Supernatural', 'Suspense', 'Psychological', 'Dark Fantasy', 'Shounen'],
    studios: ['Madhouse'],
    streaming: [
      { name: 'Netflix', url: 'https://www.netflix.com/' },
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' },
    ],
  },
  {
    malId: 19,
    title: 'Monster',
    englishTitle: 'Monster',
    year: 2004,
    seasonsLabel: '1 season',
    episodes: 74,
    score: 8.9,
    status: 'Finished Airing',
    synopsis:
      'Brilliant neurosurgeon Dr. Kenzo Tenma saves a young boy’s life over a politician’s, only to discover years later that the child he saved has grown into a charismatic, terrifying sociopath.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx19-gtMC64182sm4.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/19-kJhwsB0Z97tL.jpg',
    genres: ['Drama', 'Mystery', 'Psychological', 'Suspense', 'Horror', 'Seinen'],
    studios: ['Madhouse'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 9253,
    title: 'Steins;Gate',
    englishTitle: 'Steins;Gate',
    year: 2011,
    seasonsLabel: '1 season',
    episodes: 24,
    score: 9.1,
    status: 'Finished Airing',
    synopsis:
      'Eccentric scientist Rintarou Okabe and his Future Gadget Lab accidentally invent a device capable of sending messages into the past, triggering a catastrophic butterfly effect across worldlines.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1935/127974l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/n9253-JIhmKgBKsWUN.jpg',
    genres: ['Drama', 'Sci-Fi', 'Suspense', 'Psychological', 'Mystery'],
    studios: ['White Fox'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GYWE7W5GY/steinsgate' }],
  },
  {
    malId: 42310,
    title: 'Cyberpunk: Edgerunners',
    englishTitle: 'Cyberpunk: Edgerunners',
    year: 2022,
    seasonsLabel: '1 season',
    episodes: 10,
    score: 8.6,
    status: 'Finished Airing',
    synopsis:
      'In a neon-soaked dystopia riddled with corruption and cybernetic implants, street kid David Martinez installs military-grade Sandevistan chrome to survive Night City as an Edgerunner.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx120377-ayZPoxiWt4Li.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/120377-c15oLS8CA31s.jpg',
    genres: ['Action', 'Sci-Fi', 'Cyberpunk', 'Drama', 'Psychological'],
    studios: ['Trigger'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 30,
    title: 'Neon Genesis Evangelion',
    englishTitle: 'Neon Genesis Evangelion',
    year: 1995,
    seasonsLabel: '1 season',
    episodes: 26,
    score: 8.4,
    status: 'Finished Airing',
    synopsis:
      'Fifteen years after a global cataclysm, teenager Shinji Ikari is summoned to Tokyo-3 by his estranged father to pilot the giant bio-machine Evangelion Unit-01 against mysterious Angels.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx30-AI1zr74Dh4ye.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/30-gEMoHHIqxDgN.jpg',
    genres: ['Action', 'Drama', 'Mecha', 'Mystery', 'Psychological', 'Sci-Fi', 'Suspense'],
    studios: ['Gainax'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 1575,
    title: 'Code Geass: Lelouch of the Rebellion',
    englishTitle: 'Code Geass: Lelouch of the Rebellion',
    year: 2006,
    seasonsLabel: '2 seasons',
    episodes: 25,
    score: 8.7,
    status: 'Finished Airing',
    synopsis:
      'Exiled Britannian prince Lelouch vi Britannia obtains the power of Geass—absolute obedience—and dons the mask of Zero to lead a strategic rebellion against an empire.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1575-hsmWM2ydNm1m.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1575.jpg',
    genres: ['Action', 'Drama', 'Mecha', 'Military', 'Sci-Fi', 'Super Power', 'Psychological'],
    studios: ['Sunrise'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 41457,
    title: '86 EIGHTY-SIX',
    englishTitle: '86 EIGHTY-SIX',
    year: 2021,
    seasonsLabel: '2 parts',
    episodes: 23,
    score: 8.3,
    status: 'Finished Airing',
    synopsis:
      'In a war ostensibly fought by unmanned drones, Handler Vladilena Milizé takes command of the Spearhead Squadron—human youths stripped of citizenship and forced to pilot Juggernaut mechs on the frontlines.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116589-KawXHB6sApFt.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/116589-SqwYWzaZCdD5.jpg',
    genres: ['Action', 'Drama', 'Mecha', 'Military', 'Sci-Fi'],
    studios: ['A-1 Pictures'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 49596,
    title: 'Blue Lock',
    englishTitle: 'Blue Lock',
    year: 2022,
    seasonsLabel: '2 seasons',
    episodes: 24,
    score: 8.2,
    status: 'Finished Airing',
    synopsis:
      'The Japanese Football Union launches the radical Blue Lock facility to forge the world’s most egoistic striker from 300 elite high school forwards.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1258/126929l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/137822-oevspckMGLuY.jpg',
    genres: ['Action', 'Sports', 'Suspense', 'Psychological', 'Shounen'],
    studios: ['Eight Bit'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G4PH0WEKE/blue-lock' }],
  },
  {
    malId: 20583,
    title: 'Haikyu!!',
    englishTitle: 'Haikyu!!',
    year: 2014,
    seasonsLabel: '4 seasons',
    episodes: 25,
    score: 8.4,
    status: 'Finished Airing',
    synopsis:
      'Inspired by the "Little Giant," Shoyo Hinata joins Karasuno High’s volleyball club and teams up with rival prodigy setter Tobio Kageyama to reclaim the national stage.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20464-ooZUyBe4ptp9.png',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20464-PpYjO9cPN1gs.jpg',
    genres: ['Sports', 'Comedy', 'Drama', 'School', 'Shounen'],
    studios: ['Production I.G'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 47917,
    title: 'Bocchi the Rock!',
    englishTitle: 'Bocchi the Rock!',
    year: 2022,
    seasonsLabel: '1 season',
    episodes: 12,
    score: 8.8,
    status: 'Finished Airing',
    synopsis:
      'Painfully shy guitar prodigy Hitori "Bocchi" Gotoh dreams of performing in a band until drummer Nijika Ijichi recruits her into Kessoku Band at Starry live house.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-HTDmeL4RGeJ4.png',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/130003-5F90a7BtsPQN.jpg',
    genres: ['Comedy', 'Music', 'Slice of Life', 'School', 'Seinen'],
    studios: ['CloverWorks'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 33352,
    title: 'Violet Evergarden',
    englishTitle: 'Violet Evergarden',
    year: 2018,
    seasonsLabel: '1 season',
    episodes: 13,
    score: 8.7,
    status: 'Finished Airing',
    synopsis:
      'After the great war ends, former child soldier Violet Evergarden becomes an Auto Memory Doll—ghostwriting heartfelt letters to understand the final words her major spoke to her: "I love you."',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21827-ubzq619ZA2E9.png',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21827-ROucgYiiiSpR.jpg',
    genres: ['Drama', 'Fantasy', 'Slice of Life'],
    studios: ['Kyoto Animation'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 50265,
    title: 'SPY x FAMILY',
    englishTitle: 'SPY x FAMILY',
    year: 2022,
    seasonsLabel: '2 seasons',
    episodes: 25,
    score: 8.5,
    status: 'Finished Airing',
    synopsis:
      'Master spy Twilight must build a fake family to infiltrate an elite academy—unaware that his adoptive daughter Anya is a telepath and his wife Yor is a lethal assassin.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg',
    genres: ['Action', 'Comedy', 'Slice of Life', 'Supernatural', 'Shounen'],
    studios: ['Wit Studio', 'CloverWorks'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 37521,
    title: 'Vinland Saga',
    englishTitle: 'Vinland Saga',
    year: 2019,
    seasonsLabel: '2 seasons',
    episodes: 24,
    score: 8.8,
    status: 'Finished Airing',
    synopsis:
      'Young Thorfinn grows up listening to legends of a peaceful land across the sea called Vinland, before Viking warfare and vengeance consume his youth.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1500/103005l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101348-pivKKffCAwAY.jpg',
    genres: ['Action', 'Adventure', 'Drama', 'Historical', 'Seinen'],
    studios: ['Wit Studio', 'MAPPA'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GEXH3WKK0/vinland-saga' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 45,
    title: 'Rurouni Kenshin',
    englishTitle: 'Rurouni Kenshin',
    year: 1996,
    seasonsLabel: '3 seasons',
    episodes: 94,
    score: 8.3,
    status: 'Finished Airing',
    synopsis:
      'Once feared as Battousai the Manslayer, wandering swordsman Himura Kenshin carries a reverse-blade katana in Meiji-era Tokyo, vowing never to take another life.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx45-DEFgZRCxiGmF.png',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/45-JVUpMKU0HzRW.jpg',
    genres: ['Action', 'Adventure', 'Historical', 'Martial Arts', 'Romance', 'Shounen'],
    studios: ['Gallop', 'Studio Deen'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 34443,
    title: 'Baki',
    englishTitle: 'Baki',
    year: 2018,
    seasonsLabel: '2 seasons',
    episodes: 26,
    score: 7.4,
    status: 'Finished Airing',
    synopsis:
      'To surpass his father Yujiro Hanma—the strongest creature on Earth—martial arts prodigy Baki Hanma faces five escaped death-row inmates in no-rules underground combat.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97888-tdZ1r7qN1DRs.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/97888-0GMFaK3scX5B.jpg',
    genres: ['Action', 'Martial Arts', 'Sports', 'Shounen'],
    studios: ['TMS Entertainment'],
    streaming: [{ name: 'Netflix', url: 'https://www.netflix.com/' }],
  },
  {
    malId: 31240,
    title: 'Re:ZERO -Starting Life in Another World-',
    englishTitle: 'Re:ZERO -Starting Life in Another World-',
    year: 2016,
    seasonsLabel: '3 seasons',
    episodes: 25,
    score: 8.2,
    status: 'Finished Airing',
    synopsis:
      'Suddenly summoned to a fantasy kingdom, Subaru Natsuki discovers the agonizing power of "Return by Death," rewinding time whenever he perishes to save those he cherishes.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21355-wRVUrGxpvIQQ.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21355-f9SjOfEJMk5P.jpg',
    genres: ['Drama', 'Fantasy', 'Isekai', 'Psychological', 'Suspense', 'Dark Fantasy'],
    studios: ['White Fox'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 39535,
    title: 'Mushoku Tensei: Jobless Reincarnation',
    englishTitle: 'Mushoku Tensei: Jobless Reincarnation',
    year: 2021,
    seasonsLabel: '2 seasons',
    episodes: 23,
    score: 8.4,
    status: 'Finished Airing',
    synopsis:
      'Reborn into a world of sword and sorcery as Rudeus Greyrat, a man resolves to live his second life to the fullest across vast magical continents.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-1ANspF1EWyFx.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/108465-RgsRpTMhP9Sv.jpg',
    genres: ['Adventure', 'Drama', 'Fantasy', 'Isekai'],
    studios: ['Studio Bind'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 22319,
    title: 'Tokyo Ghoul',
    englishTitle: 'Tokyo Ghoul',
    year: 2014,
    seasonsLabel: '2 seasons',
    episodes: 12,
    score: 7.8,
    status: 'Finished Airing',
    synopsis:
      'College student Ken Kaneki barely survives a deadly encounter with a flesh-eating Ghoul, waking up transformed into a half-ghoul caught between two warring worlds.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1063/95086l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20605-RCJ7M71zLmrh.jpg',
    genres: ['Action', 'Fantasy', 'Horror', 'Psychological', 'Supernatural', 'Dark Fantasy', 'Seinen'],
    studios: ['Pierrot'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 35507,
    title: 'Classroom of the Elite',
    englishTitle: 'Classroom of the Elite',
    year: 2017,
    seasonsLabel: '3 seasons',
    episodes: 12,
    score: 7.9,
    status: 'Finished Airing',
    synopsis:
      'At Tokyo Metropolitan Advanced Nurturing High School, inscrutable mastermind Kiyotaka Ayanokoji manipulates ruthless class rankings from the shadows of Class D.',
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx98659-WNyPLIZDpGGY.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/98659-u46B5RCNl9il.jpg',
    genres: ['Drama', 'Psychological', 'Suspense', 'School'],
    studios: ['Lerche'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 31964,
    title: 'My Hero Academia',
    englishTitle: 'My Hero Academia',
    year: 2016,
    seasonsLabel: '7 seasons',
    episodes: 138,
    score: 7.9,
    status: 'Finished Airing',
    synopsis:
      'Born Quirkless in a superhuman society, Izuku Midoriya inherits One For All from the legendary All Might and enrolls in U.A. High’s Hero Course.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/10/78745l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21459-yeVkolGKdGUV.jpg',
    genres: ['Action', 'Super Power', 'School', 'Shounen'],
    studios: ['Bones'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 11061,
    title: 'Hunter x Hunter (2011)',
    englishTitle: 'Hunter x Hunter',
    year: 2011,
    seasonsLabel: '6 arcs',
    episodes: 148,
    score: 9.0,
    status: 'Finished Airing',
    synopsis:
      'Young Gon Freecss embarks on the grueling Hunter Exam to find his legendary father, forging an unbreakable bond with Killua, Kurapika, and Leorio.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1337/99013l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/11061-8WkkTZ6duKpq.jpg',
    genres: ['Action', 'Adventure', 'Fantasy', 'Super Power', 'Martial Arts', 'Shounen'],
    studios: ['Madhouse'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 30276,
    title: 'One-Punch Man',
    englishTitle: 'One-Punch Man',
    year: 2015,
    seasonsLabel: '2 seasons',
    episodes: 12,
    score: 8.5,
    status: 'Finished Airing',
    synopsis:
      'Saitama became a hero for fun and trained so hard he can defeat any monster with a single punch—leaving him yearning for an opponent who can reignite the thrill of battle.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/12/76049l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21087-sHb9zUZFsHe1.jpg',
    genres: ['Action', 'Comedy', 'Super Power', 'Sci-Fi', 'Seinen'],
    studios: ['Madhouse'],
    streaming: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/' }],
  },
  {
    malId: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    englishTitle: 'Fullmetal Alchemist: Brotherhood',
    year: 2009,
    seasonsLabel: '1 season',
    episodes: 64,
    score: 9.1,
    status: 'Finished Airing',
    synopsis:
      'Brothers Edward and Alphonse Elric pay a devastating price after a forbidden alchemy ritual and search for the Philosopher’s Stone to restore their bodies.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1208/94745l.jpg',
    bannerUrl: '/assets/extracted/filter-action.jpg',
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Military', 'Shounen'],
    studios: ['Bones'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GRGGPG93R/fullmetal-alchemist-brotherhood' },
    ],
  },
  {
    malId: 52588,
    title: 'Kaiju No. 8',
    englishTitle: 'Kaiju No. 8',
    year: 2024,
    seasonsLabel: '1 season',
    episodes: 12,
    score: 8.3,
    status: 'Finished Airing',
    synopsis:
      'When a mysterious parasitic creature transforms Kafka Hibino into a humanoid Kaiju, he enlists in the Defense Force while hiding his monstrous identity.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1370/140362l.jpg',
    bannerUrl: '/assets/extracted/filter-action.jpg',
    genres: ['Action', 'Sci-Fi', 'Military', 'Super Power', 'Shounen'],
    studios: ['Production I.G'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQ7D/kaiju-no-8' },
    ],
  },
  {
    malId: 20,
    title: 'Naruto',
    englishTitle: 'Naruto',
    year: 2002,
    seasonsLabel: '5 seasons',
    episodes: 220,
    score: 8.0,
    status: 'Finished Airing',
    synopsis:
      'Bearing the Nine-Tailed Fox sealed within him, young ninja Naruto Uzumaki trains relentlessly to earn Konohagakure’s respect and become Hokage.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1141/142503l.jpg',
    bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/11061-8WkkTZ6duKpq.jpg',
    genres: ['Action', 'Adventure', 'Fantasy', 'Martial Arts', 'Mythology', 'Shounen'],
    studios: ['Pierrot'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GY9PJ5KWR/naruto' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 57334,
    title: 'Dandadan',
    englishTitle: 'DAN DA DAN',
    year: 2024,
    seasonsLabel: '1 season',
    episodes: 12,
    score: 8.6,
    status: 'Currently Airing',
    synopsis:
      'High schoolers Momo Ayase and Okarun hold conflicting supernatural beliefs: ghosts vs aliens. After a wager, both discover that extraterrestrial beings and demonic yokai are shockingly real.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1584/143719.jpg',
    bannerUrl: '/assets/extracted/filter-supernatural.jpg',
    genres: ['Action', 'Comedy', 'Supernatural', 'Sci-Fi', 'Shounen'],
    studios: ['Science SARU'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQ5E/dan-da-dan' },
      { name: 'Netflix', url: 'https://www.netflix.com/' },
    ],
  },
  {
    malId: 41467,
    title: 'Bleach: Sennen Kessen-hen (Thousand-Year Blood War)',
    englishTitle: 'Bleach: Thousand-Year Blood War',
    year: 2022,
    seasonsLabel: '3 parts',
    episodes: 13,
    score: 8.9,
    status: 'Finished Airing',
    synopsis:
      'The Soul Society faces extinction as Yhwach and the Wandenreich Quincy Empire declare total annihilation upon the Soul Reapers. Ichigo Kurosaki enters the fray with unprecedented bankai power.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1764/126627.jpg',
    bannerUrl: '/assets/extracted/filter-action.jpg',
    genres: ['Action', 'Supernatural', 'Dark Fantasy', 'Shounen'],
    studios: ['Pierrot'],
    streaming: [
      { name: 'Hulu', url: 'https://www.hulu.com/series/bleach-thousand-year-blood-war' },
      { name: 'Disney+', url: 'https://www.disneyplus.com/' },
    ],
  },
  {
    malId: 52034,
    title: 'Oshi no Ko',
    englishTitle: '[Oshi No Ko]',
    year: 2023,
    seasonsLabel: '2 seasons',
    episodes: 11,
    score: 8.7,
    status: 'Finished Airing',
    synopsis:
      'Reincarnated as the twin children of idol superstar Ai Hoshino, Aqua and Ruby navigate the harsh, brilliant, and deceptive reality of Japan’s entertainment industry.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1812/134736.jpg',
    bannerUrl: '/assets/extracted/filter-romance.jpg',
    genres: ['Drama', 'Mystery', 'Supernatural', 'Psychological'],
    studios: ['Doga Kobo'],
    streaming: [
      { name: 'HIDIVE', url: 'https://www.hidive.com/tv/oshi-no-ko' },
    ],
  },
  {
    malId: 46569,
    title: 'Jigokuraku (Hell’s Paradise)',
    englishTitle: "Hell's Paradise",
    year: 2023,
    seasonsLabel: '1 season',
    episodes: 13,
    score: 8.2,
    status: 'Finished Airing',
    synopsis:
      'Sentenced to death, ninja assassin Gabimaru the Hollow is offered a full pardon if he can retrieve the Elixir of Life from a supernatural island populated by grotesque deity monstrosities.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1075/131925.jpg',
    bannerUrl: '/assets/extracted/filter-dark-fantasy.jpg',
    genres: ['Action', 'Adventure', 'Fantasy', 'Dark Fantasy', 'Shounen'],
    studios: ['MAPPA'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GJ0H7Q5NZ/hells-paradise' },
    ],
  },
  {
    malId: 54900,
    title: 'Wind Breaker',
    englishTitle: 'WIND BREAKER',
    year: 2024,
    seasonsLabel: '1 season',
    episodes: 13,
    score: 8.1,
    status: 'Finished Airing',
    synopsis:
      'Solitary fighter Haruka Sakura arrives at Furin High determined to fight his way to the absolute top, only to discover the delinquent school acts as heroic guardians protecting their town.',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1438/141816.jpg',
    bannerUrl: '/assets/extracted/filter-action.jpg',
    genres: ['Action', 'Martial Arts', 'School', 'Shounen'],
    studios: ['CloverWorks'],
    streaming: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G3KHEVD1N/wind-breaker' },
    ],
  },
];

// Simple in-memory TTL cache for Jikan & AniList GraphQL calls
const jikanCache = new Map<string, { expiresAt: number; data: any }>();
const anilistCache = new Map<string, { expiresAt: number; data: any }>();
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 minutes

async function fetchJikanCached(path: string): Promise<any | null> {
  const cached = jikanCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://api.jikan.moe/v4${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    jikanCache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, data: json });
    return json;
  } catch {
    return null;
  }
}

async function fetchAniListGraphQL(query: string, variables: Record<string, any>): Promise<any | null> {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = anilistCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    anilistCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: json?.data || null });
    return json?.data || null;
  } catch {
    return null;
  }
}

function stripHtmlTags(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function mapAniListAnime(media: any): AnimeItem | null {
  const malId = Number(media?.idMal || media?.id);
  if (!malId) return null;
  const localMatch = VERIFIED_ANIME_CATALOG.find((a) => a.malId === malId);
  const title =
    media?.title?.english ||
    media?.title?.romaji ||
    localMatch?.title ||
    'Untitled Anime';
  return {
    malId,
    title,
    englishTitle: media?.title?.english || localMatch?.englishTitle || null,
    year: media?.seasonYear || localMatch?.year || null,
    seasonsLabel:
      localMatch?.seasonsLabel ||
      (media?.format === 'MOVIE'
        ? 'Movie'
        : media?.episodes
          ? `${media.episodes} episodes`
          : null),
    episodes: typeof media?.episodes === 'number' ? media.episodes : localMatch?.episodes ?? null,
    score:
      typeof media?.averageScore === 'number'
        ? Math.round((media.averageScore / 10) * 10) / 10
        : localMatch?.score ?? null,
    status: media?.status || localMatch?.status || null,
    synopsis:
      stripHtmlTags(media?.description) ||
      localMatch?.synopsis ||
      'Synopsis provided by KAGE anime database.',
    imageUrl:
      media?.coverImage?.extraLarge ||
      media?.coverImage?.large ||
      localMatch?.imageUrl ||
      '',
    bannerUrl: localMatch?.bannerUrl || media?.bannerImage || null,
    genres: Array.from(new Set([...(media?.genres || []), ...(localMatch?.genres || [])])),
    studios: (media?.studios?.nodes || []).map((s: any) => s.name),
    streaming: localMatch?.streaming || [],
    trailerUrl: null,
  };
}

export function mapJikanAnime(raw: any): AnimeItem {
  const localMatch = VERIFIED_ANIME_CATALOG.find((a) => a.malId === raw.mal_id);
  const genres = Array.from(
    new Set([
      ...(raw.genres || []).map((g: any) => g.name),
      ...(raw.themes || []).map((t: any) => t.name),
      ...(raw.demographics || []).map((d: any) => d.name),
      ...(localMatch?.genres || []),
    ])
  );
  return {
    malId: raw.mal_id,
    title: raw.title_english || raw.title || localMatch?.title || 'Untitled Anime',
    englishTitle: raw.title_english || localMatch?.englishTitle || null,
    year: raw.year || raw.aired?.prop?.from?.year || localMatch?.year || null,
    seasonsLabel:
      localMatch?.seasonsLabel ||
      (raw.type === 'Movie'
        ? 'Movie'
        : raw.episodes
          ? `${raw.episodes} episodes`
          : raw.status || null),
    episodes: typeof raw.episodes === 'number' ? raw.episodes : localMatch?.episodes ?? null,
    score: typeof raw.score === 'number' ? raw.score : localMatch?.score ?? null,
    status: raw.status || localMatch?.status || null,
    synopsis:
      raw.synopsis ||
      localMatch?.synopsis ||
      'Synopsis not yet provided by official metadata source.',
    imageUrl:
      raw.images?.jpg?.large_image_url ||
      raw.images?.webp?.large_image_url ||
      raw.images?.jpg?.image_url ||
      localMatch?.imageUrl ||
      '',
    bannerUrl: localMatch?.bannerUrl || raw.trailer?.images?.maximum_image_url || null,
    genres,
    studios: (raw.studios || []).map((s: any) => s.name),
    streaming:
      Array.isArray(raw.streaming) && raw.streaming.length > 0
        ? raw.streaming.map((s: any) => ({ name: s.name, url: s.url }))
        : localMatch?.streaming || [],
    trailerUrl: raw.trailer?.url || null,
  };
}

export async function getAllGenreRealms() {
  return ALL_ANIME_GENRES.map((meta) => {
    const countInCatalog = VERIFIED_ANIME_CATALOG.filter((a) =>
      a.genres.some((g) => g.toLowerCase() === meta.genre.toLowerCase())
    ).length;
    return {
      ...meta,
      sampleCount: Math.max(24, countInCatalog * 14),
    };
  });
}

export async function getHomeDiscoveryCatalog() {
  const [topRes, airingRes] = await Promise.all([
    fetchJikanCached('/top/anime?limit=16'),
    fetchJikanCached('/seasons/now?limit=12'),
  ]);

  const liveTop: AnimeItem[] = topRes?.data ? topRes.data.map(mapJikanAnime) : [];
  const liveSeasonal: AnimeItem[] = airingRes?.data ? airingRes.data.map(mapJikanAnime) : [];

  const mergedMap = new Map<number, AnimeItem>();
  for (const item of [...VERIFIED_ANIME_CATALOG, ...liveSeasonal, ...liveTop]) {
    if (!mergedMap.has(item.malId)) {
      mergedMap.set(item.malId, item);
    }
  }
  const all = Array.from(mergedMap.values());

  const featured =
    VERIFIED_ANIME_CATALOG.find((a) => a.malId === 52299) || all[0];

  const action = all.filter((a) => a.genres.includes('Action')).slice(0, 12);
  const romance = all.filter((a) => a.genres.includes('Romance')).slice(0, 12);
  const darkFantasy = all
    .filter((a) => a.genres.includes('Dark Fantasy') || a.genres.includes('Suspense'))
    .slice(0, 12);
  const sciFi = all
    .filter((a) => a.genres.includes('Sci-Fi') || a.genres.includes('Cyberpunk'))
    .slice(0, 12);

  const trending = liveSeasonal.length >= 6 ? liveSeasonal.slice(0, 10) : all.slice(0, 10);
  const popular =
    liveTop.length >= 6
      ? liveTop.slice(0, 10)
      : [...all].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);

  return {
    featured,
    trending,
    popular,
    recentlyUpdated: liveSeasonal.slice(0, 8),
    categories: {
      Action: action,
      Romance: romance,
      'Dark Fantasy': darkFantasy,
      'Sci-Fi & Cyberpunk': sciFi,
      Fantasy: all.filter((a) => a.genres.includes('Fantasy')).slice(0, 12),
      Supernatural: all.filter((a) => a.genres.includes('Supernatural')).slice(0, 12),
    },
    genres: ALL_GENRE_NAMES,
  };
}

export async function searchAnimeCatalog(params: {
  q?: string;
  genre?: string;
  filter?: string;
}) {
  const q = (params.q || '').trim();
  const genre = (params.genre || '').trim();
  const filter = (params.filter || '').trim();

  if (filter === 'upcoming') {
    const upcomingRes = await fetchJikanCached('/seasons/upcoming?limit=20');
    if (upcomingRes?.data?.length) {
      return upcomingRes.data.map(mapJikanAnime);
    }
  }

  const genreMeta = genre
    ? ALL_ANIME_GENRES.find((g) => g.genre.toLowerCase() === genre.toLowerCase())
    : undefined;

  let queryPath = '';
  if (q || genreMeta?.jikanId) {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (genreMeta?.jikanId) sp.set('genres', String(genreMeta.jikanId));
    sp.set('limit', '24');
    sp.set('sfw', 'true');
    sp.set('order_by', 'score');
    sp.set('sort', 'desc');
    queryPath = `/anime?${sp.toString()}`;
  }

  // Query AniList GraphQL in parallel for crisp 1920px bannerImage & extraLarge covers
  const anilistPromise =
    q || genreMeta
      ? fetchAniListGraphQL(
          `query ($search: String, $genre: String, $tag: String) {
            Page(page: 1, perPage: 20) {
              media(
                type: ANIME
                isAdult: false
                sort: [POPULARITY_DESC, SCORE_DESC]
                search: $search
                genre: $genre
                tag: $tag
              ) {
                id
                idMal
                title { english romaji }
                seasonYear
                format
                episodes
                averageScore
                status
                description(asHtml: false)
                genres
                bannerImage
                coverImage { extraLarge large }
                studios(isMain: true) { nodes { name } }
              }
            }
          }`,
          {
            search: q || undefined,
            genre: genreMeta?.anilistGenre || undefined,
            tag: !genreMeta?.anilistGenre ? genreMeta?.anilistTag || undefined : undefined,
          }
        )
      : Promise.resolve(null);

  const [jikanRes, anilistData] = await Promise.all([
    queryPath ? fetchJikanCached(queryPath) : Promise.resolve(null),
    anilistPromise,
  ]);

  const jikanItems: AnimeItem[] = jikanRes?.data ? jikanRes.data.map(mapJikanAnime) : [];
  const anilistItems: AnimeItem[] = Array.isArray(anilistData?.Page?.media)
    ? (anilistData.Page.media.map(mapAniListAnime).filter(Boolean) as AnimeItem[])
    : [];

  // Map AniList banners onto Jikan items by malId so every result gets crisp widescreen art
  const anilistByMal = new Map<number, AnimeItem>();
  for (const item of anilistItems) {
    anilistByMal.set(item.malId, item);
  }

  const localMatches = VERIFIED_ANIME_CATALOG.filter((item) => {
    const matchQ =
      !q ||
      item.title.toLowerCase().includes(q.toLowerCase()) ||
      item.genres.some((g) => g.toLowerCase().includes(q.toLowerCase()));
    const matchGenre =
      !genre ||
      item.genres.some((g) => g.toLowerCase() === genre.toLowerCase());
    return matchQ && matchGenre;
  });

  // Ensure genre spotlight anime appears first when browsing a category
  if (!q && genreMeta?.spotlightMalId) {
    localMatches.sort((a, b) =>
      a.malId === genreMeta.spotlightMalId ? -1 : b.malId === genreMeta.spotlightMalId ? 1 : 0
    );
  }

  const merged = new Map<number, AnimeItem>();
  for (const item of [...localMatches, ...anilistItems, ...jikanItems]) {
    const existing = merged.get(item.malId);
    const ani = anilistByMal.get(item.malId);
    if (!existing) {
      merged.set(item.malId, {
        ...item,
        bannerUrl: item.bannerUrl || ani?.bannerUrl || null,
        imageUrl: ani?.imageUrl && !item.imageUrl.startsWith('/assets') ? ani.imageUrl : item.imageUrl,
      });
    } else if (!existing.bannerUrl && (item.bannerUrl || ani?.bannerUrl)) {
      merged.set(item.malId, {
        ...existing,
        bannerUrl: item.bannerUrl || ani?.bannerUrl || null,
      });
    }
  }
  return Array.from(merged.values());
}

export async function getAnimeDetailById(malId: number) {
  const [fullRes, charsRes, staffRes, epsRes, recRes, anilistData] = await Promise.all([
    fetchJikanCached(`/anime/${malId}/full`),
    fetchJikanCached(`/anime/${malId}/characters`),
    fetchJikanCached(`/anime/${malId}/staff`),
    fetchJikanCached(`/anime/${malId}/episodes`),
    fetchJikanCached(`/anime/${malId}/recommendations`),
    fetchAniListGraphQL(
      `query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          idMal
          bannerImage
          coverImage { extraLarge large }
        }
      }`,
      { idMal: malId }
    ),
  ]);

  const localFallback = VERIFIED_ANIME_CATALOG.find((a) => a.malId === malId);
  const baseAnime: AnimeItem | null = fullRes?.data
    ? mapJikanAnime(fullRes.data)
    : localFallback || null;

  if (!baseAnime) return null;

  const anime: AnimeItem = {
    ...baseAnime,
    bannerUrl:
      localFallback?.bannerUrl ||
      anilistData?.Media?.bannerImage ||
      baseAnime.bannerUrl ||
      null,
    imageUrl:
      anilistData?.Media?.coverImage?.extraLarge ||
      baseAnime.imageUrl,
  };

  const characters: AnimeCharacterItem[] = Array.isArray(charsRes?.data)
    ? charsRes.data.slice(0, 10).map((c: any) => ({
        id: c.character?.mal_id || 0,
        name: c.character?.name || 'Unknown',
        role: c.role || 'Supporting',
        imageUrl: c.character?.images?.jpg?.image_url || '',
        voiceActor:
          c.voice_actors?.find((v: any) => v.language === 'Japanese')?.person?.name ||
          c.voice_actors?.[0]?.person?.name ||
          null,
      }))
    : [];

  const staff: AnimeStaffItem[] = Array.isArray(staffRes?.data)
    ? staffRes.data.slice(0, 6).map((s: any) => ({
        id: s.person?.mal_id || 0,
        name: s.person?.name || 'Unknown',
        positions: s.positions || [],
        imageUrl: s.person?.images?.jpg?.image_url || '',
      }))
    : [];

  const episodes: AnimeEpisodeItem[] = Array.isArray(epsRes?.data)
    ? epsRes.data.slice(0, 36).map((e: any) => ({
        number: e.mal_id,
        title: e.title || `Episode ${e.mal_id}`,
        aired: e.aired ? new Date(e.aired).toLocaleDateString() : null,
        score: typeof e.score === 'number' ? e.score : null,
      }))
    : [];

  let related: AnimeItem[] = [];
  if (Array.isArray(recRes?.data) && recRes.data.length > 0) {
    related = recRes.data.slice(0, 6).map((r: any) => ({
      malId: r.entry?.mal_id,
      title: r.entry?.title || 'Related Anime',
      synopsis: '',
      imageUrl:
        r.entry?.images?.jpg?.large_image_url ||
        r.entry?.images?.jpg?.image_url ||
        '',
      genres: anime.genres.slice(0, 2),
      studios: [],
      streaming: [],
    }));
  } else {
    related = VERIFIED_ANIME_CATALOG.filter(
      (item) =>
        item.malId !== malId &&
        item.genres.some((g) => anime.genres.includes(g))
    ).slice(0, 6);
  }

  return {
    anime,
    characters,
    staff,
    episodes,
    related,
  };
}

/**
 * Dynamic Personalized Anime Recommendation Engine for KAGE.
 * Evaluates live PostgreSQL user signals across all 28 anime genres:
 *  1) Watched / tracked anime status & scores (user_anime_entries)
 *  2) Explicitly rated genres (user_genre_ratings) & profile favoriteGenres
 *  3) Community activity: joined guilds, authored posts/reviews, reactions, and clash votes
 */
export async function computePersonalizedRecommendations(
  signals: UserTasteSignals
): Promise<{
  summary: TasteProfileSummary;
  recommendations: RecommendationResult[];
}> {
  const genreWeights = new Map<string, number>();
  const genreSources = new Map<string, string[]>();

  const addWeight = (genre: string, delta: number, reasonText?: string) => {
    if (!genre) return;
    genreWeights.set(genre, (genreWeights.get(genre) || 0) + delta);
    if (reasonText && delta > 0) {
      const existing = genreSources.get(genre) || [];
      if (!existing.includes(reasonText) && existing.length < 4) {
        existing.push(reasonText);
        genreSources.set(genre, existing);
      }
    }
  };

  for (const gr of signals.genreRatings) {
    const delta = (gr.rating - 4.5) * 4.2;
    addWeight(
      gr.genre,
      delta,
      gr.rating >= 7 ? `Rated ${gr.genre} ${gr.rating}/10` : undefined
    );
  }

  for (const fav of signals.favoriteGenres) {
    addWeight(fav, 9, `Selected ${fav} in your profile affinities`);
  }

  const excludedMalIds = new Set<number>();
  const highRatedTitles: { malId: number; title: string; genres: string[]; score: number }[] = [];

  for (const entry of signals.animeEntries) {
    if (entry.status === 'completed' || entry.status === 'watching' || entry.status === 'dropped') {
      excludedMalIds.add(entry.animeMalId);
    }

    let statusMultiplier = 1.0;
    if (entry.status === 'favorited') {
      excludedMalIds.add(entry.animeMalId);
      statusMultiplier = 1.8;
    } else if (entry.status === 'completed') {
      statusMultiplier = 1.4;
    } else if (entry.status === 'watching') {
      statusMultiplier = 1.25;
    } else if (entry.status === 'plan_to_watch') {
      statusMultiplier = 0.65;
    } else if (entry.status === 'dropped') {
      statusMultiplier = -0.9;
    }

    const effectiveScore = entry.score ?? (entry.status === 'dropped' ? 3 : 7.5);
    const delta = (effectiveScore - 5) * 3.0 * statusMultiplier;

    if (effectiveScore >= 8 && entry.status !== 'dropped') {
      highRatedTitles.push({
        malId: entry.animeMalId,
        title: entry.animeTitle,
        genres: entry.genres,
        score: effectiveScore,
      });
    }

    for (const g of entry.genres) {
      addWeight(
        g,
        delta,
        delta > 2
          ? entry.score
            ? `Rated ${entry.animeTitle} ${entry.score}/10`
            : `Watched ${entry.animeTitle}`
          : undefined
      );
    }
  }

  for (const guild of signals.joinedGuilds) {
    for (const g of guild.genreTags) {
      addWeight(g, 6.5, `Member of ${guild.name}`);
    }
  }

  for (const post of signals.authoredPosts) {
    for (const g of post.genreTags) {
      addWeight(
        g,
        4.5,
        post.animeTitle
          ? `Discussed ${post.animeTitle} in KAGE`
          : `Active in ${g} discussions`
      );
    }
  }

  for (const g of signals.interactedGenres) {
    addWeight(g, 2.5, `Engaged with ${g} community posts`);
  }

  const sortedGenres = Array.from(genreWeights.entries())
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);

  const topGenreName = sortedGenres[0]?.[0];
  const topGenreMeta = topGenreName
    ? ALL_ANIME_GENRES.find((g) => g.genre.toLowerCase() === topGenreName.toLowerCase())
    : undefined;

  const [topJikanRes, genreJikanRes] = await Promise.all([
    fetchJikanCached('/top/anime?limit=20'),
    topGenreMeta?.jikanId
      ? fetchJikanCached(
          `/anime?genres=${topGenreMeta.jikanId}&order_by=score&sort=desc&limit=16&sfw=true`
        )
      : Promise.resolve(null),
  ]);

  const candidateMap = new Map<number, AnimeItem>();
  for (const item of [
    ...VERIFIED_ANIME_CATALOG,
    ...(genreJikanRes?.data ? genreJikanRes.data.map(mapJikanAnime) : []),
    ...(topJikanRes?.data ? topJikanRes.data.map(mapJikanAnime) : []),
  ]) {
    if (!excludedMalIds.has(item.malId) && !candidateMap.has(item.malId)) {
      candidateMap.set(item.malId, item);
    }
  }

  const watchedCount = signals.animeEntries.length;
  const ratedGenresCount = signals.genreRatings.length + signals.favoriteGenres.length;
  const communitySignalCount =
    signals.joinedGuilds.length +
    signals.authoredPosts.length +
    signals.interactedGenres.length;
  const totalSignals = watchedCount + ratedGenresCount + communitySignalCount;
  const hasSignals = totalSignals > 0;

  const maxGenreWeight = sortedGenres[0]?.[1] || 1;
  const topAffinities = sortedGenres.slice(0, 6).map(([genre, weight]) => ({
    genre,
    weight: Math.round(weight * 10) / 10,
    normalized: Math.min(100, Math.max(15, Math.round((weight / maxGenreWeight) * 100))),
  }));

  const scored: RecommendationResult[] = [];
  for (const candidate of candidateMap.values()) {
    let rawAffinity = 0;
    const matchedGenres: string[] = [];
    const reasons: string[] = [];

    for (const g of candidate.genres) {
      const w = genreWeights.get(g) || 0;
      if (w > 0) {
        rawAffinity += w;
        matchedGenres.push(g);
        const src = genreSources.get(g)?.[0];
        if (src && !reasons.includes(src) && reasons.length < 2) {
          reasons.push(src);
        }
      } else if (w < 0) {
        rawAffinity += w * 0.6;
      }
    }

    for (const favTitle of highRatedTitles) {
      const shared = candidate.genres.filter((g) => favTitle.genres.includes(g));
      if (shared.length >= 2) {
        rawAffinity += shared.length * 4.5;
        const msg = `Shares ${shared.slice(0, 2).join(' · ')} DNA with ${favTitle.title}`;
        if (!reasons.includes(msg)) {
          reasons.unshift(msg);
        }
        break;
      }
    }

    const qualityScore = ((candidate.score || 8.0) - 7.0) * 5.5;
    const combined = hasSignals ? rawAffinity + qualityScore : qualityScore * 3;

    if (!hasSignals && reasons.length === 0) {
      reasons.push(
        `Top-rated ${candidate.genres.slice(0, 2).join(' · ')} essential — rate genres or log anime to personalize`
      );
    } else if (reasons.length === 0) {
      reasons.push(`Acclaimed in ${candidate.genres.slice(0, 2).join(' · ')}`);
    }

    scored.push({
      anime: candidate,
      matchScore: combined,
      reasons: reasons.slice(0, 2),
      matchedGenres: matchedGenres.slice(0, 3),
    });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore);
  const topScored = scored.slice(0, 12);
  const highestRaw = topScored[0]?.matchScore || 1;
  const lowestRaw = topScored[topScored.length - 1]?.matchScore || 0;
  const span = Math.max(1, highestRaw - lowestRaw);

  const normalizedRecommendations = topScored.map((item, idx) => {
    const pct = hasSignals
      ? Math.min(99, Math.max(68, Math.round(74 + ((item.matchScore - lowestRaw) / span) * 24) - idx))
      : Math.min(95, Math.max(78, Math.round((item.anime.score || 8.2) * 10.4)));
    return {
      ...item,
      matchScore: pct,
    };
  });

  return {
    summary: {
      hasSignals,
      totalSignals,
      watchedCount,
      ratedGenresCount,
      communitySignalCount,
      topAffinities,
    },
    recommendations: normalizedRecommendations,
  };
}
