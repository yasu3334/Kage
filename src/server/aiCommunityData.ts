import { GoogleGenAI, Type } from '@google/genai';
import type { DiscussionPollOption } from '../db/schema.ts';

let sharedGenAi: GoogleGenAI | null = null;
function getServerGenAi(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!sharedGenAi) {
    sharedGenAi = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedGenAi;
}

export type PersonaWritingStyle =
  | 'anime_theories'
  | 'character_comparisons'
  | 'episode_reactions'
  | 'anime_recommendations'
  | 'funny_reactions'
  | 'questions_and_replies'
  | 'detailed_discussions';

export interface GeneratedDemoPersona {
  index: number;
  uid: string;
  kageId: string;
  email: string;
  username: string;
  usernameNormalized: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  personaArchetype: string;
  writingStyle: PersonaWritingStyle;
  favoriteAnime: string;
  favoriteAnimeMalId: number;
  favoriteAnimeImage: string;
  favoriteCharacter: string;
  genres: string[];
  shadowQualities: string[];
  shadowLabel: string;
  isCommunityMember: boolean;
  activityCadence: 'high' | 'normal' | 'casual';
  disclosureLabel: string;
}

export interface CuratedAnimeRef {
  malId: number;
  title: string;
  character: string;
  genres: string[];
  imageUrl: string;
  studio: string;
  motif: string;
}

export const ANIME_KNOWLEDGE_POOL: CuratedAnimeRef[] = [
  {
    malId: 52299,
    title: 'Solo Leveling',
    character: 'Sung Jin-Woo',
    genres: ['Action', 'Dark Fantasy', 'Fantasy'],
    imageUrl: '/assets/extracted/clash-jinwoo.jpg',
    studio: 'A-1 Pictures',
    motif: 'dungeon raid progression and shadow extraction choreography',
  },
  {
    malId: 40748,
    title: 'Jujutsu Kaisen',
    character: 'Satoru Gojo',
    genres: ['Action', 'Supernatural', 'Dark Fantasy'],
    imageUrl: '/assets/extracted/clash-gojo.jpg',
    studio: 'MAPPA',
    motif: 'cursed energy domain rules and hand-to-hand sakuga',
  },
  {
    malId: 38000,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    character: 'Zenitsu Agatsuma',
    genres: ['Action', 'Supernatural', 'Historical'],
    imageUrl: '/assets/zenitsu-avatar.png',
    studio: 'ufotable',
    motif: 'breathing-form compositing and orchestral climax direction',
  },
  {
    malId: 16498,
    title: 'Attack on Titan',
    character: 'Levi Ackerman',
    genres: ['Action', 'Dark Fantasy', 'Suspense'],
    imageUrl: '/assets/extracted/avatar-levi.jpg',
    studio: 'WIT Studio / MAPPA',
    motif: 'long-horizon foreshadowing and ideological tragedy',
  },
  {
    malId: 52991,
    title: "Frieren: Beyond Journey's End",
    character: 'Frieren',
    genres: ['Fantasy', 'Adventure', 'Drama'],
    imageUrl: '/assets/extracted/filter-fantasy.jpg',
    studio: 'Madhouse',
    motif: 'quiet grief, memory, and centuries-spanning worldbuilding',
  },
  {
    malId: 34572,
    title: 'Black Clover',
    character: 'Yami Sukehiro',
    genres: ['Action', 'Fantasy', 'Adventure'],
    imageUrl: '/assets/extracted/guild-shadow.jpg',
    studio: 'Pierrot',
    motif: 'surpassing limits, grimoire spell synergy, and Dimension Slash pay-offs',
  },
  {
    malId: 21,
    title: 'One Piece',
    character: 'Roronoa Zoro',
    genres: ['Action', 'Adventure', 'Fantasy'],
    imageUrl: '/assets/extracted/filter-action.jpg',
    studio: 'Toei Animation',
    motif: 'inherited will, Void Century mysteries, and island worldbuilding',
  },
  {
    malId: 11061,
    title: 'Hunter x Hunter (2011)',
    character: 'Killua Zoldyck',
    genres: ['Action', 'Adventure', 'Fantasy'],
    imageUrl: '/assets/extracted/filter-supernatural.jpg',
    studio: 'Madhouse',
    motif: 'Nen vows, tactical mind games, and character inversions',
  },
  {
    malId: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    character: 'Edward Elric',
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy'],
    imageUrl: '/assets/extracted/filter-dark-fantasy.jpg',
    studio: 'Bones',
    motif: 'equivalent exchange, ensemble pacing, and airtight thematic closure',
  },
  {
    malId: 37521,
    title: 'Vinland Saga',
    character: 'Thorfinn',
    genres: ['Action', 'Drama', 'Historical', 'Seinen'],
    imageUrl: '/assets/extracted/guild-wings.jpg',
    studio: 'WIT Studio / MAPPA',
    motif: 'redemption arcs, pacifist resolve, and historical weight',
  },
  {
    malId: 1535,
    title: 'Death Note',
    character: 'L Lawliet',
    genres: ['Suspense', 'Psychological', 'Supernatural'],
    imageUrl: '/assets/extracted/avatar-zenitsu-dark.jpg',
    studio: 'Madhouse',
    motif: 'cat-and-mouse deduction traps and ego collisions',
  },
  {
    malId: 1575,
    title: 'Code Geass',
    character: 'Lelouch Lamperouge',
    genres: ['Action', 'Drama', 'Mecha', 'Sci-Fi'],
    imageUrl: '/assets/extracted/solo-hero-home.jpg',
    studio: 'Sunrise',
    motif: 'theatrical rebellion, gambits, and unforgettable endings',
  },
  {
    malId: 44511,
    title: 'Chainsaw Man',
    character: 'Denji',
    genres: ['Action', 'Dark Fantasy', 'Supernatural'],
    imageUrl: '/assets/extracted/filter-dark-fantasy.jpg',
    studio: 'MAPPA',
    motif: 'cinematic framing, grounded character flaws, and devil contracts',
  },
  {
    malId: 41467,
    title: 'Bleach: Thousand-Year Blood War',
    character: 'Ichigo Kurosaki',
    genres: ['Action', 'Adventure', 'Supernatural'],
    imageUrl: '/assets/extracted/pulse-hashira.jpg',
    studio: 'Pierrot Films',
    motif: 'Bankai reveals, high-contrast lighting, and poetic symbolism',
  },
  {
    malId: 9253,
    title: 'Steins;Gate',
    character: 'Rintarou Okabe',
    genres: ['Sci-Fi', 'Psychological', 'Suspense', 'Drama'],
    imageUrl: '/assets/extracted/guild-infinity.jpg',
    studio: 'White Fox',
    motif: 'worldline causality, lab banter, and time-loop stakes',
  },
  {
    malId: 33352,
    title: 'Violet Evergarden',
    character: 'Violet Evergarden',
    genres: ['Drama', 'Fantasy', 'Slice of Life'],
    imageUrl: '/assets/extracted/your-lie-banner.jpg',
    studio: 'Kyoto Animation',
    motif: 'micro-expression animation, epistolary healing, and luminous backgrounds',
  },
  {
    malId: 19,
    title: 'Monster',
    character: 'Kenzo Tenma',
    genres: ['Mystery', 'Psychological', 'Drama', 'Seinen'],
    imageUrl: '/assets/extracted/guild-wings.jpg',
    studio: 'Madhouse',
    motif: 'moral philosophy, slow-burn tension, and European noir atmosphere',
  },
  {
    malId: 42310,
    title: 'Cyberpunk: Edgerunners',
    character: 'Lucy',
    genres: ['Action', 'Sci-Fi', 'Cyberpunk', 'Drama'],
    imageUrl: '/assets/extracted/solo-hero-home.jpg',
    studio: 'Trigger',
    motif: 'neon color scripts, kinetic cuts, and bittersweet tragedy',
  },
  {
    malId: 32182,
    title: 'Mob Psycho 100',
    character: 'Reigen Arataka',
    genres: ['Action', 'Comedy', 'Supernatural', 'Slice of Life'],
    imageUrl: '/assets/extracted/pulse-hashira.jpg',
    studio: 'Bones',
    motif: 'emotional growth over raw power and paint-on-glass sakuga',
  },
  {
    malId: 47917,
    title: 'Bocchi the Rock!',
    character: 'Hitori Gotoh',
    genres: ['Comedy', 'Slice of Life', 'Music'],
    imageUrl: '/assets/extracted/zenitsu-live-room.jpg',
    studio: 'CloverWorks',
    motif: 'mixed-media visual gags and live band performance authenticity',
  },
  {
    malId: 50265,
    title: 'Spy x Family',
    character: 'Anya Forger',
    genres: ['Action', 'Comedy', 'Slice of Life'],
    imageUrl: '/assets/extracted/filter-romance.jpg',
    studio: 'WIT Studio / CloverWorks',
    motif: 'found-family warmth and Cold War spy comedy timing',
  },
  {
    malId: 1735,
    title: 'Naruto: Shippuden',
    character: 'Itachi Uchiha',
    genres: ['Action', 'Adventure', 'Martial Arts'],
    imageUrl: '/assets/extracted/pulse-levi.jpg',
    studio: 'Pierrot',
    motif: 'hand-sign choreography, shinobi legacy, and generational empathy',
  },
  {
    malId: 41457,
    title: '86 Eighty-Six',
    character: 'Vladilena Milizé',
    genres: ['Action', 'Drama', 'Mecha', 'Sci-Fi'],
    imageUrl: '/assets/extracted/guild-wings.jpg',
    studio: 'A-1 Pictures',
    motif: 'match-cut transitions, Hiroyuki Sawano drops, and wartime realism',
  },
  {
    malId: 54492,
    title: 'The Apothecary Diaries',
    character: 'Maomao',
    genres: ['Mystery', 'Drama', 'Historical'],
    imageUrl: '/assets/extracted/guild-infinity.jpg',
    studio: 'OLM / TOHO animation STUDIO',
    motif: 'court intrigue, herbalist deduction, and dry comedic wit',
  },
];

const FIRST_NAMES = [
  'Ren', 'Kaito', 'Sora', 'Haru', 'Akira', 'Riku', 'Shin', 'Toma', 'Kenji', 'Yuto',
  'Aoi', 'Hina', 'Mio', 'Rei', 'Kaede', 'Yuna', 'Natsuki', 'Saki', 'Koharu', 'Emi',
  'Kazuki', 'Daiki', 'Hayato', 'Ryota', 'Shota', 'Kouki', 'Tsubasa', 'Minato', 'Itsuki', 'Haruki',
  'Ayaka', 'Misaki', 'Nanami', 'Rina', 'Shiori', 'Asuka', 'Chihiro', 'Hikari', 'Nozomi', 'Yuzuki',
  'Zephyr', 'Nyx', 'Orion', 'Lyra', 'Vael', 'Kieran', 'Soren', 'Talia', 'Caelum', 'Vesper',
  'Arin', 'Dante', 'Elena', 'Felix', 'Iris', 'Juno', 'Kira', 'Lukas', 'Mira', 'Nico',
  'Ronan', 'Selene', 'Theo', 'Vera', 'Zane', 'Aria', 'Bram', 'Cleo', 'Dorian', 'Esme',
  'Gideon', 'Hazel', 'ash', 'Jaden', 'Kael', 'Lena', 'Micah', 'Nadia', 'Owen', 'Petra',
  'Quinn', 'Rhea', 'Silas', 'Tessa', 'Uriel', 'Valen', 'Wren', 'Xander', 'Yara', 'Zora',
  'Makoto', 'Hotaru', 'Subaru', 'Nagisa', 'kyoya', 'Takumi', 'Ayumu', 'Kanata', 'Mitsuki', 'Rui',
  'Setsuna', 'Touya', 'Wakana', 'Yuuki', 'Shion', 'Kei', 'hibiki', 'Souma', 'Arata', 'Mahiru',
  'Fumiko', 'Kotone', 'Suzu', 'Tsukasa', 'Kazuma', 'Masato', 'Naoki', 'Ryusei', 'Seiji', 'Taiga',
];

const SECOND_EPITHETS = [
  'Kurogane', 'Tsukimi', 'Hoshino', 'Kisaragi', 'kamiya', 'Tachibana', 'Minase', 'fujimoto', 'Shirogane', 'Amamiya',
  'Nightveil', 'Starfall', 'Cinder', 'Tempest', 'Vanguard', 'Solstice', 'Drift', 'Horizon', 'Prism', 'Ashford',
  'Sakura', 'Kazenoha', 'Mizuno', 'Takahashi', 'Moriyama', 'Hayashi', 'Ishikawa', 'Arakawa', 'Shinohara', 'Akiyama',
  'Frame', 'Sakuga', 'Canvas', 'Keyline', 'Overture', 'Cadence', 'Chronicle', 'Archive', 'Atlas', 'Glyph',
  'Dusk', 'Dawn', 'Ember', 'Frost', 'Gale', 'Halo', 'Ink', 'Jade', 'Karma', 'Lotus',
  'Mirage', 'Nebula', 'Obsidian', 'Pulse', 'Quartz', 'Raven', 'Shadow', 'Torrent', 'Umbra', 'Vortex',
  'Whisper', 'Zenith', 'Aether', 'Blade', 'Crest', 'Echo', 'Flare', 'Grimoire', 'Harbor', 'Ivory',
  'Lantern', 'Monolith', 'Nova', 'Onyx', 'Phantom', 'Quill', 'Relic', 'Spire', 'Tide', 'Valor',
  'Katsuragi', 'kirigaya', ' Nanase', 'Otonashi', 'Saegusa', 'Yagami', 'Yukimura', 'Zolden', 'Asagiri', 'Himura',
  'hoshigaki', 'Kurosawa', 'Matsuda', 'Nakahara', 'Okazaki', 'Sawamura', 'Tsukishima', 'Uehara', 'wakabayashi', 'Yanagi',
  'Valerius', 'thorne', 'Mercer', 'sterling', 'Kovacs', 'lindqvist', 'Moreau', 'Santoro', 'Navarro', 'Alvarez',
];

const HANDLE_JOINERS = ['_', '.', '', '_', '.'];
const HANDLE_TAGS = [
  'anime', 'frames', 'lore', 'cuts', 'ost', 'guild', 'watch', 'realm', 'ink', 'vault',
  'craft', 'notes', 'arc', 'saga', 'panel', 'studio', 'pulse', 'club', 'zero', 'kai',
];

const ARCHETYPES: { label: string; style: PersonaWritingStyle }[] = [
  { label: 'Lore & Foreshadowing Theorist', style: 'anime_theories' },
  { label: 'Matchup & Power-System Analyst', style: 'character_comparisons' },
  { label: 'Weekly Premiere Reactor', style: 'episode_reactions' },
  { label: 'Underground & Classic Curator', style: 'anime_recommendations' },
  { label: 'Fandom Humor & Banter Regular', style: 'funny_reactions' },
  { label: 'Community Host & Question Starter', style: 'questions_and_replies' },
  { label: 'Animation & Writing Essayist', style: 'detailed_discussions' },
];

const SHADOW_PRESETS: { qualities: string[]; label: string }[] = [
  { qualities: ['curious', 'analytical', 'calm'], label: 'Archive Strategist' },
  { qualities: ['fierce', 'loyal', 'relentless'], label: 'Crimson Vanguard' },
  { qualities: ['creative', 'observant', 'patient'], label: 'Sakuga Chronicler' },
  { qualities: ['witty', 'bold', 'expressive'], label: 'Astral Trickster' },
  { qualities: ['empathetic', 'reflective', 'wise'], label: 'Twilight Sage' },
  { qualities: ['focused', 'disciplined', 'tactical'], label: 'Obsidian Tactician' },
];

const HOBBY_PHRASES = [
  'collecting vinyl anime OSTs and OP storyboards',
  'stepping through sakuga cuts frame-by-frame at 2 AM',
  'tracking foreshadowing across manga chapters and anime adaptations',
  'ranking seasonal premieres with zero recency bias',
  'sketching original dark-fantasy environments between episodes',
  'building spoiler-free watch guides for newcomers',
  'debating power systems with actual canon receipts',
  'hunting underrated 12-episode gems from the 2000s and 2010s',
  'breaking down sound design, color scripts, and voice acting performances',
  'rewatching comfort slice-of-life arcs after heavy seinen finales',
  'archiving director interviews and studio production notes',
  'hosting late-night episode watchalongs and poll brackets',
];

function capFirst(raw: string): string {
  const s = raw.trim();
  if (!s) return 'Ren';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generateDeterministicDemoPersona(index: number): GeneratedDemoPersona {
  const n = Math.max(1, Math.floor(index));
  const fIdx = ((n - 1) * 37 + 11) % FIRST_NAMES.length;
  const sIdx = (Math.floor((n - 1) / FIRST_NAMES.length) * 53 + (n - 1) * 19 + 7) % SECOND_EPITHETS.length;
  const first = capFirst(FIRST_NAMES[fIdx]);
  const second = capFirst(SECOND_EPITHETS[sIdx]);

  const nameMode = n % 5;
  let displayName = `${first} ${second}`;
  if (nameMode === 1) displayName = `${first} · ${second}`;
  if (nameMode === 2) displayName = `${first} ${second} (${ANIME_KNOWLEDGE_POOL[n % ANIME_KNOWLEDGE_POOL.length].genres[0]})`;
  if (nameMode === 2) displayName = `${first} ${second}`; // keep clean natural display name
  if (nameMode === 3 && n > 3000) displayName = `${second} ${first}`;

  const joiner = HANDLE_JOINERS[n % HANDLE_JOINERS.length];
  const tag = HANDLE_TAGS[(n * 13) % HANDLE_TAGS.length];
  const baseHandle = `${first.toLowerCase()}${joiner}${second.toLowerCase()}`
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 15);
  // Guarantee 100% collision-free unique @username across all 10,000+ accounts
  const username = `${baseHandle}_${tag.slice(0, 3)}${n}`.slice(0, 24);
  const usernameNormalized = username.toLowerCase();

  const uid = `ai_demo_${String(n).padStart(5, '0')}`;
  const kageId = `KAGE-${String(10000 + n).padStart(8, '0')}`;
  const email = `${usernameNormalized}@hunters.kage.app`;

  const animeRef = ANIME_KNOWLEDGE_POOL[(n * 7 + 3) % ANIME_KNOWLEDGE_POOL.length];
  const secondaryAnime = ANIME_KNOWLEDGE_POOL[(n * 17 + 9) % ANIME_KNOWLEDGE_POOL.length];
  const arch = ARCHETYPES[(n * 3) % ARCHETYPES.length];
  const hobby = HOBBY_PHRASES[(n * 11 + 5) % HOBBY_PHRASES.length];
  const shadow = SHADOW_PRESETS[n % SHADOW_PRESETS.length];

  const extraGenrePool = [
    'Action', 'Dark Fantasy', 'Fantasy', 'Sci-Fi', 'Seinen', 'Psychological',
    'Mystery', 'Romance', 'Slice of Life', 'Comedy', 'Mecha', 'Cyberpunk', 'Music', 'Historical',
  ];
  const genreSet = new Set<string>([
    ...animeRef.genres,
    extraGenrePool[(n * 5) % extraGenrePool.length],
    extraGenrePool[(n * 9 + 4) % extraGenrePool.length],
  ]);
  const genres = Array.from(genreSet).slice(0, 4);

  const bioTemplates = [
    `${arch.label} · ${hobby}. All-time favorite: ${animeRef.title} (${animeRef.character}).`,
    `Into ${animeRef.motif} and ${hobby}. Top rotation: ${animeRef.title} & ${secondaryAnime.title}.`,
    `Exploring ${genres.slice(0, 3).join(', ')} realms on KAGE while ${hobby}. ${animeRef.character} appreciator.`,
    `${animeRef.studio} animation fan ${hobby}. Always down to talk ${animeRef.title} & ${secondaryAnime.title}.`,
    `${genres.slice(0, 2).join(' & ')} regular · ${hobby}. Current comfort rewatch: ${animeRef.title}.`,
    `Here for ${animeRef.motif}, late-night watchalongs, and ${hobby}. Favorite character arc: ${animeRef.character}.`,
  ];
  const bio = bioTemplates[n % bioTemplates.length].slice(0, 275);

  const isCommunityMember = n <= 5000;
  const activityCadence: 'high' | 'normal' | 'casual' =
    n % 5 === 0 ? 'high' : n % 2 === 0 ? 'normal' : 'casual';

  return {
    index: n,
    uid,
    kageId,
    email,
    username,
    usernameNormalized,
    displayName,
    avatarUrl: `/api/demo-avatar/p_${n}.svg`,
    bannerUrl: `/api/demo-banner/b_${n}.svg`,
    bio,
    personaArchetype: arch.label,
    writingStyle: arch.style,
    favoriteAnime: animeRef.title,
    favoriteAnimeMalId: animeRef.malId,
    favoriteAnimeImage: animeRef.imageUrl,
    favoriteCharacter: animeRef.character,
    genres,
    shadowQualities: shadow.qualities,
    shadowLabel: shadow.label,
    isCommunityMember,
    activityCadence,
    disclosureLabel: '',
  };
}

export interface DemoCommunityBlueprint {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  animeMalId: number | null;
  animeTitle: string | null;
  genreTags: string[];
  artworkUrl: string;
  bannerUrl: string;
}

export const DEMO_COMMUNITIES_CATALOG: DemoCommunityBlueprint[] = [
  {
    slug: 'crimson-lore-sanctum',
    name: 'Crimson Lore Sanctum',
    tagline: 'Foreshadowing · Worldbuilding · Canon Receipts',
    description:
      'Deep-dive anime & manga theorycrafting hub dissecting long-term foreshadowing, hidden symbolism, and timeline mechanics across dark fantasy and mystery series.',
    category: 'Lore & Theories',
    animeMalId: 16498,
    animeTitle: 'Attack on Titan',
    genreTags: ['Dark Fantasy', 'Mystery', 'Suspense'],
    artworkUrl: '/api/demo-avatar/guild_lore.svg',
    bannerUrl: '/api/demo-banner/guild_lore_bg.svg',
  },
  {
    slug: 'sakuga-keyframe-atelier',
    name: 'Sakuga Keyframe Atelier',
    tagline: 'Every Impact Frame & Storyboard Cut',
    description:
      'Celebrating key animators, storyboarders, compositing breakthroughs, and fluid action cuts from Bones, MAPPA, ufotable, Madhouse, Kyoto Animation, and Trigger.',
    category: 'Animation Craft',
    animeMalId: 40748,
    animeTitle: 'Jujutsu Kaisen',
    genreTags: ['Action', 'Supernatural', 'Fantasy'],
    artworkUrl: '/api/demo-avatar/guild_sakuga.svg',
    bannerUrl: '/api/demo-banner/guild_sakuga_bg.svg',
  },
  {
    slug: 'black-bulls-mana-arena',
    name: 'Grimoire & Mana Vanguard',
    tagline: 'Surpass Your Limits · Right Here, Right Now',
    description:
      'Battle shonen headquarters for grimoire spell combos, squad captains, tournament arcs, and high-stakes power-system matchups.',
    category: 'Battle Shonen',
    animeMalId: 34572,
    animeTitle: 'Black Clover',
    genreTags: ['Action', 'Fantasy', 'Adventure'],
    artworkUrl: '/api/demo-avatar/guild_mana.svg',
    bannerUrl: '/api/demo-banner/guild_mana_bg.svg',
  },
  {
    slug: 'seinen-philosophers-circle',
    name: 'Seinen Philosophers Circle',
    tagline: 'Character Studies · Ethics · Timeless Arcs',
    description:
      'Thoughtful essays and discussions on Vinland Saga, Monster, Berserk, Vagabond, and character-driven psychological masterworks.',
    category: 'Seinen & Drama',
    animeMalId: 37521,
    animeTitle: 'Vinland Saga',
    genreTags: ['Seinen', 'Drama', 'Psychological', 'Historical'],
    artworkUrl: '/api/demo-avatar/guild_seinen.svg',
    bannerUrl: '/api/demo-banner/guild_seinen_bg.svg',
  },
  {
    slug: 'neo-tokyo-cyber-syndicate',
    name: 'Neo-Tokyo Cyber Syndicate',
    tagline: 'Worldlines · Chrome · Mecha Horizons',
    description:
      'Sci-fi, cyberpunk, time-loop, and mecha community exploring Steins;Gate, Cyberpunk: Edgerunners, 86 Eighty-Six, and Code Geass.',
    category: 'Sci-Fi & Cyberpunk',
    animeMalId: 42310,
    animeTitle: 'Cyberpunk: Edgerunners',
    genreTags: ['Sci-Fi', 'Cyberpunk', 'Mecha', 'Suspense'],
    artworkUrl: '/api/demo-avatar/guild_cyber.svg',
    bannerUrl: '/api/demo-banner/guild_cyber_bg.svg',
  },
  {
    slug: 'beyond-journeys-hearth',
    name: "Beyond Journey's Hearth",
    tagline: 'High Fantasy · Quiet Epics · Cozy Taverns',
    description:
      'For fans of Frieren, atmospheric fantasy worldbuilding, party chemistry, magical ecology, and restorative slice-of-life detours.',
    category: 'Fantasy & Slice of Life',
    animeMalId: 52991,
    animeTitle: "Frieren: Beyond Journey's End",
    genreTags: ['Fantasy', 'Adventure', 'Drama', 'Slice of Life'],
    artworkUrl: '/api/demo-avatar/guild_hearth.svg',
    bannerUrl: '/api/demo-banner/guild_hearth_bg.svg',
  },
  {
    slug: 'overture-ost-amphitheater',
    name: 'Overture OST Amphitheater',
    tagline: 'Openings · Endings · Orchestral Drops',
    description:
      'Dedicated to anime composers, OP/ED visual direction, insert-song needle drops, and live band anime soundtracks.',
    category: 'Music & Soundtracks',
    animeMalId: 47917,
    animeTitle: 'Bocchi the Rock!',
    genreTags: ['Music', 'Comedy', 'Drama'],
    artworkUrl: '/api/demo-avatar/guild_ost.svg',
    bannerUrl: '/api/demo-banner/guild_ost_bg.svg',
  },
  {
    slug: 'seasonal-premiere-watchtower',
    name: 'Seasonal Premiere Watchtower',
    tagline: 'Weekly Episode Threads · Hidden Gems · Polls',
    description:
      'Weekly episode reaction threads, three-episode rule check-ins, hidden gem recommendations, and spoiler-tagged finale polls.',
    category: 'Seasonal Watch',
    animeMalId: 54492,
    animeTitle: 'The Apothecary Diaries',
    genreTags: ['Mystery', 'Action', 'Comedy', 'Romance'],
    artworkUrl: '/api/demo-avatar/guild_watch.svg',
    bannerUrl: '/api/demo-banner/guild_watch_bg.svg',
  },
];

export interface ContextCommentInput {
  seedIndex: number;
  persona: GeneratedDemoPersona;
  postTitle: string;
  postContent: string;
  postAnimeTitle?: string | null;
  postGenres?: string[];
  pollQuestion?: string | null;
  isOwnerShowcase?: boolean;
  parentAuthorUsername?: string | null;
  parentSnippet?: string | null;
}

interface AnimeCanonDetail {
  moment: string;
  craftNote: string;
  ostOrVibe: string;
  secondaryLead: string;
}

const ANIME_CANON_NOTES: Record<string, AnimeCanonDetail> = {
  'Solo Leveling': {
    moment: 'Jin-Woo vs Blood-Red Commander Igris and the first "Arise" shadow extraction',
    craftNote: 'A-1 Pictures dagger-swap choreography and blue-violet mana lighting',
    ostOrVibe: 'Hiroyuki Sawano dropping DARK ARIA right as the dungeon stakes flip',
    secondaryLead: 'Cha Hae-In & Igris',
  },
  'Jujutsu Kaisen': {
    moment: 'Gojo popping the 0.2-second Unlimited Void in Shibuya and Yuji & Todo tag-teaming',
    craftNote: 'MAPPA hand-to-hand camera sweeps and Black Flash impact frames',
    ostOrVibe: 'Yoshimasa Terui basslines locking in mid-exchange',
    secondaryLead: 'Nanami & Megumi',
  },
  'Demon Slayer: Kimetsu no Yaiba': {
    moment: 'Zenitsu hitting Thunderclap and Flash: Godspeed across the rooftops',
    craftNote: 'ufotable 3D camera compositing blended with hand-drawn elemental effects',
    ostOrVibe: 'Go Shiina & Yuki Kajiura turning every finale into a theater experience',
    secondaryLead: 'Tanjiro & Tengen Uzui',
  },
  'Attack on Titan': {
    moment: 'Levi shredding the Beast Titan and the basement reveal recontextualizing Season 1',
    craftNote: 'Isayama planting background clues three seasons before the payoff',
    ostOrVibe: 'Sawano dropping YouSeeBIGGIRL / Vogel im Käfig at the exact betrayal beat',
    secondaryLead: 'Erwin Smith & Eren',
  },
  "Frieren: Beyond Journey's End": {
    moment: 'Frieren dropping her mana suppression in front of Aura the Guillotine',
    craftNote: 'Madhouse giving quiet campfire conversations as much care as Zoltraak duels',
    ostOrVibe: 'Evan Call folk-orchestral strings carrying centuries of nostalgia',
    secondaryLead: 'Fern, Stark & Himmel',
  },
  'Black Clover': {
    moment: 'Captain Yami slicing through dimensions alongside Asta against Dante',
    craftNote: 'rough monochrome impact sketches erupting when Yami surpasses his limits',
    ostOrVibe: 'Haruka Mirai kicking in right as the Black Bulls refuse to stay down',
    secondaryLead: 'Asta & Noelle',
  },
  'One Piece': {
    moment: 'Zoro standing in Thriller Bark ("Nothing happened") and Roof Piece in Wano',
    craftNote: 'Oda paying off island lore seeds planted 400+ episodes earlier',
    ostOrVibe: 'Overtaken drums starting up as the crew walks in formation',
    secondaryLead: 'Luffy & Sanji',
  },
  'Hunter x Hunter (2011)': {
    moment: 'Killua activating Godspeed and the Chimera Ant Palace Invasion staircase freeze-time',
    craftNote: 'Togashi making Nen vows and tactical information warfare matter more than raw aura',
    ostOrVibe: 'Kingdom of Predators orchestral tension during the Meruem & Komugi finale',
    secondaryLead: 'Kurapika & Gon',
  },
  'Fullmetal Alchemist: Brotherhood': {
    moment: 'Mustang vs Envy and Edward bargaining at the Gate of Truth on the Promised Day',
    craftNote: 'Bones keeping all 64 episodes airtight with zero wasted subplots',
    ostOrVibe: 'Again and Rain framing the Elric brothers journey from start to finish',
    secondaryLead: 'Alphonse & Roy Mustang',
  },
  'Vinland Saga': {
    moment: 'Thorfinn swearing "I have no enemies" after surviving the Ketil farm arc',
    craftNote: 'trading revenge spectacle for one of the bravest redemption arcs in seinen',
    ostOrVibe: 'Yutaka Yamada quiet Nordic strings over the wheat fields',
    secondaryLead: 'Askeladd & Einar',
  },
  'Death Note': {
    moment: 'L baiting Kira live on the Lind L. Tailor Kanto broadcast in Episode 2',
    craftNote: 'turning two geniuses talking in a room into edge-of-your-seat war',
    ostOrVibe: "L's Theme guitar loop clicking in mid-deduction",
    secondaryLead: 'Light Yagami & Ryuk',
  },
  'Code Geass': {
    moment: 'Lelouch executing Zero Requiem and every pieces-on-the-board gambit paying off',
    craftNote: 'Sunrise balancing operatic mecha theatrics with devastating personal cost',
    ostOrVibe: 'Continued Story playing over the final parade',
    secondaryLead: 'C.C. & Suzaku',
  },
  'Chainsaw Man': {
    moment: 'Aki quiet morning routine contrasted against the Katana Man train ambush',
    craftNote: 'Ryu Nakayama live-action cinema framing and grounded body language',
    ostOrVibe: 'Kensuke Ushio minimalist industrial score + 12 unique EDs',
    secondaryLead: 'Aki & Power',
  },
  'Bleach: Thousand-Year Blood War': {
    moment: 'Yamamoto unleashing Zanka no Tachi and Ichigo forging his true Dual Zangetsu',
    craftNote: 'Pierrot Films high-contrast crimson/void lighting and title-card poetry',
    ostOrVibe: 'Shiro Sagisu remixing Number One with full choir',
    secondaryLead: 'Byakuya & Rukia',
  },
  'Steins;Gate': {
    moment: 'Episode 12 shattering the cozy lab vibe and Operation Skuld looping back to Ep 1',
    craftNote: 'every throwaway gag in the first half becoming crucial worldline mechanics',
    ostOrVibe: 'Hacking to the Gate & Gate of Steiner hitting during the rooftop promise',
    secondaryLead: 'Kurisu Makise & Mayuri',
  },
  'Violet Evergarden': {
    moment: 'Episode 10 ("A Loved One Will Always Watch Over You") fifty years of birthday letters',
    craftNote: 'Kyoto Animation animating subtle lip tremors, sunlit water, and typewriter keys',
    ostOrVibe: 'Evan Call piano & chamber strings wrecking everyone emotionally',
    secondaryLead: 'Gilbert & Claudia',
  },
  'Monster': {
    moment: 'Dr. Tenma holding steady to the value of a single life while hunting Johan',
    craftNote: 'Naoki Urasawa giving even two-episode side characters unforgettable humanity',
    ostOrVibe: 'rain-soaked European noir tension without cheap jump scares',
    secondaryLead: 'Johan Liebert & Inspector Lunge',
  },
  'Cyberpunk: Edgerunners': {
    moment: 'David & Lucy on the moon BD and the final Arasaka Tower run',
    craftNote: 'Studio Trigger neon yellow-magenta color scripts and kinetic Sandevistan trails',
    ostOrVibe: '"I Really Want to Stay at Your House" turning into instant heartbreak',
    secondaryLead: 'David Martinez & Rebecca',
  },
  'Mob Psycho 100': {
    moment: 'Reigen stepping up for Mob when his 100% emotions threaten to spill over',
    craftNote: 'Bones letting animators go wild with paint-on-glass and sketchy sakuga',
    ostOrVibe: '99 / 99.9 hype balanced with genuine kindness as real strength',
    secondaryLead: 'Shigeo "Mob" Kageyama & Dimple',
  },
  'Bocchi the Rock!': {
    moment: 'Bocchi snapping out of stage panic in Episode 8 with that slide-guitar solo at Starry',
    craftNote: 'CloverWorks blending claymation/papercraft anxiety gags with accurate fingerings',
    ostOrVibe: '"That Band" (Ano Bando) sounding like a legit indie rock record',
    secondaryLead: 'Nijika, Ryo & Kita',
  },
  'Spy x Family': {
    moment: 'Anya panicked telepath faces at Eden Academy and Loid renting an entire castle',
    craftNote: 'WIT & CloverWorks nailing deadpan spy timing alongside real found-family warmth',
    ostOrVibe: 'Comedy and Mixed Nuts upbeat jazz-pop energy',
    secondaryLead: 'Loid & Yor Forger',
  },
  'Naruto: Shippuden': {
    moment: 'Kakashi vs Obito pure taijutsu cut-backs and Itachi parting forehead tap',
    craftNote: 'Pierrot letting silent martial arts choreography tell ten years of grief',
    ostOrVibe: 'Samidare & Senya strings carrying generational shinobi weight',
    secondaryLead: 'Naruto, Sasuke & Kakashi',
  },
  '86 Eighty-Six': {
    moment: 'Episode 22–23 rail-track match-cut when Lena & Shin finally stand in the same frame',
    craftNote: 'Toshimasa Ishii using aspect-ratio borders and framing as pure visual storytelling',
    ostOrVibe: 'Sawano "Voices of the Chord" needle drop in the poppies',
    secondaryLead: 'Shin Nouzen & Spearhead Squadron',
  },
  'The Apothecary Diaries': {
    moment: 'Maomao lighting up over deadly poison tests while solving the palace powder mystery',
    craftNote: 'sharp historical deduction paired with Maomao & Jinshi comedic chemistry',
    ostOrVibe: 'Hana ni Natte & lush imperial garden color direction',
    secondaryLead: 'Jinshi & Lady Gyokuyou',
  },
};

const NON_COMBAT_SERIES = new Set([
  'Violet Evergarden',
  'Bocchi the Rock!',
  'The Apothecary Diaries',
  'Monster',
  'Steins;Gate',
  'Spy x Family',
]);

export function composeContextAwareComment(input: ContextCommentInput): string {
  const {
    seedIndex,
    persona,
    postTitle,
    postContent,
    postAnimeTitle,
    postGenres,
    pollQuestion,
    isOwnerShowcase,
    parentAuthorUsername,
  } = input;

  const cleanTitle = (postTitle || '').trim();
  const cleanBody = (postContent || '').replace(/^\[AI Demo[^\]]*\]\s*/i, '').trim();
  const combinedLower = `${cleanTitle} ${cleanBody}`.toLowerCase();

  const subjectAnime =
    (postAnimeTitle && postAnimeTitle.trim()) ||
    persona.favoriteAnime ||
    'Solo Leveling';
  const canon =
    ANIME_CANON_NOTES[subjectAnime] || ANIME_CANON_NOTES['Solo Leveling'];
  const genreFocus =
    (postGenres && postGenres[0]) ||
    persona.genres[0] ||
    'Dark Fantasy';

  const vsMatch = /:\s*([^:]+?)\s+vs\s+(.+)$/i.exec(cleanTitle);
  const pairMatch = /If You Loved\s+(.+?),\s*Watch\s+(.+?)\s+Next/i.exec(cleanTitle);
  const isKageLaunch =
    /welcome to kage/i.test(cleanTitle) ||
    /28 anime genres|webrtc voice rooms|every realm/i.test(cleanBody);
  const isAnimeUniverseWelcome =
    /welcome to anime universe/i.test(cleanTitle) ||
    /place for all anime lovers/i.test(cleanBody);
  const isEpCheckin =
    /\b(\d+\s*episode|ep\s*\d+|just started|watched)\b/i.test(combinedLower) &&
    cleanBody.length < 120;
  const isCasualGreeting =
    !postAnimeTitle &&
    cleanBody.length < 40 &&
    /^(hey+|hi+|yo+|hello|sup)\b/i.test(combinedLower);
  const isArtworkStudy = /color palette|realm study|illustration/i.test(cleanTitle);
  const isScheduleNotice = /spoiler etiquette|rewatch thread schedule/i.test(cleanTitle);

  // 1. Nested reply branch — conversational & natural @mention
  if (parentAuthorUsername) {
    if (isKageLaunch || isAnimeUniverseWelcome) {
      const welcomeReplies = [
        `@${parentAuthorUsername} Same here! Already joined three guilds tonight, the vibe here is unmatched.`,
        `@${parentAuthorUsername} Facts — having ${persona.favoriteAnime} and ${subjectAnime} fans under one roof without timeline clutter feels so refreshing.`,
        `@${parentAuthorUsername} Count me in for the weekend watchalong! Dropping into the voice rooms right after I finish this arc.`,
        `@${parentAuthorUsername} W taste honestly. ${persona.favoriteCharacter} + ${subjectAnime} is an elite starter combo.`,
        `@${parentAuthorUsername} Exactly what anime Twitter/Reddit was missing. Clean UI and actual canon discussions.`,
        `@${parentAuthorUsername} Glad I'm not the only one losing sleep exploring all the genre realms tonight lol.`,
        `@${parentAuthorUsername} Let's run a Clash bracket on that matchup this weekend, would easily pull huge votes.`,
        `@${parentAuthorUsername} 100%. Shoutout to @yaseen for putting real thought into how guilds and live rooms connect.`,
      ];
      return welcomeReplies[seedIndex % welcomeReplies.length];
    }

    if (vsMatch) {
      const charA = vsMatch[1].trim();
      const charB = vsMatch[2].trim();
      const vsReplies = [
        `@${parentAuthorUsername} Fair take on ${charA}, though ${charB}'s adaptability when plans fall apart still gives them a real edge.`,
        `@${parentAuthorUsername} Agreed! People underrate how much character writing carries ${charB}'s biggest moments too.`,
        `@${parentAuthorUsername} If we're talking pure composure under pressure, ${charA} takes round one, ${charB} takes overall arc payoff.`,
        `@${parentAuthorUsername} Finally someone brought up actual canon feats instead of pure nostalgia — spot on.`,
      ];
      return vsReplies[seedIndex % vsReplies.length];
    }

    if (isEpCheckin) {
      const epReplies = [
        `@${parentAuthorUsername} Seriously, mute all hashtags until you finish Season 1 — going in blind makes the twists 10x crazier!`,
        `@${parentAuthorUsername} Oh man, to experience ${subjectAnime} for the first time again... Episode 5 onward doesn't let up.`,
        `@${parentAuthorUsername} Seconding this! Pay attention to the background reactions too on your watch.`,
      ];
      return epReplies[seedIndex % epReplies.length];
    }

    const contextualReplies = [
      `@${parentAuthorUsername} Hard agree — especially ${canon.moment}. That whole sequence never gets old.`,
      `@${parentAuthorUsername} You nailed it on ${canon.craftNote}. You can tell the storyboard team had full creative freedom there.`,
      `@${parentAuthorUsername} Wait I never noticed that parallel until you pointed it out, definitely rewatching that episode tonight.`,
      `@${parentAuthorUsername} Plus ${canon.ostOrVibe}! Audio direction did just as much heavy lifting as the visuals.`,
      `@${parentAuthorUsername} Respectfully I'd put ${canon.secondaryLead} right up there too — their dynamic anchors the whole arc.`,
      `@${parentAuthorUsername} Bookmarking this take. Easily one of the cleanest breakdowns in the thread.`,
      `@${parentAuthorUsername} Facts, ${subjectAnime} really spoiled us for pacing in ${genreFocus.toLowerCase()}.`,
      `@${parentAuthorUsername} My jaw dropped at that exact cut too, replayed it four times back-to-back.`,
    ];
    return contextualReplies[seedIndex % contextualReplies.length].slice(0, 460);
  }

  // 2. Post #1 — KAGE Platform Launch Proclamation ("Welcome to KAGE — The Anime Universe")
  if (isKageLaunch) {
    const kageLaunchComments = [
      `Finally an anime platform that actually feels built by real fans! Browsing all 28 genre realms right now — ${persona.favoriteAnime} and Solo Leveling look incredible on the dark UI.`,
      `Massive W @yaseen! Just claimed my spot in the Dark Fantasy & Action guilds. That Solo Leveling banner goes crazy.`,
      `Having Realms, Pulse, Guild chat rooms, and live voice lounges in one place is elite. Who else is hopping into voice chat tonight?`,
      `First day here and my watchlist already grew by ten shows. Starting with Solo Leveling and ${persona.favoriteAnime} rewatches!`,
      `The Clash arena + 28 genre realms setup is genius. Can't wait for the weekly premiere reaction threads here.`,
      `Let's gooo! Shoutout to the founder @yaseen — smooth dark theme, fast feeds, and zero clutter. Claiming the ${genreFocus} realm first!`,
      `Solo Leveling "Arise" energy on launch day 🔥 Drop your top 3 anime below so I can follow fellow ${genreFocus.toLowerCase()} fans!`,
      `Tested the Guild rooms and Clash voting — everything feels snappy on both phone and laptop. KAGE is officially home base now.`,
      `As someone obsessed with ${canon.craftNote} and ${persona.favoriteAnime}, having dedicated spaces for real sakuga & lore talk is a dream.`,
      `Claiming Seinen & Dark Fantasy immediately! Anyone doing a ${persona.favoriteAnime} or Solo Leveling watchalong this Friday?`,
      `Been waiting for a dedicated anime community like this since forever. ${persona.favoriteCharacter} stans assemble in the replies!`,
      `28 anime genres properly organized without algorithm noise — huge respect for how clean Realms feels.`,
      `Just set up my hunter profile and customized my favorite character (${persona.favoriteCharacter}). Add me if you talk ${persona.favoriteAnime} theories!`,
      `The Solo Leveling showcase visual on this post is pure heat. Ready for raid nights in the Guilds tab!`,
      `From voice rooms to character Clashes, KAGE nailed every feature anime communities actually use daily. Congrats on launch!`,
      `Checking in from the ${persona.favoriteAnime} fandom! Which guild is the most active for late-night OST & episode discussions?`,
    ];
    return kageLaunchComments[seedIndex % kageLaunchComments.length];
  }

  // 3. Post #3 — Anime Universe Community Welcome ("Welcome to Anime Universe! 👑")
  if (isAnimeUniverseWelcome || isOwnerShowcase) {
    const animeUniverseComments = [
      `Happy to be here! 👑 Current top 3: ${persona.favoriteAnime}, Solo Leveling, and Attack on Titan. Excited to see everyone's edits and theories!`,
      `W community @yaseen! Always down to talk ${persona.favoriteAnime} lore, seasonal premieres, and underrated ${genreFocus.toLowerCase()} gems.`,
      `Checking into Anime Universe! If anyone here edits AMVs or breaks down sakuga cuts, let's connect.`,
      `Thanks for the warm welcome! Currently rewatching ${persona.favoriteAnime} (${persona.favoriteCharacter} still GOATed) — what's everyone watching this week?`,
      `Love the energy in this guild already 🌟 Dropping my spoiler-free ${genreFocus} recommendations in the main feed soon!`,
      `Glad to join! Big fan of ${persona.favoriteAnime} and ${ANIME_CANON_NOTES[persona.favoriteAnime]?.ostOrVibe ? 'great anime soundtracks' : 'tight storyboarding'}. Let's make this the best guild on KAGE.`,
      `Anime Universe gang! 👑 Who else stays up till 3 AM reading fan theories after a cliffhanger episode?`,
      `Appreciate a chill, respectful space for all anime lovers. Whether you're into shonen battles or quiet seinen dramas, you're welcome in my book!`,
      `Just hit join! Ready for the character polls, episode threads, and late-night voice room hangouts.`,
      `Top tier guild already 🔥 Putting ${persona.favoriteCharacter} (${persona.favoriteAnime}) forward as my all-time favorite character — what's yours?`,
      `Hyped to share some ${persona.favoriteAnime} frame studies and OST rankings here this weekend!`,
      `Welcome everyone! Don't sleep on ${persona.favoriteAnime} if you haven't seen it yet — easily a 10/10 ride.`,
      `W Admin! Clean rules, great members, and non-stop anime talk. Glad I found this guild early.`,
      `Dropping a wave from a huge ${genreFocus} & ${persona.favoriteAnime} fan! Feel free to reply with what's currently #1 on your watchlist.`,
      `Let's gooo! Can't wait for the weekly watch parties and heated (but friendly) Clash debates in here.`,
      `Here for the memes, stayed for the 500-word ${persona.favoriteAnime} lore essays lol. Happy to be part of Anime Universe!`,
    ];
    return animeUniverseComments[seedIndex % animeUniverseComments.length];
  }

  // 4. First-time episode check-in (e.g., "Hey" / "2 episode I watched" on Attack on Titan)
  if (isEpCheckin) {
    const epCheckinComments = [
      `Welcome! Episode 2 of ${subjectAnime} is literally just lighting the fuse — whatever you do, stay away from spoilers until you finish Season 1!`,
      `Oh man I wish I could wipe my memory and watch ${subjectAnime} from Episode 2 again. Wait till you hit Episode 5, come back and tell us your reaction!`,
      `You're in for an all-time masterpiece with ${subjectAnime}. Even small background details in those first two episodes pay off seasons later.`,
      `Keep going!! The pacing ramps up fast from here and the soundtrack drops in ${subjectAnime} give unreal goosebumps.`,
      `2 episodes in and already posting — you're about to binge 10 more tonight, guaranteed lol. Enjoy the ride!`,
      `Pro tip for ${subjectAnime}: don't Google ANY character names while watching, auto-complete spoils everything!`,
    ];
    return epCheckinComments[seedIndex % epCheckinComments.length];
  }

  // 5. Casual short greeting ("Heyyy")
  if (isCasualGreeting) {
    const casualComments = [
      `Heyyy! Welcome to the Pulse timeline — what anime are you watching right now?`,
      `Yo! Good to see more hunters active here. Drop your top 3 anime!`,
      `Hey! W username btw, Gojo fans stay winning on KAGE.`,
      `Heyyy 👋 Need any ${genreFocus.toLowerCase()} recommendations for the weekend or already stacked?`,
      `Welcome in! Check out the live Guild rooms too if you're up for anime chat.`,
    ];
    return casualComments[seedIndex % casualComments.length];
  }

  // 6. Character Matchup / Writing Debate ("X vs Y")
  if (vsMatch) {
    const charA = vsMatch[1].trim();
    const charB = vsMatch[2].trim();
    const debateComments = [
      `Give me ${charA} for sheer composure when backed into a corner, but ${charB}'s long-term character arc hits slightly deeper emotionally.`,
      `People sleep on ${charB}'s decision-making under pressure. Nostalgia aside, both earn every single turning point in their stories.`,
      `Tactical instincts: ${charA}. Thematic writing and how flaws drive the plot: ${charB} by a razor-thin margin. Great matchup prompt.`,
      `Honestly ${charA} takes both categories for me — ${canon.moment} sealed their status as an all-timer.`,
      `Tough call because their worlds play by such different rules, yet ${charB}'s growth without plot armor makes every scene hit harder.`,
      `Splitting my vote: ${charA} owns the screen presence and clutch instincts, while ${charB} has one of the cleanest character payoffs in anime.`,
      `If you look strictly at canon receipts when plans fall apart mid-crisis, ${charA}'s adaptability is genuinely scary.`,
      `Love matchups that look at actual writing instead of just power-scaling. ${charB}'s internal conflict contrasted against ${charA}'s resolve is elite.`,
    ];
    return debateComments[seedIndex % debateComments.length];
  }

  // 7. Recommendation Pairing ("If You Loved X, Watch Y Next")
  if (pairMatch) {
    const animeX = pairMatch[1].trim();
    const animeY = pairMatch[2].trim();
    const thirdSuggestion =
      persona.favoriteAnime !== animeX && persona.favoriteAnime !== animeY
        ? persona.favoriteAnime
        : 'Steins;Gate';
    const recComments = [
      `Co-signing ${animeX} + ${animeY} 100%! For the third slot in that watchlist trio, ${thirdSuggestion} fits the exact same tone.`,
      `Watched ${animeY} right after finishing ${animeX} last month and the transition was seamless — neither show spoon-feeds the audience.`,
      `Elite pairing. Both ${animeX} and ${animeY} nail slow-burn tension before pulling the rug in the second half.`,
      `Adding ${animeY} to my Watchlist tonight! ${animeX} left a massive void after the finale so this came at the perfect time.`,
      `For #3 in that trio I'd throw in ${thirdSuggestion} — same trust in visual storytelling and unforgettable character dynamics.`,
      `Underrated connection between ${animeX} and ${animeY}: the sound direction during quiet scenes carries just as much weight as the climaxes.`,
    ];
    return recComments[seedIndex % recComments.length];
  }

  // 8. Community Poll Threads
  if (pollQuestion) {
    const pollComments = [
      `Voted Foreshadowing & Thematic Payoff! ${subjectAnime} proves that when early seeds pay off arcs later (${canon.craftNote}), an arc becomes timeless.`,
      `Had to pick Character Transformation & Stakes — sakuga gets clips trending, sure, but ${canon.secondaryLead} and the emotional stakes keep you thinking about ${subjectAnime} for years.`,
      `OST Needle Drops & Voice Acting got my vote. Think about ${canon.ostOrVibe} — half those iconic goosebumps come straight from the audio mix!`,
      `Went with Sakuga Choreography & Direction. ${canon.craftNote} elevated ${subjectAnime} from great source material into a cultural event.`,
      `Honestly torn between Foreshadowing and Character Stakes, ended up voting Stakes because without characters you care about, plot twists don't land.`,
      `Voted Direction! When storyboarding, silence, and pacing click like they do in ${subjectAnime}, every episode feels 5 minutes long.`,
    ];
    return pollComments[seedIndex % pollComments.length];
  }

  // 9. Atmospheric Artwork / Color Palette Study
  if (isArtworkStudy) {
    const artComments = [
      `The rim lighting and twilight contrast here capture ${subjectAnime}'s mood so well — genuinely looks like a background key from the show.`,
      `Love how you used negative space on the horizon! Instantly reminded me of ${canon.craftNote}.`,
      `Color script appreciation posts always get an instant like from me. That deep shadow gradient fits ${subjectAnime}'s atmosphere to perfection.`,
      `Clean composition! Making this palette work without muddying the midtones is harder than it looks.`,
      `Getting major ${subjectAnime} ending-sequence vibes from those silhouettes. Drop more realm studies soon!`,
    ];
    return artComments[seedIndex % artComments.length];
  }

  // 10. Community Schedule / Spoiler Etiquette Notice
  if (isScheduleNotice) {
    const noticeComments = [
      `Appreciate the strict manga-spoiler tagging! My current top 3 in ${genreFocus}: ${subjectAnime}, ${persona.favoriteAnime}, and Fullmetal Alchemist: Brotherhood.`,
      `Pinned and noted! Count me in for the weekly ${subjectAnime} rewatch threads — anime-only viewers deserve a clean experience.`,
      `Thanks for keeping episode threads spoiler-safe! Top 3 right now: ${persona.favoriteAnime}, ${subjectAnime}, and Hunter x Hunter.`,
      `W mod team. Organized tags make character debates and theory threads way easier to browse.`,
    ];
    return noticeComments[seedIndex % noticeComments.length];
  }

  // 11. Deep Canon-Grounded Episode / Studio Direction / Theory Comments for subjectAnime
  const animeSpecificComments = [
    `Still not over ${canon.moment}. The way ${subjectAnime} builds tension for ten minutes straight before that release is masterclass pacing.`,
    `What stands out most on a rewatch of ${subjectAnime} is ${canon.craftNote} — zero wasted cuts and every facial expression tells the story.`,
    `Don't forget ${canon.ostOrVibe}! The sound director on ${subjectAnime} deserves just as many flowers as the key animators.`,
    `${canon.secondaryLead} honestly elevate every single scene they share in ${subjectAnime}. The ensemble writing is what makes the main arc hit so hard.`,
    `Spot-on breakdown. ${subjectAnime} trusts viewers to read subtext instead of stopping the scene for five minutes of monologue exposition.`,
    `Rewatched that exact arc in ${subjectAnime} last weekend and picked up three visual callbacks from Episode 1 I completely missed the first time.`,
    `Between ${canon.craftNote} and the voice cast leaving their souls in the booth, ${subjectAnime} set the bar ridiculously high for ${genreFocus.toLowerCase()}.`,
    `Me telling myself "one episode of ${subjectAnime} before sleep" vs me at 3:15 AM staring at the ceiling after ${canon.moment}.`,
  ];

  return animeSpecificComments[seedIndex % animeSpecificComments.length].slice(0, 480);
}

export type CommunityTopicType =
  | 'discussion'
  | 'character_debate'
  | 'episode_reaction'
  | 'fan_theory'
  | 'recommendation'
  | 'poll'
  | 'artwork'
  | 'announcement';

export interface GeneratedCommunityThread {
  topicType: CommunityTopicType;
  kind: 'discussion' | 'pulse' | 'announcement';
  isAnnouncement: boolean;
  title: string;
  content: string;
  animeMalId: number | null;
  animeTitle: string | null;
  genreTags: string[];
  mediaType: 'none' | 'image';
  mediaUrl: string | null;
  pollQuestion: string | null;
  pollOptions: DiscussionPollOption[] | null;
}

const TOPIC_ROTATION: CommunityTopicType[] = [
  'discussion',
  'character_debate',
  'episode_reaction',
  'fan_theory',
  'recommendation',
  'poll',
  'artwork',
  'announcement',
];

export function composeDeterministicCommunityThread(
  seedIdx: number,
  community: { id: number; name: string; animeTitle: string | null; animeMalId: number | null; genreTags: string[] },
  author: GeneratedDemoPersona
): GeneratedCommunityThread {
  const topicType =
    seedIdx % 19 === 0
      ? 'announcement'
      : TOPIC_ROTATION[seedIdx % (TOPIC_ROTATION.length - 1)];

  const primaryRef =
    ANIME_KNOWLEDGE_POOL.find((a) => a.title === community.animeTitle) ||
    ANIME_KNOWLEDGE_POOL[seedIdx % ANIME_KNOWLEDGE_POOL.length];
  const rivalRef = ANIME_KNOWLEDGE_POOL[(seedIdx * 5 + 3) % ANIME_KNOWLEDGE_POOL.length];
  const genres = community.genreTags?.length ? community.genreTags : primaryRef.genres;
  const isNonCombat =
    NON_COMBAT_SERIES.has(primaryRef.title) || NON_COMBAT_SERIES.has(rivalRef.title);

  switch (topicType) {
    case 'character_debate':
      return {
        topicType,
        kind: 'discussion',
        isAnnouncement: false,
        title: isNonCombat
          ? `Character Writing & Arc Payoff: ${primaryRef.character} vs ${rivalRef.character}`
          : `Character Writing & Battle IQ Debate: ${primaryRef.character} vs ${rivalRef.character}`,
        content: `Putting raw nostalgia aside, let's compare ${primaryRef.character} (${primaryRef.title}) and ${rivalRef.character} (${rivalRef.title}) across two lenses:\n\n1. Composure and decision-making under pressure.\n2. How well their flaws shape the central theme of ${primaryRef.motif}.\n\nDrop your canon examples below — who takes composure under pressure and who takes overall character writing?`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };

    case 'episode_reaction':
      return {
        topicType,
        kind: 'discussion',
        isAnnouncement: false,
        title: `${primaryRef.title} — Standout Keyframes, Voice Acting & Climax Breakdown`,
        content: `Just finished rewatching the pivotal sequence in ${primaryRef.title} (${primaryRef.studio}), and the way the storyboard holds on silence right before the cut lands still hits like a truck.\n\nFavorite detail: how ${primaryRef.motif} ties directly into ${primaryRef.character}'s expression in the final shot. Which scene stood out most to you?`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };

    case 'fan_theory':
      return {
        topicType,
        kind: 'discussion',
        isAnnouncement: false,
        title: NON_COMBAT_SERIES.has(primaryRef.title)
          ? `Hidden Foreshadowing & Visual Callbacks in ${primaryRef.title}`
          : `Theory: Hidden Foreshadowing Behind ${primaryRef.title}'s Core Rules`,
        content: `Every major turning point in ${primaryRef.title} quietly mirrors a visual motif introduced in the opening episodes. Notice how ${primaryRef.motif} always carries a personal cost whenever ${primaryRef.character} reaches a crossroads.\n\nOnce you spot that parallel on a rewatch, the early episodes hit completely differently.`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };

    case 'recommendation':
      return {
        topicType,
        kind: 'discussion',
        isAnnouncement: false,
        title: `If You Loved ${primaryRef.title}, Watch ${rivalRef.title} Next (Spoiler-Free Pairing)`,
        content: `For members of ${community.name} looking for their next ${genres[0] || 'Anime'} obsession:\n\n• Anchor Vibe: ${primaryRef.title} (${primaryRef.motif})\n• Paired Pick: ${rivalRef.title} (${rivalRef.motif})\n\nBoth studios trust the audience without over-explaining every beat. What would you add as the third title in this Watchlist trio?`,
        animeMalId: rivalRef.malId,
        animeTitle: rivalRef.title,
        genreTags: Array.from(new Set([...genres, ...rivalRef.genres])).slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };

    case 'poll':
      return {
        topicType,
        kind: 'discussion',
        isAnnouncement: false,
        title: `${community.name} Poll: What Elevates an Anime Arc from Great to Iconic?`,
        content: `Thinking about ${primaryRef.title} and ${rivalRef.title} — when an arc cements itself as an all-timer in ${community.name}, what single craft element carries the biggest weight for you? Cast your vote and defend your pick in the replies!`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: `What makes a ${genres[0] || 'top-tier'} anime arc truly unforgettable?`,
        pollOptions: [
          { id: 'opt_1', text: 'Foreshadowing & Thematic Payoff', votes: 0 },
          { id: 'opt_2', text: 'Sakuga Choreography & Direction', votes: 0 },
          { id: 'opt_3', text: 'Character Transformation & Stakes', votes: 0 },
          { id: 'opt_4', text: 'OST Needle Drops & Voice Acting', votes: 0 },
        ].map((o) => ({ ...o, label: o.text })),
      };

    case 'artwork':
      return {
        topicType,
        kind: 'pulse',
        isAnnouncement: false,
        title: `Atmospheric Realm Study — Inspired by ${primaryRef.title}'s Color Palette`,
        content: `Original atmospheric landscape study inspired by the lighting contrast and horizon staging in ${primaryRef.title} (${primaryRef.studio}). Loved experimenting with twilight silhouettes and rim-lit negative space for ${community.name}.`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'image',
        mediaUrl: `/api/demo-banner/art_${seedIdx}_${author.index}.svg`,
        pollQuestion: null,
        pollOptions: null,
      };

    case 'announcement':
      return {
        topicType,
        kind: 'announcement',
        isAnnouncement: true,
        title: `${community.name} — Weekly Spoiler Etiquette & Rewatch Thread Schedule`,
        content: `Welcome to ${community.name}! Quick reminder as new hunters join:\n\n1. Keep manga-ahead spoilers clearly tagged in episode threads.\n2. Use polls and character debate tags so discussions stay easy to browse.\n3. Share your current top 3 ${genres[0] || 'anime'} picks in the replies!`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };

    default:
      return {
        topicType: 'discussion',
        kind: 'discussion',
        isAnnouncement: false,
        title: `Why ${primaryRef.studio}'s Direction on ${primaryRef.title} Still Holds Up`,
        content: `Revisiting ${primaryRef.title} inside ${community.name} — the interplay between ${primaryRef.motif} and ${primaryRef.character}'s personal stakes gives even quieter transition episodes real momentum. Which scene made you realize this series was special?`,
        animeMalId: primaryRef.malId,
        animeTitle: primaryRef.title,
        genreTags: genres.slice(0, 4),
        mediaType: 'none',
        mediaUrl: null,
        pollQuestion: null,
        pollOptions: null,
      };
  }
}

export async function generateGeminiCommunityDiscussions(params: {
  communities: { id: number; name: string; animeTitle: string | null; genreTags: string[] }[];
  count: number;
}): Promise<
  | {
      communityName: string;
      topicType: CommunityTopicType;
      title: string;
      content: string;
      animeTitle: string;
      reply1: string;
      reply2: string;
    }[]
  | null
> {
  const ai = getServerGenAi();
  if (!ai) return null;

  try {
    const commList = params.communities
      .slice(0, 8)
      .map((c) => `${c.name} (${c.animeTitle || c.genreTags.join(', ')})`)
      .join('; ');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Generate ${Math.min(12, Math.max(4, params.count))} diverse, authentic anime community discussion threads for KAGE (an anime fandom platform).
Communities available: ${commList}.
Requirements:
- Write in natural, passionate anime fan voices with zero bracketed prefixes or robotic disclaimers.
- Vary across fan_theory, character_debate, episode_reaction, recommendation, and discussion.
- Reference real anime storytelling, animation studios, soundtracks, or character arcs naturally without clichés or spam.
- Include two distinct follow-up replies (reply1, reply2) from different anime fan perspectives deeply relevant to the post.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              communityName: { type: Type.STRING },
              topicType: { type: Type.STRING },
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              animeTitle: { type: Type.STRING },
              reply1: { type: Type.STRING },
              reply2: { type: Type.STRING },
            },
            required: [
              'communityName',
              'topicType',
              'title',
              'content',
              'animeTitle',
              'reply1',
              'reply2',
            ],
          },
        },
      },
    });

    const raw = response.text?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item: any) => ({
      communityName: String(item.communityName || ''),
      topicType: (TOPIC_ROTATION.includes(item.topicType)
        ? item.topicType
        : 'discussion') as CommunityTopicType,
      title: String(item.title || '').slice(0, 135),
      content: String(item.content || '').slice(0, 1600),
      animeTitle: String(item.animeTitle || 'Solo Leveling').slice(0, 100),
      reply1: String(item.reply1 || '').slice(0, 450),
      reply2: String(item.reply2 || '').slice(0, 450),
    }));
  } catch (err) {
    console.warn('Gemini community synthesis fallback:', err);
    return null;
  }
}
