export type KageStickerCategory =
  | 'Emotions'
  | 'Reactions'
  | 'Celebration'
  | 'Surprise'
  | 'Approval'
  | 'Disappointment'
  | 'Shadow & Aura';

export interface KageSticker {
  id: string;
  name: string;
  category: KageStickerCategory;
  keywords: string[];
  accent: string;
  glow: string;
  label: string;
  svg: string;
}

export interface KageGiftItem {
  id: string;
  name: string;
  subtitle: string;
  rarity: 'starter' | 'rare' | 'epic' | 'mythic';
  minLevel: number;
  accent: string;
  svg: string;
}

export interface KageConversationTheme {
  id: string;
  name: string;
  subtitle: string;
  accentHex: string;
  headerBg: string;
  myBubbleClass: string;
  peerBubbleClass: string;
  surfaceTint: string;
}

export const KAGE_STICKER_CATEGORIES: KageStickerCategory[] = [
  'Emotions',
  'Reactions',
  'Celebration',
  'Surprise',
  'Approval',
  'Disappointment',
  'Shadow & Aura',
];

function wrapChibiBadge(params: {
  bg1: string;
  bg2: string;
  ring: string;
  inner: string;
  caption: string;
  captionBg?: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
    <defs>
      <linearGradient id="g_${params.caption.replace(/[^a-zA-Z0-9]/g, '')}" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${params.bg1}"/>
        <stop offset="100%" stop-color="${params.bg2}"/>
      </linearGradient>
    </defs>
    <rect x="8" y="8" width="104" height="104" rx="26" fill="url(#g_${params.caption.replace(/[^a-zA-Z0-9]/g, '')})" stroke="${params.ring}" stroke-width="2.5"/>
    <circle cx="60" cy="52" r="34" fill="#0B090F" fill-opacity="0.55" stroke="${params.ring}" stroke-opacity="0.4" stroke-width="1.5"/>
    ${params.inner}
    <rect x="16" y="88" width="88" height="20" rx="10" fill="${params.captionBg || '#09080B'}" stroke="${params.ring}" stroke-width="1.4"/>
    <text x="60" y="101.5" text-anchor="middle" fill="#F5F1F2" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="10.5" letter-spacing="0.9">${params.caption}</text>
  </svg>`;
}

export const KAGE_STICKERS: KageSticker[] = [
  // EMOTIONS
  {
    id: 'kage_joy_spark',
    name: 'Radiant Joy',
    category: 'Emotions',
    keywords: ['happy', 'smile', 'joy', 'grin', 'cute', 'warm'],
    accent: '#F59E0B',
    glow: 'rgba(245,158,11,0.28)',
    label: 'SO GOOD!',
    svg: wrapChibiBadge({
      bg1: '#3B1D0A',
      bg2: '#141116',
      ring: '#F59E0B',
      caption: 'RADIANT!',
      inner: `
        <path d="M40 48 Q46 40 52 48" stroke="#FCD34D" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M68 48 Q74 40 80 48" stroke="#FCD34D" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="38" cy="56" r="4.5" fill="#F43F5E" fill-opacity="0.65"/>
        <circle cx="82" cy="56" r="4.5" fill="#F43F5E" fill-opacity="0.65"/>
        <path d="M48 58 Q60 72 72 58 Z" fill="#FB7185" stroke="#FDE68A" stroke-width="2"/>
        <path d="M28 28 L31 35 L38 38 L31 41 L28 48 L25 41 L18 38 L25 35 Z" fill="#FBBF24"/>
        <path d="M92 26 L94 31 L99 33 L94 35 L92 40 L90 35 L85 33 L90 31 Z" fill="#FDE68A"/>
      `,
    }),
  },
  {
    id: 'kage_starry_eyes',
    name: 'Starstruck',
    category: 'Emotions',
    keywords: ['love', 'heart', 'star', 'adore', 'favourite', 'wholesome'],
    accent: '#EC4899',
    glow: 'rgba(236,72,153,0.28)',
    label: 'PEAK!',
    svg: wrapChibiBadge({
      bg1: '#3B0D28',
      bg2: '#141116',
      ring: '#EC4899',
      caption: 'OBSESSING',
      inner: `
        <path d="M45 38 L47.5 44 L54 44.5 L49 49 L50.5 55.5 L45 52 L39.5 55.5 L41 49 L36 44.5 L42.5 44 Z" fill="#F472B6"/>
        <path d="M75 38 L77.5 44 L84 44.5 L79 49 L80.5 55.5 L75 52 L69.5 55.5 L71 49 L66 44.5 L72.5 44 Z" fill="#F472B6"/>
        <path d="M52 63 Q60 71 68 63" stroke="#F9A8D4" stroke-width="3" stroke-linecap="round"/>
        <path d="M60 28 C57 23 50 25 50 30 C50 35 60 40 60 40 C60 40 70 35 70 30 C70 25 63 23 60 28 Z" fill="#FB7185"/>
      `,
    }),
  },
  {
    id: 'kage_tears_emotion',
    name: 'Masterpiece Tears',
    category: 'Emotions',
    keywords: ['cry', 'tears', 'emotional', 'sad', 'beautiful', 'cinema'],
    accent: '#38BDF8',
    glow: 'rgba(56,189,248,0.28)',
    label: 'IM CRYING',
    svg: wrapChibiBadge({
      bg1: '#0C2942',
      bg2: '#141116',
      ring: '#38BDF8',
      caption: 'EMOTIONAL',
      inner: `
        <circle cx="46" cy="47" r="5.5" fill="#E0F2FE"/>
        <circle cx="74" cy="47" r="5.5" fill="#E0F2FE"/>
        <path d="M44 53 Q42 68 45 76" stroke="#38BDF8" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M76 53 Q78 68 75 76" stroke="#38BDF8" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M53 64 Q60 59 67 64" stroke="#BAE6FD" stroke-width="2.8" stroke-linecap="round"/>
      `,
    }),
  },
  {
    id: 'kage_smug_grin',
    name: 'Calculated Smirk',
    category: 'Emotions',
    keywords: ['smug', 'heh', 'plan', 'clever', 'genius', 'anya'],
    accent: '#A855F7',
    glow: 'rgba(168,85,247,0.28)',
    label: 'HEH.',
    svg: wrapChibiBadge({
      bg1: '#2A1046',
      bg2: '#141116',
      ring: '#A855F7',
      caption: 'HEH.',
      inner: `
        <path d="M38 43 L52 46" stroke="#E9D5FF" stroke-width="3" stroke-linecap="round"/>
        <path d="M82 41 L68 46" stroke="#E9D5FF" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="46" cy="50" rx="5" ry="3.2" fill="#C084FC"/>
        <ellipse cx="74" cy="50" rx="5" ry="3.2" fill="#C084FC"/>
        <path d="M49 63 Q62 68 73 57" stroke="#F3E8FF" stroke-width="3.2" stroke-linecap="round"/>
      `,
    }),
  },

  // REACTIONS
  {
    id: 'kage_sakuga_fire',
    name: 'Sakuga Blaze',
    category: 'Reactions',
    keywords: ['fire', 'sakuga', 'lit', 'animation', 'heat', 'goat'],
    accent: '#EF4444',
    glow: 'rgba(239,68,68,0.32)',
    label: 'SAKUGA!',
    svg: wrapChibiBadge({
      bg1: '#450A0A',
      bg2: '#141116',
      ring: '#EF4444',
      caption: 'SAKUGA FIRE',
      inner: `
        <path d="M60 22 C74 36 82 48 76 64 C72 74 62 79 52 77 C41 75 36 64 41 51 C44 44 50 47 50 40 C50 32 55 26 60 22 Z" fill="#EF4444"/>
        <path d="M60 38 C67 47 70 55 66 65 C63 71 55 73 51 67 C48 62 51 54 60 38 Z" fill="#FBBF24"/>
      `,
    }),
  },
  {
    id: 'kage_absolute_cinema',
    name: 'Absolute Cinema',
    category: 'Reactions',
    keywords: ['cinema', 'peak', 'masterpiece', '10/10', 'kino', 'climax'],
    accent: '#C0263D',
    glow: 'rgba(192,38,61,0.32)',
    label: 'PEAK FICTION',
    svg: wrapChibiBadge({
      bg1: '#3B0A18',
      bg2: '#141116',
      ring: '#C0263D',
      caption: 'PEAK FICTION',
      inner: `
        <rect x="36" y="34" width="48" height="34" rx="5" fill="#1F1924" stroke="#FB7185" stroke-width="2.2"/>
        <polygon points="55,44 55,58 68,51" fill="#F43F5E"/>
        <path d="M36 41 H84" stroke="#FB7185" stroke-width="1.5" stroke-dasharray="4 3"/>
      `,
    }),
  },
  {
    id: 'kage_spoiler_shield',
    name: 'No Spoilers!',
    category: 'Reactions',
    keywords: ['spoiler', 'shh', 'quiet', 'stop', 'manga', 'shield'],
    accent: '#6D28D9',
    glow: 'rgba(109,40,217,0.3)',
    label: 'NO SPOILERS',
    svg: wrapChibiBadge({
      bg1: '#241046',
      bg2: '#141116',
      ring: '#8B5CF6',
      caption: 'NO SPOILERS',
      inner: `
        <path d="M60 26 L82 35 V52 C82 66 72 75 60 80 C48 75 38 66 38 52 V35 L60 26 Z" fill="#4C1D95" stroke="#C4B5FD" stroke-width="2.4"/>
        <path d="M51 44 L69 62 M69 44 L51 62" stroke="#F5F1F2" stroke-width="3.5" stroke-linecap="round"/>
      `,
    }),
  },
  {
    id: 'kage_popcorn_binge',
    name: 'Binge Mode',
    category: 'Reactions',
    keywords: ['binge', 'watch', 'popcorn', 'next episode', 'marathon'],
    accent: '#F97316',
    glow: 'rgba(249,115,22,0.28)',
    label: 'BINGE MODE',
    svg: wrapChibiBadge({
      bg1: '#3E1B08',
      bg2: '#141116',
      ring: '#F97316',
      caption: 'ONE MORE EP',
      inner: `
        <circle cx="49" cy="40" r="7" fill="#FDE68A"/>
        <circle cx="60" cy="36" r="8" fill="#FEF3C7"/>
        <circle cx="71" cy="40" r="7" fill="#FDE68A"/>
        <polygon points="44,44 76,44 71,76 49,76" fill="#DC2626" stroke="#FDBA74" stroke-width="2"/>
        <line x1="54" y1="45" x2="55" y2="75" stroke="#FEF2F2" stroke-width="3"/>
        <line x1="66" y1="45" x2="65" y2="75" stroke="#FEF2F2" stroke-width="3"/>
      `,
    }),
  },

  // CELEBRATION
  {
    id: 'kage_victory_crown',
    name: 'S-Rank Victory',
    category: 'Celebration',
    keywords: ['win', 'crown', 'gg', 'congrats', 'level up', 'champion'],
    accent: '#EAB308',
    glow: 'rgba(234,179,8,0.3)',
    label: 'S-RANK GG',
    svg: wrapChibiBadge({
      bg1: '#3B2F08',
      bg2: '#141116',
      ring: '#EAB308',
      caption: 'S-RANK WIN',
      inner: `
        <polygon points="36,66 40,40 53,52 60,33 67,52 80,40 84,66" fill="#FACC15" stroke="#FEF08A" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="60" cy="56" r="4" fill="#DC2626"/>
        <rect x="38" y="68" width="44" height="6" rx="3" fill="#CA8A04"/>
      `,
    }),
  },
  {
    id: 'kage_guild_cheers',
    name: 'Guild Salute',
    category: 'Celebration',
    keywords: ['cheers', 'party', 'celebrate', 'welcome', 'guild', 'toast'],
    accent: '#10B981',
    glow: 'rgba(16,185,129,0.28)',
    label: 'SALUTE!',
    svg: wrapChibiBadge({
      bg1: '#073324',
      bg2: '#141116',
      ring: '#10B981',
      caption: 'SALUTE!',
      inner: `
        <path d="M44 70 L58 34 L64 38 L50 74 Z" fill="#6EE7B7"/>
        <path d="M76 70 L62 34 L56 38 L70 74 Z" fill="#34D399"/>
        <circle cx="60" cy="30" r="5" fill="#FDE68A"/>
      `,
    }),
  },
  {
    id: 'kage_hype_lightning',
    name: 'Thunder Clap',
    category: 'Celebration',
    keywords: ['thunder', 'zenitsu', 'fast', 'hype', 'electric', 'flash'],
    accent: '#FACC15',
    glow: 'rgba(250,204,21,0.34)',
    label: 'THUNDER!',
    svg: wrapChibiBadge({
      bg1: '#3D2B05',
      bg2: '#141116',
      ring: '#FACC15',
      caption: 'GODSPEED!',
      inner: `
        <polygon points="65,23 42,54 57,54 52,79 78,46 62,46" fill="#FDE047" stroke="#FFFBEB" stroke-width="2" stroke-linejoin="round"/>
      `,
    }),
  },
  {
    id: 'kage_festival_lantern',
    name: 'Matsuri Glow',
    category: 'Celebration',
    keywords: ['festival', 'matsuri', 'celebrate', 'confetti', 'season'],
    accent: '#FB7185',
    glow: 'rgba(251,113,133,0.3)',
    label: 'MATSURI!',
    svg: wrapChibiBadge({
      bg1: '#3F0E1E',
      bg2: '#141116',
      ring: '#FB7185',
      caption: 'LET’S GO!',
      inner: `
        <ellipse cx="60" cy="52" rx="18" ry="22" fill="#E11D48" stroke="#FDA4AF" stroke-width="2.2"/>
        <rect x="52" y="27" width="16" height="5" rx="2" fill="#FBBF24"/>
        <rect x="52" y="72" width="16" height="5" rx="2" fill="#FBBF24"/>
        <path d="M43 52 H77" stroke="#FECDD3" stroke-width="2"/>
      `,
    }),
  },

  // SURPRISE
  {
    id: 'kage_nani_shock',
    name: 'Nani?!',
    category: 'Surprise',
    keywords: ['nani', 'what', 'shock', 'plot twist', 'gasp', 'omg'],
    accent: '#EF4444',
    glow: 'rgba(239,68,68,0.32)',
    label: 'NANI?!',
    svg: wrapChibiBadge({
      bg1: '#420B16',
      bg2: '#141116',
      ring: '#F87171',
      caption: 'NANI?!',
      inner: `
        <circle cx="46" cy="47" r="7.5" fill="#FFF" stroke="#141116" stroke-width="2"/>
        <circle cx="46" cy="47" r="2.5" fill="#141116"/>
        <circle cx="74" cy="47" r="7.5" fill="#FFF" stroke="#141116" stroke-width="2"/>
        <circle cx="74" cy="47" r="2.5" fill="#141116"/>
        <ellipse cx="60" cy="65" rx="8" ry="10" fill="#FB7185" stroke="#FFF" stroke-width="2"/>
        <path d="M26 30 L34 38 M94 30 L86 38" stroke="#FCA5A5" stroke-width="3" stroke-linecap="round"/>
      `,
    }),
  },
  {
    id: 'kage_cliffhanger',
    name: 'Cliffhanger Pain',
    category: 'Surprise',
    keywords: ['cliffhanger', 'wait', 'shocked', 'twist', 'mindblown'],
    accent: '#06B6D4',
    glow: 'rgba(6,182,212,0.3)',
    label: 'PLOT TWIST',
    svg: wrapChibiBadge({
      bg1: '#082F3E',
      bg2: '#141116',
      ring: '#22D3EE',
      caption: 'PLOT TWIST!',
      inner: `
        <polygon points="60,24 66,40 84,36 72,50 84,64 66,60 60,76 54,60 36,64 48,50 36,36 54,40" fill="#0891B2" stroke="#A5F3FC" stroke-width="2"/>
        <text x="60" y="56" text-anchor="middle" fill="#ECFEFF" font-family="system-ui" font-weight="900" font-size="18">!?</text>
      `,
    }),
  },
  {
    id: 'kage_sweat_drop',
    name: 'Nervous Sweat',
    category: 'Surprise',
    keywords: ['sweat', 'awkward', 'uh oh', 'nervous', 'wait what'],
    accent: '#60A5FA',
    glow: 'rgba(96,165,250,0.28)',
    label: 'UH OH...',
    svg: wrapChibiBadge({
      bg1: '#102347',
      bg2: '#141116',
      ring: '#60A5FA',
      caption: 'WAIT A SEC',
      inner: `
        <line x1="40" y1="49" x2="52" y2="49" stroke="#DBEAFE" stroke-width="3.2" stroke-linecap="round"/>
        <line x1="64" y1="49" x2="76" y2="49" stroke="#DBEAFE" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M50 64 Q60 60 70 64" stroke="#93C5FD" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M84 30 C84 30 92 43 92 48 C92 52.5 88.5 56 84 56 C79.5 56 76 52.5 76 48 C76 43 84 30 84 30 Z" fill="#38BDF8" stroke="#E0F2FE" stroke-width="1.8"/>
      `,
    }),
  },
  {
    id: 'kage_goosebumps',
    name: 'Chills!',
    category: 'Surprise',
    keywords: ['chills', 'ost', 'goosebumps', 'epic', 'entrance'],
    accent: '#818CF8',
    glow: 'rgba(129,140,248,0.3)',
    label: 'CHILLS',
    svg: wrapChibiBadge({
      bg1: '#1A1B4B',
      bg2: '#141116',
      ring: '#818CF8',
      caption: 'PURE CHILLS',
      inner: `
        <circle cx="60" cy="52" r="22" stroke="#C7D2FE" stroke-width="2.5" stroke-dasharray="5 3"/>
        <circle cx="60" cy="52" r="11" fill="#6366F1"/>
        <path d="M60 24 V32 M60 72 V80 M32 52 H40 M80 52 H88" stroke="#E0E7FF" stroke-width="2.5" stroke-linecap="round"/>
      `,
    }),
  },

  // APPROVAL
  {
    id: 'kage_approved_stamp',
    name: 'Hunter Approved',
    category: 'Approval',
    keywords: ['approve', 'yes', 'agree', 'valid', 'based', 'w'],
    accent: '#22C55E',
    glow: 'rgba(34,197,94,0.28)',
    label: 'VALID TAKE',
    svg: wrapChibiBadge({
      bg1: '#0A361C',
      bg2: '#141116',
      ring: '#22C55E',
      caption: 'VALID TAKE',
      inner: `
        <circle cx="60" cy="51" r="22" fill="#14532D" stroke="#86EFAC" stroke-width="2.5"/>
        <path d="M49 51 L57 59 L72 43" stroke="#F0FDF4" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      `,
    }),
  },
  {
    id: 'kage_respect_bow',
    name: 'True Respect',
    category: 'Approval',
    keywords: ['respect', 'bow', 'sensei', 'cultured', 'salute', 'honour'],
    accent: '#D97706',
    glow: 'rgba(217,119,6,0.28)',
    label: 'CULTURED',
    svg: wrapChibiBadge({
      bg1: '#382107',
      bg2: '#141116',
      ring: '#F59E0B',
      caption: 'CULTURED',
      inner: `
        <path d="M60 30 L68 52 L60 72 L52 52 Z" fill="#F59E0B" stroke="#FEF3C7" stroke-width="2"/>
        <path d="M42 46 L52 52 L44 62" stroke="#FCD34D" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M78 46 L68 52 L76 62" stroke="#FCD34D" stroke-width="2.5" stroke-linecap="round"/>
      `,
    }),
  },
  {
    id: 'kage_ten_of_ten',
    name: '10 / 10 Masterwork',
    category: 'Approval',
    keywords: ['10/10', 'score', 'perfect', 'goat', 'masterwork'],
    accent: '#C0263D',
    glow: 'rgba(192,38,61,0.32)',
    label: '10 / 10',
    svg: wrapChibiBadge({
      bg1: '#3E0B18',
      bg2: '#141116',
      ring: '#F43F5E',
      caption: 'MASTERWORK',
      inner: `
        <text x="60" y="59" text-anchor="middle" fill="#FFE4E6" font-family="system-ui" font-weight="900" font-size="24">10/10</text>
      `,
    }),
  },
  {
    id: 'kage_chef_kiss',
    name: 'OST Perfection',
    category: 'Approval',
    keywords: ['music', 'ost', 'op', 'ed', 'banger', 'soundtrack'],
    accent: '#EC4899',
    glow: 'rgba(236,72,153,0.28)',
    label: 'OST BANGER',
    svg: wrapChibiBadge({
      bg1: '#390D2A',
      bg2: '#141116',
      ring: '#F472B6',
      caption: 'BANGER OST',
      inner: `
        <path d="M52 63 V37 L74 32 V58" stroke="#FBCFE8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="47" cy="64" r="6" fill="#F472B6"/>
        <circle cx="69" cy="59" r="6" fill="#F472B6"/>
      `,
    }),
  },

  // DISAPPOINTMENT
  {
    id: 'kage_filler_pain',
    name: 'Filler Arc Pain',
    category: 'Disappointment',
    keywords: ['filler', 'sigh', 'bored', 'skip', 'disappointed', 'bruh'],
    accent: '#94A3B8',
    glow: 'rgba(148,163,184,0.25)',
    label: 'BRUH...',
    svg: wrapChibiBadge({
      bg1: '#1E293B',
      bg2: '#141116',
      ring: '#94A3B8',
      caption: 'BRUH...',
      inner: `
        <line x1="39" y1="46" x2="53" y2="46" stroke="#CBD5E1" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="67" y1="46" x2="81" y2="46" stroke="#CBD5E1" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="48" y1="64" x2="72" y2="64" stroke="#94A3B8" stroke-width="3.2" stroke-linecap="round"/>
        <line x1="74" y1="30" x2="74" y2="40" stroke="#64748B" stroke-width="2"/>
        <line x1="80" y1="30" x2="80" y2="42" stroke="#64748B" stroke-width="2"/>
      `,
    }),
  },
  {
    id: 'kage_emotional_damage',
    name: 'Soul Crushed',
    category: 'Disappointment',
    keywords: ['pain', 'hurt', 'broken', 'why', 'tragedy', 'loss'],
    accent: '#64748B',
    glow: 'rgba(100,116,139,0.28)',
    label: 'PURE PAIN',
    svg: wrapChibiBadge({
      bg1: '#1F1B2E',
      bg2: '#141116',
      ring: '#818CF8',
      caption: 'PURE PAIN',
      inner: `
        <path d="M60 34 C54 26 40 30 40 42 C40 56 60 70 60 70 C60 70 80 56 80 42 C80 30 66 26 60 34 Z" fill="#312E81" stroke="#A5B4FC" stroke-width="2.2"/>
        <path d="M60 34 L55 46 L64 53 L57 69" stroke="#09080B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      `,
    }),
  },
  {
    id: 'kage_delayed_season',
    name: 'Waiting for S2',
    category: 'Disappointment',
    keywords: ['waiting', 'hiatus', 'season 2', 'years', 'skeleton', 'delay'],
    accent: '#78716C',
    glow: 'rgba(120,113,108,0.28)',
    label: 'STILL WAITING',
    svg: wrapChibiBadge({
      bg1: '#292524',
      bg2: '#141116',
      ring: '#A8A29E',
      caption: 'STILL WAITING',
      inner: `
        <polygon points="46,32 74,32 63,51 74,70 46,70 57,51" fill="#44403C" stroke="#E7E5E4" stroke-width="2.2" stroke-linejoin="round"/>
        <polygon points="50,67 70,67 60,57" fill="#FBBF24"/>
      `,
    }),
  },
  {
    id: 'kage_facepalm',
    name: 'Not Like This',
    category: 'Disappointment',
    keywords: ['facepalm', 'sigh', 'cringe', 'nooo', 'bad take'],
    accent: '#F43F5E',
    glow: 'rgba(244,63,94,0.24)',
    label: 'NO WAY...',
    svg: wrapChibiBadge({
      bg1: '#31101C',
      bg2: '#141116',
      ring: '#FB7185',
      caption: 'NOT LIKE THIS',
      inner: `
        <path d="M43 45 L53 53 M53 45 L43 53" stroke="#FDA4AF" stroke-width="3" stroke-linecap="round"/>
        <path d="M67 45 L77 53 M77 45 L67 53" stroke="#FDA4AF" stroke-width="3" stroke-linecap="round"/>
        <path d="M48 67 Q60 58 72 67" stroke="#FDA4AF" stroke-width="3" stroke-linecap="round"/>
      `,
    }),
  },

  // SHADOW & AURA
  {
    id: 'kage_arise_monarch',
    name: 'Shadow Arise',
    category: 'Shadow & Aura',
    keywords: ['arise', 'shadow', 'monarch', 'jinwoo', 'aura', 'solo'],
    accent: '#7C3AED',
    glow: 'rgba(124,58,237,0.38)',
    label: 'ARISE.',
    svg: wrapChibiBadge({
      bg1: '#1E0B3B',
      bg2: '#09080B',
      ring: '#8B5CF6',
      caption: 'ARISE.',
      inner: `
        <path d="M42 48 L55 52 L46 43 Z" fill="#A78BFA"/>
        <path d="M78 48 L65 52 L74 43 Z" fill="#A78BFA"/>
        <path d="M36 66 Q60 56 84 66" stroke="#7C3AED" stroke-width="3" stroke-linecap="round"/>
        <path d="M60 24 L65 37 L55 37 Z" fill="#C4B5FD"/>
      `,
    }),
  },
  {
    id: 'kage_crimson_domain',
    name: 'Domain Unsealed',
    category: 'Shadow & Aura',
    keywords: ['domain', 'expansion', 'crimson', 'kage', 'power', 'unsealed'],
    accent: '#C0263D',
    glow: 'rgba(192,38,61,0.38)',
    label: 'UNSEALED',
    svg: wrapChibiBadge({
      bg1: '#3D0814',
      bg2: '#09080B',
      ring: '#C0263D',
      caption: 'DOMAIN OPEN',
      inner: `
        <circle cx="60" cy="51" r="21" stroke="#F43F5E" stroke-width="2.5"/>
        <circle cx="60" cy="51" r="9" fill="#C0263D" stroke="#FFE4E6" stroke-width="2"/>
        <path d="M60 25 V77 M34 51 H86" stroke="#FB7185" stroke-width="1.6"/>
      `,
    }),
  },
  {
    id: 'kage_ultra_aura',
    name: 'Limit Breaker',
    category: 'Shadow & Aura',
    keywords: ['aura', 'limit', 'power up', 'awakening', 'form', 'ultra'],
    accent: '#38BDF8',
    glow: 'rgba(56,189,248,0.34)',
    label: 'AWAKENED',
    svg: wrapChibiBadge({
      bg1: '#0A2540',
      bg2: '#09080B',
      ring: '#38BDF8',
      caption: 'AWAKENED',
      inner: `
        <path d="M60 23 L70 46 L86 42 L73 59 L79 75 L60 66 L41 75 L47 59 L34 42 L50 46 Z" fill="#0284C7" stroke="#BAE6FD" stroke-width="2"/>
      `,
    }),
  },
  {
    id: 'kage_moon_slash',
    name: 'Crescent Slash',
    category: 'Shadow & Aura',
    keywords: ['katana', 'blade', 'moon', 'breathing', 'slash', 'samurai'],
    accent: '#E11D48',
    glow: 'rgba(225,29,72,0.34)',
    label: 'FIRST FORM',
    svg: wrapChibiBadge({
      bg1: '#320918',
      bg2: '#09080B',
      ring: '#E11D48',
      caption: 'FIRST FORM',
      inner: `
        <path d="M74 28 C54 30 40 46 42 66 C44 74 52 79 62 78 C49 71 48 52 60 39 C65 34 70 31 74 28 Z" fill="#FB7185"/>
        <line x1="36" y1="72" x2="84" y2="32" stroke="#FFF1F2" stroke-width="3" stroke-linecap="round"/>
      `,
    }),
  },
];

export const KAGE_GIFTS: KageGiftItem[] = [
  {
    id: 'gift_thunder_haori',
    name: 'Thunder Haori Crest',
    subtitle: 'Starter tribute of lightning resolve',
    rarity: 'starter',
    minLevel: 1,
    accent: '#FACC15',
    svg: wrapChibiBadge({
      bg1: '#3D2B05',
      bg2: '#141116',
      ring: '#FACC15',
      caption: 'THUNDER GIFT',
      inner: `<polygon points="60,28 78,62 42,62" fill="#FDE047"/><polygon points="60,44 70,68 50,68" fill="#CA8A04"/>`,
    }),
  },
  {
    id: 'gift_crimson_lotus',
    name: 'Crimson Lotus Lantern',
    subtitle: 'Warm guild tribute for peak posts & allies',
    rarity: 'starter',
    minLevel: 1,
    accent: '#C0263D',
    svg: wrapChibiBadge({
      bg1: '#3E0A18',
      bg2: '#141116',
      ring: '#C0263D',
      caption: 'LOTUS GIFT',
      inner: `<path d="M60 30 C68 42 74 52 60 70 C46 52 52 42 60 30 Z" fill="#F43F5E"/><path d="M44 46 C52 48 56 56 60 70 C44 66 38 56 44 46 Z" fill="#FB7185"/><path d="M76 46 C68 48 64 56 60 70 C76 66 82 56 76 46 Z" fill="#FB7185"/>`,
    }),
  },
  {
    id: 'gift_shadow_dagger',
    name: 'Monarch’s Shadow Fang',
    subtitle: 'Forged in the S-Rank gate',
    rarity: 'rare',
    minLevel: 1,
    accent: '#8B5CF6',
    svg: wrapChibiBadge({
      bg1: '#230D42',
      bg2: '#141116',
      ring: '#8B5CF6',
      caption: 'SHADOW FANG',
      inner: `<polygon points="60,24 68,58 60,66 52,58" fill="#C4B5FD"/><rect x="50" y="64" width="20" height="4" rx="2" fill="#7C3AED"/><rect x="57" y="68" width="6" height="10" rx="2" fill="#A78BFA"/>`,
    }),
  },
  {
    id: 'gift_infinity_prism',
    name: 'Limitless Six-Prism',
    subtitle: 'Refracts boundless cursed energy',
    rarity: 'epic',
    minLevel: 2,
    accent: '#38BDF8',
    svg: wrapChibiBadge({
      bg1: '#0A2842',
      bg2: '#141116',
      ring: '#38BDF8',
      caption: 'SIX PRISM',
      inner: `<polygon points="60,26 80,44 72,70 48,70 40,44" fill="#0284C7" stroke="#E0F2FE" stroke-width="2"/><circle cx="60" cy="51" r="7" fill="#E0F2FE"/>`,
    }),
  },
  {
    id: 'gift_sovereign_crown',
    name: 'Sovereign Realm Relic',
    subtitle: 'Highest KAGE honour bestowed in chat',
    rarity: 'mythic',
    minLevel: 3,
    accent: '#F59E0B',
    svg: wrapChibiBadge({
      bg1: '#422806',
      bg2: '#09080B',
      ring: '#F59E0B',
      caption: 'SOVEREIGN',
      inner: `<polygon points="36,66 42,36 54,50 60,28 66,50 78,36 84,66" fill="#FBBF24" stroke="#FEF3C7" stroke-width="2"/><circle cx="60" cy="55" r="4.5" fill="#C0263D"/>`,
    }),
  },
];

export const KAGE_CONVERSATION_THEMES: KageConversationTheme[] = [
  {
    id: 'shadow_default',
    name: 'Shadow Default',
    subtitle: 'Signature KAGE obsidian & crimson',
    accentHex: '#C0263D',
    headerBg: 'from-[#18121D] to-[#110E14]',
    myBubbleClass: 'bg-[#C0263D] text-[#F5F1F2] border-[#E11D48]/40',
    peerBubbleClass: 'bg-[#1A161F] text-[#F5F1F2] border-white/10',
    surfaceTint: 'bg-[#09080B]',
  },
  {
    id: 'crimson_gate',
    name: 'Crimson Gate',
    subtitle: 'Blood-moon torii & ember glow',
    accentHex: '#E11D48',
    headerBg: 'from-[#2A0D16] to-[#120D14]',
    myBubbleClass: 'bg-gradient-to-br from-[#C0263D] to-[#881337] text-white border-rose-400/30',
    peerBubbleClass: 'bg-[#1D1318] text-[#F5F1F2] border-rose-500/15',
    surfaceTint: 'bg-[#0C080A]',
  },
  {
    id: 'violet_domain',
    name: 'Shadow Monarch',
    subtitle: 'Abyssal violet extraction aura',
    accentHex: '#7C3AED',
    headerBg: 'from-[#1D1033] to-[#110E17]',
    myBubbleClass: 'bg-gradient-to-br from-[#6D28D9] to-[#4C1D95] text-white border-violet-400/30',
    peerBubbleClass: 'bg-[#171324] text-[#F5F1F2] border-violet-500/15',
    surfaceTint: 'bg-[#09080F]',
  },
  {
    id: 'thunder_gold',
    name: 'Thunder Breathing',
    subtitle: 'Golden lightning & dusk charcoal',
    accentHex: '#EAB308',
    headerBg: 'from-[#292009] to-[#121014]',
    myBubbleClass: 'bg-gradient-to-br from-[#B45309] to-[#78350F] text-[#FEFCE8] border-amber-400/35',
    peerBubbleClass: 'bg-[#1B1813] text-[#F5F1F2] border-amber-500/15',
    surfaceTint: 'bg-[#0B0A08]',
  },
  {
    id: 'frost_abyss',
    name: 'Limitless Azure',
    subtitle: 'Deep midnight & cursed azure',
    accentHex: '#0284C7',
    headerBg: 'from-[#0C2136] to-[#101218]',
    myBubbleClass: 'bg-gradient-to-br from-[#0369A1] to-[#0C4A6E] text-white border-sky-400/30',
    peerBubbleClass: 'bg-[#131922] text-[#F5F1F2] border-sky-500/15',
    surfaceTint: 'bg-[#080B0F]',
  },
];

export const KAGE_MESSAGE_REACTIONS = ['🔥', '❤️', '⚡', '😭', '👑', '💯'] as const;

const stickerMap = new Map<string, KageSticker>(KAGE_STICKERS.map((s) => [s.id, s]));
const giftMap = new Map<string, KageGiftItem>(KAGE_GIFTS.map((g) => [g.id, g]));
const themeMap = new Map<string, KageConversationTheme>(
  KAGE_CONVERSATION_THEMES.map((t) => [t.id, t])
);

export function getStickerById(id?: string | null): KageSticker | null {
  if (!id) return null;
  return stickerMap.get(id) || null;
}

export function isValidStickerId(id?: string | null): boolean {
  return Boolean(id && stickerMap.has(id));
}

export function getGiftById(id?: string | null): KageGiftItem | null {
  if (!id) return null;
  return giftMap.get(id) || null;
}

export function getConversationTheme(id?: string | null): KageConversationTheme {
  return (id && themeMap.get(id)) || KAGE_CONVERSATION_THEMES[0];
}

export function stickerToDataUrl(sticker: KageSticker): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(sticker.svg)}`;
}

export function giftToDataUrl(gift: KageGiftItem): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(gift.svg)}`;
}
