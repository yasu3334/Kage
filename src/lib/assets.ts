import thunderArt from '../assets/images/kage_intro_thunder_swordsman_1792973563393.jpg';
import shadowMonarchArt from '../assets/images/kage_hero_shadow_monarch_1792973564728.jpg';
import infinityCastleArt from '../assets/images/kage_guild_infinity_castle_1792973565768.jpg';
import wingsFreedomArt from '../assets/images/kage_guild_wings_freedom_1792973568520.jpg';
import defaultAvatarArt from '../assets/images/kage_avatar_default_1792973568236.jpg';
import animeUniverseBannerArt from '../assets/images/anime_universe_banner_1793189811754.jpg';
import animeUniverseCrestArt from '../assets/images/anime_universe_crest_1793189812256.jpg';
import animeChatBannerArt from '../assets/images/anime_chat_banner_1793189815000.jpg';
import pinnedWelcomeThumbArt from '../assets/images/pinned_welcome_thumb_1793189814772.jpg';

export const KAGE_LOGO_URL = '/assets/kage-logo.png';
export const ZENITSU_AVATAR_URL = '/assets/zenitsu-avatar.png';

export const KAGE_ASSETS: Record<string, string> = {
  'asset:thunder': '/assets/extracted/zenitsu-live-room.jpg',
  'asset:thunder_intro': thunderArt,
  'asset:shadow_monarch': '/assets/extracted/solo-hero-home.jpg',
  'asset:infinity_castle': '/assets/extracted/guild-infinity.jpg',
  'asset:wings_freedom': '/assets/extracted/guild-wings.jpg',
  'asset:guild_shadow': '/assets/extracted/guild-shadow.jpg',
  'asset:avatar_default': '/assets/zenitsu-avatar.png',
  'asset:avatar_zenitsu_dark': '/assets/extracted/avatar-zenitsu-dark.jpg',
  'asset:avatar_levi': '/assets/extracted/avatar-levi.jpg',
  'asset:clash_jinwoo': '/assets/extracted/clash-jinwoo.jpg',
  'asset:clash_gojo': '/assets/extracted/clash-gojo.jpg',
  'asset:pulse_hashira': '/assets/extracted/pulse-hashira.jpg',
  'asset:pulse_levi': '/assets/extracted/pulse-levi.jpg',
  'asset:your_lie_banner': '/assets/extracted/your-lie-banner.jpg',
  'asset:anime_universe_banner': animeUniverseBannerArt,
  'asset:anime_universe_crest': animeUniverseCrestArt,
  'asset:anime_chat_banner': animeChatBannerArt,
  'asset:pinned_welcome_thumb': pinnedWelcomeThumbArt,
  'asset:legacy_shadow': shadowMonarchArt,
  'asset:legacy_infinity': infinityCastleArt,
  'asset:legacy_wings': wingsFreedomArt,
  'asset:legacy_avatar': defaultAvatarArt,
};

export function resolveAssetUrl(src?: string | null): string {
  if (!src) return '';
  if (KAGE_ASSETS[src]) return KAGE_ASSETS[src];
  return src;
}

export const PRESET_AVATARS = [
  { key: '/assets/zenitsu-avatar.png', label: 'Zenitsu Gold', url: '/assets/zenitsu-avatar.png' },
  {
    key: 'asset:anime_universe_crest',
    label: 'Anime Universe Crest',
    url: animeUniverseCrestArt,
  },
  {
    key: '/assets/extracted/avatar-zenitsu-dark.jpg',
    label: 'Thunder Slayer',
    url: '/assets/extracted/avatar-zenitsu-dark.jpg',
  },
  {
    key: '/assets/extracted/avatar-levi.jpg',
    label: 'Captain Levi',
    url: '/assets/extracted/avatar-levi.jpg',
  },
  {
    key: '/assets/extracted/clash-jinwoo.jpg',
    label: 'Shadow Monarch',
    url: '/assets/extracted/clash-jinwoo.jpg',
  },
  {
    key: '/assets/extracted/clash-gojo.jpg',
    label: 'Six Eyes Gojo',
    url: '/assets/extracted/clash-gojo.jpg',
  },
];

export const PRESET_BANNERS = [
  {
    key: 'asset:anime_universe_banner',
    label: 'Anime Universe Heroes',
    url: animeUniverseBannerArt,
  },
  {
    key: 'asset:anime_chat_banner',
    label: 'Crimson Anime Lounge',
    url: animeChatBannerArt,
  },
  {
    key: '/assets/extracted/solo-hero-home.jpg',
    label: 'Solo Leveling',
    url: '/assets/extracted/solo-hero-home.jpg',
  },
  {
    key: '/assets/extracted/zenitsu-live-room.jpg',
    label: 'Zenitsu Thunder',
    url: '/assets/extracted/zenitsu-live-room.jpg',
  },
  {
    key: '/assets/extracted/guild-infinity.jpg',
    label: 'Infinity Castle',
    url: '/assets/extracted/guild-infinity.jpg',
  },
  {
    key: '/assets/extracted/guild-wings.jpg',
    label: 'Wings of Freedom',
    url: '/assets/extracted/guild-wings.jpg',
  },
  {
    key: '/assets/extracted/clash-gojo.jpg',
    label: 'Unlimited Void',
    url: '/assets/extracted/clash-gojo.jpg',
  },
  {
    key: '/assets/extracted/pulse-hashira.jpg',
    label: 'Hashira Corps',
    url: '/assets/extracted/pulse-hashira.jpg',
  },
];
