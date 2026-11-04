import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { animeCatalog, animeCatalogGenres, animeCatalogTags, animeGenres, animeTags } from '../db/schema.ts';

/**
 * Canonical 18 Primary Browsing Categories in KAGE Realms (`REALMS_CATEGORY_SECTIONS` genre/theme rows).
 * Every anime in KAGE belongs to EXACTLY ONE primary category for main category browsing,
 * while its full list of upstream genres/tags remains preserved separately as descriptive metadata.
 */
export const KAGE_PRIMARY_CATEGORIES = [
  'Action',
  'Romance',
  'Fantasy',
  'Adventure',
  'Comedy',
  'Drama',
  'Sci-Fi',
  'Mystery',
  'Thriller',
  'Horror',
  'Slice of Life',
  'Supernatural',
  'Sports',
  'Mecha',
  'Psychological',
  'Music',
  'Historical',
  'Family',
] as const;

export type KagePrimaryCategory = (typeof KAGE_PRIMARY_CATEGORIES)[number];

export const PRIMARY_CATEGORY_SLUGS_SET = new Set<string>(
  KAGE_PRIMARY_CATEGORIES.map((c) =>
    c
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
);

/**
 * Researched & verified primary category overrides by canonical MAL ID for major anime franchises
 * whose multi-genre upstream tags would otherwise cause ambiguous or duplicate classification.
 */
const VERIFIED_PRIMARY_BY_MAL_ID: Record<number, KagePrimaryCategory> = {
  // Action (central battle / hunter / demon-slaying / shinobi / superhero narrative)
  52299: 'Action', // Solo Leveling
  58567: 'Action', // Solo Leveling Season 2
  38000: 'Action', // Demon Slayer: Kimetsu no Yaiba
  40456: 'Action', // Demon Slayer: Mugen Train
  47778: 'Action', // Demon Slayer: Entertainment District Arc
  51019: 'Action', // Demon Slayer: Swordsmith Village Arc
  55701: 'Action', // Demon Slayer: Hashira Training Arc
  40748: 'Action', // Jujutsu Kaisen
  51009: 'Action', // Jujutsu Kaisen Season 2
  48561: 'Action', // Jujutsu Kaisen 0
  16498: 'Action', // Attack on Titan
  25777: 'Action', // Attack on Titan S2
  35760: 'Action', // Attack on Titan S3
  38524: 'Action', // Attack on Titan S3 Part 2
  40028: 'Action', // Attack on Titan Final Season
  44511: 'Action', // Chainsaw Man
  20: 'Action', // Naruto
  1735: 'Action', // Naruto: Shippuden
  269: 'Action', // Bleach
  41467: 'Action', // Bleach: Thousand-Year Blood War
  31964: 'Action', // My Hero Academia
  30276: 'Action', // One-Punch Man
  52588: 'Action', // Kaiju No. 8
  55830: 'Action', // Sakamoto Days
  59192: 'Action', // Dandadan -> supernatural battle, let's check Supernatural vs Action below
  34572: 'Action', // Black Clover
  6702: 'Action', // Fairy Tail
  813: 'Action', // Dragon Ball Z
  30694: 'Action', // Dragon Ball Super

  // Adventure (central world exploration, grand quest, uncharted journey)
  21: 'Adventure', // One Piece
  11061: 'Adventure', // Hunter x Hunter (2011)
  136: 'Adventure', // Hunter x Hunter (1999)
  5114: 'Adventure', // Fullmetal Alchemist: Brotherhood
  121: 'Adventure', // Fullmetal Alchemist
  34599: 'Adventure', // Made in Abyss
  41084: 'Adventure', // Made in Abyss S2
  14719: 'Adventure', // JoJo's Bizarre Adventure
  20899: 'Adventure', // JoJo's Stardust Crusaders
  31933: 'Adventure', // JoJo's Diamond is Unbreakable
  37991: 'Adventure', // JoJo's Golden Wind
  40834: 'Adventure', // Ranking of Kings

  // Fantasy (high fantasy worlds, magic, reincarnation / dungeon fantasy)
  52991: 'Fantasy', // Frieren: Beyond Journey's End
  39535: 'Fantasy', // Mushoku Tensei: Jobless Reincarnation
  45576: 'Fantasy', // Mushoku Tensei Part 2
  31240: 'Fantasy', // Re:Zero -Starting Life in Another World-
  37430: 'Fantasy', // That Time I Got Reincarnated as a Slime
  29803: 'Fantasy', // Overlord
  52701: 'Fantasy', // Delicious in Dungeon (Dungeon Meshi)
  35790: 'Fantasy', // The Rising of the Shield Hero
  11757: 'Fantasy', // Sword Art Online
  199: 'Fantasy', // Spirited Away
  431: 'Fantasy', // Howl's Moving Castle
  164: 'Fantasy', // Princess Mononoke
  33352: 'Drama', // Violet Evergarden

  // Romance (central romantic relationship / romantic comedy)
  37999: 'Romance', // Kaguya-sama: Love Is War
  40591: 'Romance', // Kaguya-sama: Love Is War? S2
  43608: 'Romance', // Kaguya-sama: Ultra Romantic
  23273: 'Romance', // Your Lie in April
  42897: 'Romance', // Horimiya
  38680: 'Romance', // Fruits Basket (2019)
  4224: 'Romance', // Toradora!
  48736: 'Romance', // My Dress-Up Darling
  52578: 'Romance', // The Dangers in My Heart
  32281: 'Romance', // Your Name. (Kimi no Na wa.)
  38826: 'Romance', // Weathering With You
  2167: 'Romance', // Clannad
  4181: 'Romance', // Clannad: After Story
  14813: 'Romance', // My Teen Romantic Comedy SNAFU
  37450: 'Romance', // Rascal Does Not Dream of Bunny Girl Senpai
  57181: 'Romance', // Blue Box (Ao no Hako)
  54857: 'Romance', // Alya Sometimes Hides Her Feelings in Russian

  // Sports (athletic competition & team rivalry)
  20583: 'Sports', // Haikyu!!
  28891: 'Sports', // Haikyu!! Second Season
  32935: 'Sports', // Haikyu!! S3
  38883: 'Sports', // Haikyu!! To the Top
  49596: 'Sports', // Blue Lock
  170: 'Sports', // Slam Dunk
  11771: 'Sports', // Kuroko's Basketball
  263: 'Sports', // Hajime no Ippo
  37965: 'Sports', // Run with the Wind
  42893: 'Sports', // SK8 the Infinity
  32995: 'Sports', // Yuri!!! on Ice
  31646: 'Drama', // March Comes in Like a Lion

  // Psychological (mind games, ideological cat-and-mouse, manipulation)
  1535: 'Psychological', // Death Note
  35507: 'Psychological', // Classroom of the Elite
  51096: 'Psychological', // Classroom of the Elite S2
  34933: 'Psychological', // Kakegurui
  323: 'Psychological', // Paranoia Agent
  437: 'Psychological', // Perfect Blue
  339: 'Psychological', // Serial Experiments Lain
  28223: 'Psychological', // Death Parade
  50273: 'Psychological', // Tomodachi Game

  // Thriller (relentless suspense, survival pursuit, high-stakes conspiracy)
  19: 'Thriller', // Monster
  37779: 'Thriller', // The Promised Neverland
  47194: 'Thriller', // Summertime Rendering
  23321: 'Thriller', // Terror in Resonance
  790: 'Thriller', // Kaiji: Ultimate Survivor

  // Mystery (whodunit, investigation, puzzle solving, court/palace deductions)
  31043: 'Mystery', // Erased (Boku dake ga Inai Machi)
  54492: 'Mystery', // The Apothecary Diaries (Kusuriya no Hitorigoto)
  12189: 'Mystery', // Hyouka
  46102: 'Mystery', // Odd Taxi
  235: 'Mystery', // Detective Conan
  31478: 'Mystery', // Bungo Stray Dogs
  53446: 'Mystery', // Pluto -> Sci-Fi Mystery, let's classify Mystery

  // Sci-Fi (time travel, cyberpunk, space opera, scientific rebuilding)
  9253: 'Sci-Fi', // Steins;Gate
  30484: 'Sci-Fi', // Steins;Gate 0
  42310: 'Sci-Fi', // Cyberpunk: Edgerunners
  1: 'Sci-Fi', // Cowboy Bebop
  13601: 'Sci-Fi', // Psycho-Pass
  38691: 'Sci-Fi', // Dr. Stone
  46095: 'Sci-Fi', // Vivy: Fluorite Eye's Song
  43: 'Sci-Fi', // Ghost in the Shell
  47: 'Sci-Fi', // Akira
  820: 'Sci-Fi', // Legend of the Galactic Heroes
  6: 'Sci-Fi', // Trigun

  // Mecha (piloted giant robots / tactical frames central to plot)
  30: 'Mecha', // Neon Genesis Evangelion
  32: 'Mecha', // The End of Evangelion
  1575: 'Mecha', // Code Geass: Lelouch of the Rebellion
  2904: 'Mecha', // Code Geass R2
  41457: 'Mecha', // 86 Eighty-Six
  48569: 'Mecha', // 86 Part 2
  2001: 'Mecha', // Tengen Toppa Gurren Lagann
  31251: 'Mecha', // Mobile Suit Gundam: Iron-Blooded Orphans
  49828: 'Mecha', // Mobile Suit Gundam: The Witch from Mercury
  35849: 'Mecha', // Darling in the FranXX

  // Comedy (gag, parody, comedic slice-of-chaos)
  50265: 'Comedy', // Spy x Family
  50602: 'Comedy', // Spy x Family Part 2
  918: 'Comedy', // Gintama
  30831: 'Comedy', // KonoSuba
  33255: 'Comedy', // The Disastrous Life of Saiki K.
  10165: 'Comedy', // Nichijou
  37105: 'Comedy', // Grand Blue
  52211: 'Comedy', // Mashle: Magic and Muscles
  245: 'Comedy', // Great Teacher Onizuka

  // Drama (emotional healing, grief, human tragedy & resilience)
  28851: 'Drama', // A Silent Voice (Koe no Katachi)
  52034: 'Drama', // Oshi no Ko
  41025: 'Drama', // To Your Eternity
  578: 'Drama', // Grave of the Fireflies
  9989: 'Drama', // Anohana: The Flower We Saw That Day
  28735: 'Drama', // Showa Genroku Rakugo Shinju
  36098: 'Drama', // I Want to Eat Your Pancreas

  // Horror (visceral dread, curses, ghouls, body horror)
  22319: 'Horror', // Tokyo Ghoul
  22535: 'Horror', // Parasyte: The Maxim
  11111: 'Horror', // Another
  934: 'Horror', // Higurashi When They Cry
  7724: 'Horror', // Shiki
  38759: 'Horror', // Junji Ito / Uzumaki

  // Supernatural (spirits, exorcisms, occult phenomena, psychic slice/action)
  32182: 'Supernatural', // Mob Psycho 100
  37510: 'Supernatural', // Mob Psycho 100 II
  50172: 'Supernatural', // Mob Psycho 100 III
  5081: 'Supernatural', // Bakemonogatari
  20507: 'Supernatural', // Noragami
  3588: 'Supernatural', // Soul Eater
  39534: 'Supernatural', // Toilet-bound Hanako-kun
  4898: 'Supernatural', // Black Butler
  57334: 'Supernatural', // Dandadan

  // Slice of Life (everyday serenity, gentle routine, pastoral healing)
  34798: 'Slice of Life', // Laid-Back Camp (Yuru Camp)
  457: 'Slice of Life', // Mushishi
  4081: 'Slice of Life', // Natsume's Book of Friends
  17549: 'Slice of Life', // Non Non Biyori
  52347: 'Slice of Life', // Skip and Loafer

  // Music (bands, classical performance, songwriting at heart of plot)
  47917: 'Music', // Bocchi the Rock!
  5680: 'Music', // K-On!
  877: 'Music', // Nana
  57: 'Music', // Beck: Mongolian Chop Squad
  39533: 'Music', // Given
  12531: 'Music', // Kids on the Slope

  // Historical (real-world historical eras: Viking age, Warring States, Meiji/Edo)
  37521: 'Historical', // Vinland Saga
  49387: 'Historical', // Vinland Saga Season 2
  12031: 'Historical', // Kingdom
  36028: 'Historical', // Golden Kamuy
  45: 'Historical', // Rurouni Kenshin
  205: 'Historical', // Samurai Champloo
  37520: 'Historical', // Dororo

  // Family (parenting, child-raising, wholesome household bonds)
  22789: 'Family', // Barakamon
  12355: 'Family', // Wolf Children
  10162: 'Family', // Usagi Drop
  32828: 'Family', // Sweetness & Lightning
  51403: 'Family', // Buddy Daddies
  49909: 'Family', // Kotaro Lives Alone
  523: 'Family', // My Neighbor Totoro
};

const TITLE_OVERRIDES: { pattern: RegExp; category: KagePrimaryCategory }[] = [
  { pattern: /\bsolo leveling\b|\bore dake level up\b/i, category: 'Action' },
  { pattern: /\bkaguya[- ]sama\b/i, category: 'Romance' },
  { pattern: /\bhaikyu+\b|\bblue lock\b|\bslam dunk\b|\bkuroko\b|\bhajime no ippo\b|\bace of diamond\b|\bbaki\b/i, category: 'Sports' },
  { pattern: /\bfrieren\b|\bsousou no frieren\b|\bmushoku tensei\b|\bdungeon meshi\b|\bdelicious in dungeon\b|\bre:zero\b/i, category: 'Fantasy' },
  { pattern: /\bdeath note\b|\bclassroom of the elite\b|\byoukoso jitsuryoku\b|\bkakegurui\b|\btomodachi game\b/i, category: 'Psychological' },
  { pattern: /\bapothecary diaries\b|\bkusuriya no hitorigoto\b|\bdetective conan\b|\bcase closed\b|\bhyouka\b|\bodd taxi\b|\berased\b|\bboku dake ga inai machi\b/i, category: 'Mystery' },
  { pattern: /\bsteins;?gate\b|\bedgerunners\b|\bcowboy bebop\b|\bpsycho[- ]pass\b|\bdr\.?\s*stone\b/i, category: 'Sci-Fi' },
  { pattern: /\bevangelion\b|\bcode geass\b|\bgundam\b|\bgurren lagann\b|\beighty[- ]six\b|\b86\b/i, category: 'Mecha' },
  { pattern: /\bvinland saga\b|\bkingdom\b|\bgolden kamuy\b|\brurouni kenshin\b|\bsamurai champloo\b/i, category: 'Historical' },
  { pattern: /\bbocchi the rock\b|\bk-on!\b|\bbeck\b|\bgiven\b|\bhibike! euphonium\b|\bsound! euphonium\b/i, category: 'Music' },
  { pattern: /\bbarakamon\b|\bwolf children\b|\bkotaro lives alone\b|\bsweetness & lightning\b|\bbuddy daddies\b|\bmy neighbor totoro\b/i, category: 'Family' },
  { pattern: /\bspy\s*x\s*family\b|\bgintama\b|\bkonosuba\b|\bsaiki k\b|\bnichijou\b|\bgrand blue\b|\bmashle\b/i, category: 'Comedy' },
  { pattern: /\bviolet evergarden\b|\bsilent voice\b|\bkoe no katachi\b|\bmarch comes in like a lion\b|\b3-gatsu no lion\b|\boshi no ko\b|\banohana\b/i, category: 'Drama' },
  { pattern: /\byour lie in april\b|\bshigatsu wa kimi no uso\b|\bhorimiya\b|\bfruits basket\b|\btoradora\b|\bdress-up darling\b|\bdangers in my heart\b|\byour name\b|\bkimi no na wa\b|\bclannad\b|\bblue box\b|\bao no hako\b/i, category: 'Romance' },
  { pattern: /\bone piece\b|\bhunter x hunter\b|\bfullmetal alchemist\b|\bmade in abyss\b|\bjojo\b/i, category: 'Adventure' },
  { pattern: /\btokyo ghoul\b|\bparasyte\b|\bkiseijuu\b|\bhigurashi\b|\banother\b|\buzumaki\b|\bshiki\b/i, category: 'Horror' },
  { pattern: /\bpromised neverland\b|\byakusoku no neverland\b|\bsummertime render/i, category: 'Thriller' },
  { pattern: /\bmob psycho\b|\bmonogatari\b|\bnoragami\b|\bdandadan\b|\bhanako-kun\b/i, category: 'Supernatural' },
  { pattern: /\byuru camp\b|\blaid-back camp\b|\bmushishi\b|\bnatsume\b|\bnon non biyori\b/i, category: 'Slice of Life' },
  { pattern: /\bdemon slayer\b|\bkimetsu no yaiba\b|\bjujutsu kaisen\b|\battack on titan\b|\bshingeki no kyojin\b|\bnaruto\b|\bbleach\b|\bchainsaw man\b|\bmy hero academia\b|\bboku no hero\b|\bone-punch man\b|\bkaiju no\.?\s*8\b/i, category: 'Action' },
];

export function resolvePrimaryAnimeCategory(input: {
  malId?: number | null;
  title?: string | null;
  englishTitle?: string | null;
  romajiTitle?: string | null;
  genres?: string[];
  tags?: { name: string; rank?: number }[];
  synopsis?: string | null;
}): KagePrimaryCategory {
  if (input.malId && VERIFIED_PRIMARY_BY_MAL_ID[input.malId]) {
    return VERIFIED_PRIMARY_BY_MAL_ID[input.malId];
  }

  const combinedTitle = [input.englishTitle, input.title, input.romajiTitle]
    .filter(Boolean)
    .join(' | ');
  for (const rule of TITLE_OVERRIDES) {
    if (rule.pattern.test(combinedTitle)) {
      return rule.category;
    }
  }

  const gSet = new Set((input.genres || []).map((g) => g.trim().toLowerCase()));
  const highTags = (input.tags || []).filter((t) => (t.rank ?? 70) >= 60);
  const tNames = new Set(highTags.map((t) => t.name.trim().toLowerCase()));

  // Specific thematic genres that strongly define an anime's central identity when present:
  if (gSet.has('sports')) return 'Sports';
  if (gSet.has('mecha') || tNames.has('real robot') || tNames.has('super robot')) return 'Mecha';
  if (gSet.has('music') && !gSet.has('action')) return 'Music';

  // Family & Parenting central themes (includes AniList's canonical 'Family Life' tag)
  if (
    (tNames.has('family life') ||
      tNames.has('parenting') ||
      tNames.has('childcare') ||
      tNames.has('found family')) &&
    (gSet.has('slice of life') || gSet.has('comedy') || gSet.has('drama')) &&
    !gSet.has('action') &&
    !gSet.has('horror')
  ) {
    return 'Family';
  }

  // Historical central era narratives (when not modern urban fantasy or futuristic sci-fi)
  if (
    (tNames.has('historical') || gSet.has('historical')) &&
    !gSet.has('sci-fi') &&
    !tNames.has('urban fantasy') &&
    (tNames.has('samurai') ||
      tNames.has('vikings') ||
      tNames.has('war') ||
      tNames.has('swordplay') ||
      !gSet.has('supernatural'))
  ) {
    return 'Historical';
  }

  if (gSet.has('horror') && !gSet.has('comedy')) return 'Horror';
  if (
    gSet.has('psychological') &&
    (gSet.has('thriller') || gSet.has('suspense') || !gSet.has('action'))
  ) {
    return 'Psychological';
  }
  if ((gSet.has('thriller') || gSet.has('suspense')) && !gSet.has('comedy')) {
    return 'Thriller';
  }
  if (gSet.has('mystery') && !gSet.has('action')) return 'Mystery';
  if (gSet.has('sci-fi') && !gSet.has('fantasy')) return 'Sci-Fi';

  // Romance vs Comedy vs Slice of Life
  if (gSet.has('romance') && !gSet.has('action') && !gSet.has('adventure')) {
    return 'Romance';
  }

  // Action vs Fantasy vs Adventure
  if (gSet.has('action')) {
    if (tNames.has('isekai') && gSet.has('fantasy') && !tNames.has('shounen')) {
      return 'Fantasy';
    }
    return 'Action';
  }

  if (gSet.has('fantasy')) return 'Fantasy';
  if (gSet.has('adventure')) return 'Adventure';
  if (gSet.has('romance')) return 'Romance';
  if (gSet.has('mystery')) return 'Mystery';
  if (gSet.has('sci-fi')) return 'Sci-Fi';
  if (gSet.has('supernatural')) return 'Supernatural';
  if (gSet.has('music')) return 'Music';
  if (gSet.has('horror')) return 'Horror';
  if (gSet.has('psychological')) return 'Psychological';
  if (gSet.has('thriller') || gSet.has('suspense')) return 'Thriller';
  if (tNames.has('historical') || gSet.has('historical')) return 'Historical';
  if (tNames.has('family life') || tNames.has('parenting') || tNames.has('childcare')) return 'Family';
  if (gSet.has('comedy') && !gSet.has('drama')) return 'Comedy';
  if (gSet.has('slice of life') && !gSet.has('drama')) return 'Slice of Life';
  if (gSet.has('drama')) return 'Drama';
  if (gSet.has('comedy')) return 'Comedy';
  if (gSet.has('slice of life')) return 'Slice of Life';

  for (const cat of KAGE_PRIMARY_CATEGORIES) {
    const low = cat.toLowerCase();
    if (gSet.has(low) || tNames.has(low)) return cat;
  }

  return 'Action';
}

export async function auditAndRepairAnimeCatalogCategories(): Promise<{
  totalAudited: number;
  updatedCount: number;
  duplicatesRemoved: number;
  distribution: Record<string, number>;
}> {
  const rows = await db.select().from(animeCatalog);
  if (rows.length === 0) {
    return { totalAudited: 0, updatedCount: 0, duplicatesRemoved: 0, distribution: {} };
  }

  // 1. Identify and remove exact duplicate records caused by alternate provider IDs / normalizedTitle+year+format collisions
  const seenKeys = new Map<string, typeof rows[number]>();
  const duplicateIds: number[] = [];

  // Sort so records with malId & higher popularity win canonical deduplication
  const sorted = [...rows].sort((a, b) => {
    const aHasMal = a.malId ? 1 : 0;
    const bHasMal = b.malId ? 1 : 0;
    if (aHasMal !== bHasMal) return bHasMal - aHasMal;
    return (b.popularity || 0) - (a.popularity || 0);
  });

  for (const r of sorted) {
    const malKey = r.malId ? `mal:${r.malId}` : null;
    const titleKey = `norm:${r.normalizedTitle}:${r.releaseYear || 0}:${r.format || 'TV'}`;
    if ((malKey && seenKeys.has(malKey)) || seenKeys.has(titleKey)) {
      duplicateIds.push(r.id);
      continue;
    }
    if (malKey) seenKeys.set(malKey, r);
    seenKeys.set(titleKey, r);
  }

  if (duplicateIds.length > 0) {
    for (const dupId of duplicateIds) {
      await db.delete(animeCatalog).where(eq(animeCatalog.id, dupId));
    }
  }

  const cleanRows = sorted.filter((r) => !duplicateIds.includes(r.id));
  const [genreLinks, tagLinks] = await Promise.all([
    db
      .select({
        animeId: animeCatalogGenres.animeId,
        name: animeGenres.name,
      })
      .from(animeCatalogGenres)
      .innerJoin(animeGenres, eq(animeCatalogGenres.genreId, animeGenres.id)),
    db
      .select({
        animeId: animeCatalogTags.animeId,
        name: animeTags.name,
        rank: animeCatalogTags.rank,
      })
      .from(animeCatalogTags)
      .innerJoin(animeTags, eq(animeCatalogTags.tagId, animeTags.id)),
  ]);

  const gMap = new Map<number, string[]>();
  for (const gl of genreLinks) {
    const arr = gMap.get(gl.animeId) || [];
    arr.push(gl.name);
    gMap.set(gl.animeId, arr);
  }
  const tMap = new Map<number, { name: string; rank: number }[]>();
  for (const tl of tagLinks) {
    const arr = tMap.get(tl.animeId) || [];
    arr.push({ name: tl.name, rank: tl.rank });
    tMap.set(tl.animeId, arr);
  }

  let updatedCount = 0;
  const distribution: Record<string, number> = {};

  for (const row of cleanRows) {
    const primary = resolvePrimaryAnimeCategory({
      malId: row.malId,
      englishTitle: row.titleEnglish,
      romajiTitle: row.titleRomaji,
      genres: gMap.get(row.id) || [],
      tags: tMap.get(row.id) || [],
      synopsis: row.synopsis,
    });
    distribution[primary] = (distribution[primary] || 0) + 1;

    if (row.primaryCategory !== primary) {
      await db
        .update(animeCatalog)
        .set({ primaryCategory: primary })
        .where(eq(animeCatalog.id, row.id));
      updatedCount++;
    }
  }

  // Ensure every primary category name also exists in anime_genres for clean joins
  for (const cat of KAGE_PRIMARY_CATEGORIES) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await db
      .insert(animeGenres)
      .values({ name: cat, slug })
      .onConflictDoNothing();
  }

  return {
    totalAudited: cleanRows.length,
    updatedCount,
    duplicatesRemoved: duplicateIds.length,
    distribution,
  };
}

export async function getPrimaryCategoryStats() {
  const rows = await db
    .select({
      category: animeCatalog.primaryCategory,
      count: sql<number>`count(*)::int`,
    })
    .from(animeCatalog)
    .where(sql`${animeCatalog.primaryCategory} IS NOT NULL`)
    .groupBy(animeCatalog.primaryCategory);
  return rows;
}
