import crypto from 'crypto';

interface CachedSvg {
  svg: string;
  etag: string;
}

const avatarCache = new Map<string, CachedSvg>();
const bannerCache = new Map<string, CachedSvg>();
const MAX_SVG_CACHE = 600;

function putCache(map: Map<string, CachedSvg>, key: string, val: CachedSvg) {
  if (map.size >= MAX_SVG_CACHE) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, val);
}

function hashSeed(seed: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const BG_PALETTES: [string, string, string][] = [
  ['#090B14', '#1A1033', '#E11D48'],
  ['#070D19', '#0F2942', '#38BDF8'],
  ['#0C0A16', '#2B123F', '#A855F7'],
  ['#0B1210', '#12312A', '#10B981'],
  ['#140B0C', '#38131A', '#F43F5E'],
  ['#0F0E17', '#232042', '#F59E0B'],
  ['#081018', '#152A38', '#22D3EE'],
  ['#120C18', '#2F193E', '#EC4899'],
  ['#0D1117', '#1E293B', '#6366F1'],
  ['#110E0B', '#2E2115', '#FB923C'],
  ['#0A0F1D', '#172554', '#60A5FA'],
  ['#130912', '#3B0764', '#C084FC'],
  ['#091315', '#134E4A', '#2DD4BF'],
  ['#160D11', '#4C0519', '#FB7185'],
  ['#0B0F17', '#1E1B4B', '#818CF8'],
  ['#10120B', '#283118', '#A3E635'],
];

const SKIN_TONES: [string, string][] = [
  ['#FDE2D2', '#E2B49E'],
  ['#F9D4BE', '#D7A388'],
  ['#F2C2A2', '#C9906F'],
  ['#E5AD87', '#B97B56'],
  ['#D3936A', '#A46440'],
  ['#B8764F', '#8A4E2D'],
  ['#945A38', '#693B20'],
  ['#FFF0E5', '#E5C6B5'],
];

const HAIR_PALETTES: [string, string, string][] = [
  ['#171923', '#0B0C12', '#334155'],
  ['#E2E8F0', '#94A3B8', '#FFFFFF'],
  ['#BE123C', '#881337', '#FB7185'],
  ['#1D4ED8', '#1E3A8A', '#60A5FA'],
  ['#6D28D9', '#4C1D95', '#C084FC'],
  ['#0F766E', '#134E4A', '#5EEAD4'],
  ['#B45309', '#78350F', '#FBBF24'],
  ['#9D174D', '#500724', '#F472B6'],
  ['#312E81', '#1E1B4B', '#818CF8'],
  ['#3F2722', '#231411', '#7C5349'],
  ['#0369A1', '#0C4A6E', '#7DD3FC'],
  ['#CBD5E1', '#64748B', '#F8FAFC'],
  ['#7F1D1D', '#450A0A', '#F87171'],
  ['#115E59', '#042F2E', '#2DD4BF'],
  ['#581C87', '#3B0764', '#D8B4FE'],
  ['#374151', '#111827', '#9CA3AF'],
  ['#9A3412', '#431407', '#FB923C'],
  ['#1E293B', '#090D16', '#38BDF8'],
];

const EYE_COLORS: [string, string][] = [
  ['#E11D48', '#FDA4AF'],
  ['#2563EB', '#93C5FD'],
  ['#9333EA', '#D8B4FE'],
  ['#059669', '#6EE7B7'],
  ['#D97706', '#FDE68A'],
  ['#0891B2', '#67E8F9'],
  ['#DB2777', '#F9A8D4'],
  ['#4F46E5', '#A5B4FC'],
  ['#DC2626', '#FCA5A5'],
  ['#0D9488', '#5EEAD4'],
  ['#CA8A04', '#FEF08A'],
  ['#64748B', '#E2E8F0'],
];

const OUTFIT_COLORS: [string, string, string][] = [
  ['#11131C', '#1E2233', '#E11D48'],
  ['#0F172A', '#1E293B', '#38BDF8'],
  ['#181124', '#2A1D3D', '#A855F7'],
  ['#141619', '#24292F', '#F59E0B'],
  ['#0D1B1E', '#163036', '#14B8A6'],
  ['#1F1218', '#331B26', '#FB7185'],
  ['#121521', '#222840', '#818CF8'],
  ['#18181B', '#27272A', '#E4E4E7'],
  ['#1C1412', '#2E201C', '#FB923C'],
  ['#0C1814', '#162E26', '#34D399'],
];

function buildHairBack(style: number, main: string, dark: string): string {
  switch (style % 8) {
    case 0: // Spiky vanguard
      return `<path d="M52 132 L36 96 L56 90 L42 58 L74 68 L84 34 L112 58 L136 30 L146 64 L178 52 L166 86 L188 98 L168 132 Z" fill="${dark}"/>`;
    case 1: // Long flowing celestial
      return `<path d="M48 86 C42 135 38 188 46 226 L174 226 C182 188 178 135 172 86 C164 46 56 46 48 86 Z" fill="${dark}"/>`;
    case 2: // Twin-sweep cyber
      return `<path d="M46 92 L22 168 L52 178 L62 118 L158 118 L168 178 L198 168 L174 92 C160 48 60 48 46 92 Z" fill="${dark}"/>`;
    case 3: // Samurai high-tie
      return `<circle cx="110" cy="34" r="18" fill="${dark}"/><path d="M98 28 L110 8 L124 28 Z" fill="${main}"/><path d="M56 96 C54 54 166 54 164 96 L168 142 L52 142 Z" fill="${dark}"/>`;
    case 4: // Sleek bob cut
      return `<path d="M50 88 C46 128 52 162 66 174 L154 174 C168 162 174 128 170 88 C164 48 56 48 50 88 Z" fill="${dark}"/>`;
    case 5: // Wild dark-mage mane
      return `<path d="M40 144 L26 112 L46 98 L30 68 L62 72 L68 38 L102 54 L118 26 L136 54 L168 40 L166 74 L194 76 L176 108 L186 144 Z" fill="${dark}"/>`;
    case 6: // Asymmetrical undercut
      return `<path d="M54 126 L44 76 L78 44 L138 40 L176 68 L172 134 Z" fill="${dark}"/>`;
    default: // Feathered archon
      return `<path d="M46 138 L34 104 L50 82 L48 52 L82 54 L110 32 L138 54 L172 52 L170 82 L186 104 L174 138 Z" fill="${dark}"/>`;
  }
}

function buildHairFront(style: number, main: string, dark: string, highlight: string): string {
  const variant = style % 10;
  const crown = `<path d="M56 98 C56 52 164 52 164 98 C158 76 142 68 110 68 C78 68 62 76 56 98 Z" fill="${main}"/>`;
  const sheen = `<path d="M76 68 Q110 58 144 68 Q128 62 110 62 Q92 62 76 68 Z" fill="${highlight}" opacity="0.55"/>`;

  switch (variant) {
    case 0:
      return `${crown}<path d="M56 92 L68 122 L84 94 L102 126 L116 92 L134 122 L148 92 L164 118 L166 84 C152 52 68 52 56 92 Z" fill="${main}"/>${sheen}`;
    case 1:
      return `${crown}<path d="M54 90 C62 118 76 130 92 104 C104 124 122 126 132 100 C144 122 158 122 166 90 C156 54 64 54 54 90 Z" fill="${main}"/>${sheen}`;
    case 2:
      return `${crown}<path d="M54 88 L52 146 L68 132 L76 96 L110 118 L144 96 L152 132 L168 146 L166 88 C154 52 66 52 54 88 Z" fill="${main}"/>${sheen}`;
    case 3:
      return `${crown}<path d="M56 88 L88 124 L98 92 L138 126 L164 88 C152 52 68 52 56 88 Z" fill="${main}"/><path d="M88 124 L100 96 L110 120 Z" fill="${dark}" opacity="0.45"/>${sheen}`;
    case 4:
      return `${crown}<path d="M54 92 L60 156 L72 142 L74 96 L106 112 L120 92 L146 96 L148 142 L160 156 L166 92 C154 52 66 52 54 92 Z" fill="${main}"/>${sheen}`;
    case 5:
      return `${crown}<path d="M52 94 L44 118 L66 114 L74 132 L94 98 L114 130 L128 98 L148 128 L166 106 L168 88 C154 50 66 50 52 94 Z" fill="${main}"/>${sheen}`;
    case 6:
      return `${crown}<path d="M56 86 C60 126 98 134 126 94 C142 112 156 118 164 90 C154 52 66 52 56 86 Z" fill="${main}"/>${sheen}`;
    case 7:
      return `${crown}<path d="M56 90 L70 114 L82 90 L110 128 L138 90 L150 114 L164 90 C152 52 68 52 56 90 Z" fill="${main}"/>${sheen}`;
    case 8:
      return `${crown}<path d="M54 90 L58 136 L76 104 L96 122 L110 92 L126 122 L144 104 L162 136 L166 90 C154 52 66 52 54 90 Z" fill="${main}"/>${sheen}`;
    default:
      return `${crown}<path d="M56 88 C68 116 86 116 98 92 C110 118 128 118 164 88 C152 52 68 52 56 88 Z" fill="${main}"/>${sheen}`;
  }
}

function buildAccessory(acc: number, accent: string): string {
  switch (acc % 9) {
    case 0: // Shinobi / Hunter Forehead Plate
      return `<rect x="74" y="76" width="72" height="11" rx="3" fill="#1E293B" stroke="${accent}" stroke-width="1.5"/><circle cx="110" cy="81.5" r="2.5" fill="${accent}"/>`;
    case 1: // Sleek Cyber Visor Glasses
      return `<g opacity="0.9"><rect x="68" y="106" width="36" height="15" rx="4" fill="none" stroke="${accent}" stroke-width="2"/><rect x="116" y="106" width="36" height="15" rx="4" fill="none" stroke="${accent}" stroke-width="2"/><line x1="104" y1="112" x2="116" y2="112" stroke="${accent}" stroke-width="2"/></g>`;
    case 2: // Cheek Bandage
      return `<rect x="128" y="129" width="16" height="6" rx="2" transform="rotate(-12 136 132)" fill="#F8FAFC" opacity="0.88"/>`;
    case 3: // Mystic Crimson/Astral Brow Mark
      return `<path d="M110 92 L114 99 L110 105 L106 99 Z" fill="${accent}" opacity="0.9"/>`;
    case 4: // Ear Cuff Glow
      return `<circle cx="57" cy="126" r="3.2" fill="${accent}"/><circle cx="163" cy="126" r="3.2" fill="${accent}"/>`;
    case 5: // Tactical Scarf Wrap
      return `<path d="M72 164 Q110 180 148 164 L154 186 Q110 200 66 186 Z" fill="${accent}" opacity="0.88"/>`;
    case 6: // Hairpin Clips
      return `<line x1="66" y1="88" x2="80" y2="94" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/><line x1="68" y1="94" x2="82" y2="100" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>`;
    case 7: // Subtle Eye Under-Markings
      return `<path d="M84 126 L80 134 M136 126 L140 134" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
    default:
      return '';
  }
}

export function renderDemoAvatarSvg(rawSeed: string): CachedSvg {
  const cleanSeed = String(rawSeed || 'hunter').replace(/\.svg$/i, '').slice(0, 64);
  const hit = avatarCache.get(cleanSeed);
  if (hit) return hit;

  const h1 = hashSeed(cleanSeed, 0x101);
  const h2 = hashSeed(cleanSeed, 0x202);
  const h3 = hashSeed(cleanSeed, 0x303);
  const h4 = hashSeed(cleanSeed, 0x404);

  const [bgDark, bgMid, bgAccent] = BG_PALETTES[h1 % BG_PALETTES.length];
  const [skinBase, skinShadow] = SKIN_TONES[(h1 >>> 5) % SKIN_TONES.length];
  const [hairMain, hairDark, hairHi] = HAIR_PALETTES[h2 % HAIR_PALETTES.length];
  const [eyeMain, eyeHi] = EYE_COLORS[(h2 >>> 6) % EYE_COLORS.length];
  const [coatBase, coatMid, coatTrim] = OUTFIT_COLORS[h3 % OUTFIT_COLORS.length];

  const hairBackIdx = (h3 >>> 4) % 16;
  const hairFrontIdx = (h3 >>> 9) % 20;
  const expressionIdx = h4 % 6;
  const accessoryIdx = (h4 >>> 4) % 9;
  const auraAngle = (h4 >>> 9) % 360;

  let mouthPath = 'M99 145 Q110 150 121 145';
  if (expressionIdx === 1) mouthPath = 'M100 146 Q112 151 123 142'; // confident smirk
  if (expressionIdx === 2) mouthPath = 'M102 146 L118 146'; // stoic hunter
  if (expressionIdx === 3) mouthPath = 'M98 143 Q110 154 122 143 Z'; // bright smile
  if (expressionIdx === 4) mouthPath = 'M101 147 Q110 144 119 147'; // serious focus
  if (expressionIdx === 5) mouthPath = 'M99 145 Q108 149 119 143'; // subtle grin

  const browTilt = expressionIdx === 4 || expressionIdx === 2 ? 3 : -1;
  const uidTag = crypto.createHash('md5').update(cleanSeed).digest('hex').slice(0, 6);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="KAGE Hunter Avatar">
  <defs>
    <linearGradient id="bg_${uidTag}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgDark}"/>
      <stop offset="62%" stop-color="${bgMid}"/>
      <stop offset="100%" stop-color="${bgAccent}" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="coat_${uidTag}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${coatMid}"/>
      <stop offset="100%" stop-color="${coatBase}"/>
    </linearGradient>
  </defs>
  <rect width="220" height="220" fill="url(#bg_${uidTag})"/>
  <circle cx="110" cy="108" r="82" fill="none" stroke="${bgAccent}" stroke-width="1" stroke-dasharray="6 8" opacity="0.32" transform="rotate(${auraAngle} 110 108)"/>
  <circle cx="110" cy="108" r="68" fill="${bgAccent}" opacity="0.1"/>
  ${buildHairBack(hairBackIdx, hairMain, hairDark)}
  <path d="M36 220 C42 178 68 166 110 166 C152 166 178 178 184 220 Z" fill="url(#coat_${uidTag})"/>
  <path d="M84 167 L110 204 L136 167 L148 220 L72 220 Z" fill="${coatBase}"/>
  <path d="M84 167 L110 198 L136 167" fill="none" stroke="${coatTrim}" stroke-width="2.5"/>
  <rect x="97" y="148" width="26" height="28" rx="10" fill="${skinShadow}"/>
  <path d="M97 154 Q110 166 123 154 L123 172 L97 172 Z" fill="${skinBase}" opacity="0.65"/>
  <ellipse cx="59" cy="120" rx="7" ry="12" fill="${skinShadow}"/>
  <ellipse cx="161" cy="120" rx="7" ry="12" fill="${skinShadow}"/>
  <path d="M64 96 C64 66 156 66 156 96 C156 128 140 152 110 158 C80 152 64 128 64 96 Z" fill="${skinBase}"/>
  <path d="M66 112 C68 136 84 152 110 158 C94 150 80 136 74 112 Z" fill="${skinShadow}" opacity="0.38"/>
  <g>
    <path d="M75 111 Q88 105 100 112 Q88 119 75 113 Z" fill="#FFFFFF"/>
    <circle cx="88" cy="112" r="6.2" fill="${eyeMain}"/>
    <circle cx="88" cy="112" r="3" fill="#090B12"/>
    <circle cx="85.8" cy="109.8" r="2" fill="#FFFFFF"/>
    <circle cx="90.5" cy="114" r="1" fill="${eyeHi}"/>
    <path d="M74 111 Q88 104 101 112" fill="none" stroke="#11131C" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M120 112 Q132 105 145 111 Q132 119 120 113 Z" fill="#FFFFFF"/>
    <circle cx="132" cy="112" r="6.2" fill="${eyeMain}"/>
    <circle cx="132" cy="112" r="3" fill="#090B12"/>
    <circle cx="129.8" cy="109.8" r="2" fill="#FFFFFF"/>
    <circle cx="134.5" cy="114" r="1" fill="${eyeHi}"/>
    <path d="M119 112 Q132 104 146 111" fill="none" stroke="#11131C" stroke-width="2.6" stroke-linecap="round"/>
    <line x1="75" y1="${101 - browTilt}" x2="99" y2="${102 + browTilt}" stroke="${hairDark}" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="145" y1="${101 - browTilt}" x2="121" y2="${102 + browTilt}" stroke="${hairDark}" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <path d="M109 122 L106 132 L111 133" fill="none" stroke="${skinShadow}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${mouthPath}" fill="${expressionIdx === 3 ? '#BE123C' : 'none'}" stroke="#582F25" stroke-width="2.2" stroke-linecap="round"/>
  ${buildHairFront(hairFrontIdx, hairMain, hairDark, hairHi)}
  ${buildAccessory(accessoryIdx, coatTrim)}
</svg>`;

  const etag = `"av-${uidTag}-v1"`;
  const result = { svg, etag };
  putCache(avatarCache, cleanSeed, result);
  return result;
}

export function renderDemoBannerSvg(rawSeed: string): CachedSvg {
  const cleanSeed = String(rawSeed || 'realm').replace(/\.svg$/i, '').slice(0, 64);
  const hit = bannerCache.get(cleanSeed);
  if (hit) return hit;

  const h1 = hashSeed(cleanSeed, 0x991);
  const h2 = hashSeed(cleanSeed, 0x772);
  const [c1, c2, accent] = BG_PALETTES[h1 % BG_PALETTES.length];
  const moonX = 220 + (h2 % 760);
  const moonY = 74 + ((h2 >>> 8) % 90);
  const moonR = 36 + ((h2 >>> 14) % 34);
  const motif = (h1 >>> 7) % 4;
  const uidTag = crypto.createHash('md5').update(`banner:${cleanSeed}`).digest('hex').slice(0, 6);

  let horizonArt = '';
  if (motif === 0) {
    // Distant Shrine Torii & Mountain Ridge
    horizonArt = `<path d="M0 300 L180 210 L340 265 L540 185 L760 260 L980 195 L1200 285 L1200 360 L0 360 Z" fill="#070910" opacity="0.88"/>
      <g fill="#05060B" opacity="0.95" transform="translate(${moonX - 38}, 182)">
        <path d="M0 18 Q38 6 76 18 L72 26 Q38 16 4 26 Z"/>
        <rect x="10" y="32" width="56" height="6"/>
        <rect x="16" y="22" width="7" height="72"/>
        <rect x="53" y="22" width="7" height="72"/>
      </g>`;
  } else if (motif === 1) {
    // Neo-Tokyo Cyber Skyline
    horizonArt = `<g fill="#060811" opacity="0.92">
      <rect x="40" y="190" width="68" height="170"/><rect x="125" y="145" width="54" height="215"/>
      <rect x="210" y="210" width="85" height="150"/><rect x="340" y="130" width="62" height="230"/>
      <rect x="440" y="175" width="90" height="185"/><rect x="690" y="155" width="72" height="205"/>
      <rect x="810" y="125" width="58" height="235"/><rect x="920" y="180" width="96" height="180"/>
      <rect x="1050" y="150" width="74" height="210"/>
      <rect x="0" y="310" width="1200" height="50"/>
    </g>`;
  } else if (motif === 2) {
    // Floating Astral Shards
    horizonArt = `<path d="M0 320 Q300 250 600 300 T1200 280 L1200 360 L0 360 Z" fill="#06070E" opacity="0.92"/>
      <polygon points="260,140 285,95 304,152 276,176" fill="${accent}" opacity="0.28"/>
      <polygon points="840,120 872,72 894,136 862,165" fill="${accent}" opacity="0.24"/>
      <polygon points="580,95 602,60 618,108" fill="#F8FAFC" opacity="0.22"/>`;
  } else {
    // Jagged Dark-Fantasy Canyon & Slash Streak
    horizonArt = `<path d="M0 360 L0 240 L160 190 L290 270 L470 175 L640 265 L830 168 L1020 250 L1200 185 L1200 360 Z" fill="#06080F" opacity="0.92"/>
      <line x1="120" y1="310" x2="1080" y2="55" stroke="${accent}" stroke-width="2" opacity="0.45"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" width="1200" height="360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="KAGE Profile Banner">
  <defs>
    <linearGradient id="sky_${uidTag}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="55%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.48"/>
    </linearGradient>
    <radialGradient id="glow_${uidTag}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="360" fill="url(#sky_${uidTag})"/>
  <circle cx="${moonX}" cy="${moonY}" r="${moonR * 2.6}" fill="url(#glow_${uidTag})"/>
  <circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="#F8FAFC" opacity="0.86"/>
  <circle cx="${moonX + 12}" cy="${moonY - 8}" r="${moonR * 0.86}" fill="${c2}" opacity="0.55"/>
  ${horizonArt}
</svg>`;

  const etag = `"bn-${uidTag}-v1"`;
  const result = { svg, etag };
  putCache(bannerCache, cleanSeed, result);
  return result;
}
