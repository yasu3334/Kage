// Client-only generated visual assets for KAGE — INKVERSE.
// Do NOT import this file from server.ts or src/server/* (Vite handles static asset bundling).

import heroCrimsonBlade from '../assets/images/inkverse_hero_crimson_blade_1794684654465.jpg';
import heroArcaneCodex from '../assets/images/inkverse_hero_arcane_codex_1794684655185.jpg';
import heroCyberSamurai from '../assets/images/inkverse_hero_cyber_samurai_1794684655874.jpg';

import catAction from '../assets/images/inkverse_cat_action_1794684655990.jpg';
import catAdventure from '../assets/images/inkverse_cat_adventure_1794684656848.jpg';
import catFantasy from '../assets/images/inkverse_cat_fantasy_1794684657410.jpg';
import catDrama from '../assets/images/inkverse_cat_drama_1794684657292.jpg';
import catRomance from '../assets/images/inkverse_cat_romance_1794684658002.jpg';
import catScifi from '../assets/images/inkverse_cat_scifi_1794684658713.jpg';

import bwMangaSpreadPreview from '../assets/images/inkverse_bw_preview_1794684660016.jpg';

export const INKVERSE_HERO_SLIDES = [
  {
    id: 'crimson-blade',
    artworkUrl: heroCrimsonBlade,
    artworkAlt: 'Original dark fantasy manga swordsman on midnight temple rooftops',
    kicker: 'KAGE',
    title: 'INKVERSE',
    subtitle: 'Read HD & 4K Manga',
    description: 'Discover thousands of manga stories and explore the world beyond anime.',
    targetHref: '/inkverse/browse?inAppOnly=1',
    ctaLabel: 'Start Reading',
  },
  {
    id: 'arcane-codex',
    artworkUrl: heroArcaneCodex,
    artworkAlt: 'Original anime-inspired arcane scholar surrounded by violet ink scrolls',
    kicker: 'KAGE',
    title: 'INKVERSE',
    subtitle: 'Read HD & 4K Manga',
    description: 'Jump directly from KAGE anime realms into original source manga and spin-offs.',
    targetHref: '/inkverse/studio',
    ctaLabel: 'Upload Your Manga',
  },
  {
    id: 'cyber-samurai',
    artworkUrl: heroCyberSamurai,
    artworkAlt: 'Original futuristic cyber-samurai overlooking a crimson-lit metropolis',
    kicker: 'KAGE',
    title: 'INKVERSE',
    subtitle: 'Read HD & 4K Manga',
    description: 'Track chapters, save bookmarks, and resume reading seamlessly across every device.',
    targetHref: '/inkverse/my-manga',
    ctaLabel: 'My Manga Library',
  },
] as const;

export const INKVERSE_CATEGORY_ARTWORK: Record<string, string> = {
  action: catAction,
  adventure: catAdventure,
  fantasy: catFantasy,
  drama: catDrama,
  romance: catRomance,
  'sci-fi': catScifi,
};

export const INKVERSE_BW_FALLBACK_PREVIEW = bwMangaSpreadPreview;
