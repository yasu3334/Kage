import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  Crown,
  Flame,
  Medal,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from './KageImage';
import { OwnerBadge } from './KageBrand';
import { formatCompactNumber } from '../lib/formatters';

export interface LeaderboardHunterRow {
  rank: number;
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  kageId: string | null;
  role: string;
  equippedTitle: string;
  accountLevel: number;
  accountXp: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  completedMatches: number;
  winRate: number;
  votesEarned: number;
  entriesSubmitted: number;
  clashesCreated: number;
  votesCast: number;
  rewardsCaptured: number;
  powerScore: number;
  isAiDemo?: boolean;
}

export interface LeaderboardCommunityRow {
  rank: number;
  id: number;
  slug: string;
  name: string;
  category: string;
  artworkUrl: string;
  isVerified: boolean;
  privacyMode: string;
  communityLevel: number;
  communityXp: number;
  memberCount: number;
  discussionCount: number;
  guildWarWins: number;
  guildWarLosses: number;
  guildWarDraws: number;
  guildWarsPlayed: number;
  completedGuildWars: number;
  liveGuildWars: number;
  winRate: number;
  warVotesEarned: number;
  rewardsCaptured: number;
  powerScore: number;
}

export interface GlobalLeaderboardResponse {
  summary: {
    totalClashes: number;
    liveClashes: number;
    completedClashes: number;
    totalVotesCast: number;
    activeCommunities: number;
    activeClashHunters: number;
  };
  hunters: LeaderboardHunterRow[];
  communities: LeaderboardCommunityRow[];
  viewerHunterRank: LeaderboardHunterRow | null;
  generatedAt: string;
}

type ViewTab = 'split' | 'hunters' | 'communities';
type HunterSortKey = 'powerScore' | 'wins' | 'votesEarned' | 'accountLevel';
type CommunitySortKey = 'powerScore' | 'guildWarWins' | 'communityXp' | 'memberCount';

interface GlobalLeaderboardProps {
  defaultTab?: ViewTab;
  showHeader?: boolean;
  showSummary?: boolean;
  limit?: number;
  className?: string;
}

function getRankVisuals(rank: number) {
  if (rank === 1) {
    return {
      cardClass:
        'bg-gradient-to-br from-amber-500/[0.16] via-[#141116]/85 to-[#09080B]/95 border-amber-400/40 shadow-[0_18px_48px_rgba(245,158,11,0.14)]',
      numClass: 'text-amber-300',
      barClass: 'from-amber-400 to-amber-500',
      ringClass: 'border-amber-400/70',
      label: 'Apex Rank #01',
      Icon: Crown,
      iconClass: 'text-amber-400',
    };
  }
  if (rank === 2) {
    return {
      cardClass:
        'bg-gradient-to-br from-[#C0263D]/[0.16] via-[#141116]/85 to-[#09080B]/95 border-[#C0263D]/40 shadow-[0_18px_44px_rgba(192,38,61,0.14)]',
      numClass: 'text-[#FB7185]',
      barClass: 'from-[#C0263D] to-[#FB7185]',
      ringClass: 'border-[#FB7185]/60',
      label: 'Crimson Rank #02',
      Icon: Medal,
      iconClass: 'text-[#FB7185]',
    };
  }
  return {
    cardClass:
      'bg-gradient-to-br from-[#6D28D9]/[0.18] via-[#141116]/85 to-[#09080B]/95 border-[#6D28D9]/45 shadow-[0_18px_44px_rgba(109,40,217,0.14)]',
    numClass: 'text-[#A78BFA]',
    barClass: 'from-[#6D28D9] to-[#A78BFA]',
    ringClass: 'border-[#A78BFA]/60',
    label: 'Shadow Rank #03',
    Icon: Trophy,
    iconClass: 'text-[#A78BFA]',
  };
}

export const GlobalLeaderboard: React.FC<GlobalLeaderboardProps> = ({
  defaultTab = 'split',
  showHeader = true,
  showSummary = true,
  limit = 30,
  className = '',
}) => {
  const { user, subscribeWs } = useAuth();
  const [data, setData] = useState<GlobalLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<ViewTab>(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [hunterSort, setHunterSort] = useState<HunterSortKey>('powerScore');
  const [communitySort, setCommunitySort] = useState<CommunitySortKey>('powerScore');

  const fetchLeaderboard = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const res = await apiFetch<GlobalLeaderboardResponse>(`/api/leaderboard?limit=${limit}`);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Unable to load global rankings.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    void fetchLeaderboard(false);
  }, [fetchLeaderboard, user?.uid]);

  // Live refresh when any Clash vote, duel acceptance, or new Clash settles
  useEffect(() => {
    let timer: number | null = null;
    const unsub = subscribeWs((msg) => {
      if (msg.type === 'clash:updated' || msg.type === 'clash:created') {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void fetchLeaderboard(true);
        }, 450);
      }
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsub();
    };
  }, [subscribeWs, fetchLeaderboard]);

  const sortedHunters = useMemo(() => {
    const list = [...(data?.hunters || [])];
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (h) =>
            h.displayName.toLowerCase().includes(q) ||
            h.username.toLowerCase().includes(q) ||
            (h.kageId || '').toLowerCase().includes(q) ||
            (h.equippedTitle || '').toLowerCase().includes(q)
        )
      : list;

    filtered.sort((a, b) => {
      if (hunterSort === 'wins') {
        return b.wins - a.wins || b.winRate - a.winRate || b.powerScore - a.powerScore;
      }
      if (hunterSort === 'votesEarned') {
        return b.votesEarned - a.votesEarned || b.powerScore - a.powerScore;
      }
      if (hunterSort === 'accountLevel') {
        return b.accountLevel - a.accountLevel || b.accountXp - a.accountXp || b.powerScore - a.powerScore;
      }
      return b.powerScore - a.powerScore || b.wins - a.wins || b.votesEarned - a.votesEarned;
    });

    return filtered;
  }, [data?.hunters, searchQuery, hunterSort]);

  const sortedCommunities = useMemo(() => {
    const list = [...(data?.communities || [])];
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            g.category.toLowerCase().includes(q) ||
            g.slug.toLowerCase().includes(q)
        )
      : list;

    filtered.sort((a, b) => {
      if (communitySort === 'guildWarWins') {
        return (
          b.guildWarWins - a.guildWarWins ||
          b.winRate - a.winRate ||
          b.powerScore - a.powerScore
        );
      }
      if (communitySort === 'communityXp') {
        return b.communityXp - a.communityXp || b.communityLevel - a.communityLevel;
      }
      if (communitySort === 'memberCount') {
        return b.memberCount - a.memberCount || b.powerScore - a.powerScore;
      }
      return b.powerScore - a.powerScore || b.guildWarWins - a.guildWarWins;
    });

    return filtered;
  }, [data?.communities, searchQuery, communitySort]);

  const topHunterScore = sortedHunters[0]?.powerScore || 1;
  const topCommunityScore = sortedCommunities[0]?.powerScore || 1;

  const summary = data?.summary;
  const viewerRank = data?.viewerHunterRank || null;

  return (
    <section
      className={`relative rounded-3xl overflow-hidden bg-[#09080B]/70 border border-white/12 p-4 sm:p-6 space-y-6 shadow-[0_28px_80px_rgba(0,0,0,0.75)] ${className}`}
    >
      {/* Ambient Atmospheric Glows inside Glass Container */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -left-24 w-72 h-72 rounded-full bg-[#C0263D]/18 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-[#6D28D9]/20 blur-[120px]"
      />

      {/* Section Header */}
      {showHeader && (
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FB7185] uppercase tracking-[0.16em]">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>Global Arena &amp; Guild Standings</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#F5F1F2]">
              GLOBAL CLASH &amp; COMMUNITIES LEADERBOARD
            </h2>
            <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-2xl">
              Live verified standings ranked by 1v1 duel victories, arena votes earned, guild war
              supremacy, and community progression.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void fetchLeaderboard(true)}
              disabled={refreshing}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#141116]/80 backdrop-blur-md border border-white/12 hover:border-[#C0263D]/50 text-xs font-semibold text-[#D8D2DC] hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer kage-press"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#FB7185]' : ''}`} />
              <span>{refreshing ? 'Syncing' : 'Sync Live'}</span>
            </button>

            <Link
              to="/clash"
              className="min-h-[40px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors kage-press whitespace-nowrap"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Enter Clash</span>
            </Link>
          </div>
        </div>
      )}

      {/* KPI Summary Glass Strip */}
      {showSummary && summary && (
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Clash Battles',
              value: formatCompactNumber(summary.totalClashes),
              meta: `${summary.liveClashes} live · ${summary.completedClashes} resolved`,
              icon: Swords,
              accent: 'text-[#FB7185]',
            },
            {
              label: 'Arena Votes Cast',
              value: formatCompactNumber(summary.totalVotesCast),
              meta: 'Verified hunter ballots',
              icon: Vote,
              accent: 'text-[#A78BFA]',
            },
            {
              label: 'Ranked Hunters',
              value: formatCompactNumber(summary.activeClashHunters),
              meta: 'Active duelists & voters',
              icon: Flame,
              accent: 'text-amber-400',
            },
            {
              label: 'Active Guilds',
              value: formatCompactNumber(summary.activeCommunities),
              meta: 'Competing communities',
              icon: Shield,
              accent: 'text-emerald-400',
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-2xl bg-[#141116]/65 backdrop-blur-xl border border-white/10 px-4 py-3.5 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-medium text-[#A7A0AA] truncate">{stat.label}</p>
                  <p className="text-lg sm:text-xl font-bold font-mono-num text-[#F5F1F2]">
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-[#A7A0AA] truncate">{stat.meta}</p>
                </div>
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${stat.accent}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* Logged-in Hunter Personal Standings Glass Banner */}
      {viewerRank && (
        <div className="relative rounded-2xl bg-gradient-to-r from-[#C0263D]/14 via-[#141116]/85 to-[#6D28D9]/18 backdrop-blur-xl border border-white/15 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/20 bg-[#09080B] shrink-0">
              <KageImage
                src={viewerRank.avatarUrl}
                alt={viewerRank.displayName}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 font-mono-num">
                  {viewerRank.rank > 0 ? `Your Global Rank #${viewerRank.rank}` : 'Unranked in Clash'}
                </span>
                <span aria-hidden="true" className="text-[#A7A0AA]">·</span>
                <Link
                  to={`/profile/${viewerRank.username}`}
                  className="text-xs sm:text-sm font-bold text-[#F5F1F2] hover:text-[#FB7185] truncate"
                >
                  {viewerRank.displayName}
                </Link>
              </div>
              <p className="text-xs text-[#D8D2DC] font-mono-num mt-0.5">
                {viewerRank.wins}W · {viewerRank.losses}L · {viewerRank.draws}D ·{' '}
                {formatCompactNumber(viewerRank.votesEarned)} votes earned ·{' '}
                {formatCompactNumber(viewerRank.powerScore)} Rating
              </p>
            </div>
          </div>

          <Link
            to="/clash"
            className="min-h-[36px] px-3.5 rounded-xl bg-white/[0.08] hover:bg-[#C0263D] border border-white/12 text-xs font-semibold text-[#F5F1F2] inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <span>{viewerRank.rank > 0 ? 'Climb Ranks' : 'Fight First Duel'}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Controls: View Mode Tabs, Search & Sort */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-[#141116]/75 backdrop-blur-xl border border-white/10 w-full md:w-auto">
          {(
            [
              { key: 'split' as const, label: 'Split Overview', icon: Crown },
              { key: 'hunters' as const, label: 'Clash Hunters', icon: Swords },
              { key: 'communities' as const, label: 'Communities & Guilds', icon: Shield },
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer kage-press ${
                  active
                    ? 'bg-gradient-to-r from-[#C0263D] to-[#9F1239] text-white shadow-[0_6px_20px_rgba(192,38,61,0.35)]'
                    : 'text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-[#A7A0AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter hunter or guild..."
              className="w-full min-h-[40px] rounded-xl bg-[#141116]/80 backdrop-blur-md border border-white/12 pl-8 pr-3 text-xs text-[#F5F1F2] placeholder:text-[#A7A0AA] focus:outline-none focus:border-[#C0263D]"
            />
          </div>

          {activeTab !== 'communities' && (
            <select
              value={hunterSort}
              onChange={(e) => setHunterSort(e.target.value as HunterSortKey)}
              aria-label="Sort Clash Hunters"
              className="min-h-[40px] rounded-xl bg-[#141116]/80 backdrop-blur-md border border-white/12 px-3 text-xs font-medium text-[#F5F1F2] focus:outline-none focus:border-[#C0263D] cursor-pointer"
            >
              <option value="powerScore">Hunters: Overall Rating</option>
              <option value="wins">Hunters: Clash Wins</option>
              <option value="votesEarned">Hunters: Votes Earned</option>
              <option value="accountLevel">Hunters: Hunter Level</option>
            </select>
          )}

          {activeTab !== 'hunters' && (
            <select
              value={communitySort}
              onChange={(e) => setCommunitySort(e.target.value as CommunitySortKey)}
              aria-label="Sort Communities"
              className="min-h-[40px] rounded-xl bg-[#141116]/80 backdrop-blur-md border border-white/12 px-3 text-xs font-medium text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9] cursor-pointer"
            >
              <option value="powerScore">Guilds: Power Score</option>
              <option value="guildWarWins">Guilds: War Wins</option>
              <option value="communityXp">Guilds: Community XP</option>
              <option value="memberCount">Guilds: Members</option>
            </select>
          )}
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="relative space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-44 rounded-2xl bg-[#141116]/70 border border-white/8 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-[#141116]/60 border border-white/8 animate-pulse" />
        </div>
      ) : error ? (
        <div className="relative rounded-2xl bg-rose-500/10 border border-rose-500/30 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void fetchLeaderboard(false)}
            className="min-h-[38px] px-4 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
          >
            Retry Sync
          </button>
        </div>
      ) : activeTab === 'split' ? (
        /* Split Overview: Top Clash Hunters + Top Performing Communities Side-by-Side */
        <div className="relative grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Left Column: Top Clash Hunters */}
          <div className="rounded-2xl bg-[#141116]/70 backdrop-blur-xl border border-white/12 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#C0263D]/20 border border-[#C0263D]/40 flex items-center justify-center shrink-0">
                  <Swords className="w-4 h-4 text-[#FB7185]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                    Top Clash Hunters
                  </h3>
                  <p className="text-[11px] text-[#A7A0AA] truncate">
                    1v1 duels, edit submissions &amp; votes earned
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('hunters')}
                className="text-xs font-semibold text-[#FB7185] hover:text-white inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>Full Table</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {sortedHunters.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Swords className="w-7 h-7 text-[#A7A0AA] mx-auto" />
                <p className="text-xs font-semibold text-[#F5F1F2]">No matching hunters yet</p>
                <p className="text-[11px] text-[#A7A0AA]">
                  Cast votes or fight a 1v1 Clash duel to claim the top rank.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedHunters.slice(0, 8).map((h, idx) => {
                  const displayRank = searchQuery || hunterSort !== 'powerScore' ? idx + 1 : h.rank;
                  const pct = Math.max(8, Math.round((h.powerScore / topHunterScore) * 100));
                  const isTop3 = displayRank <= 3;
                  const vis = getRankVisuals(displayRank);
                  const isViewer = user?.uid === h.uid;

                  return (
                    <Link
                      key={h.uid}
                      to={`/profile/${h.username}`}
                      className={`block rounded-xl p-3 transition-all border ${
                        isViewer
                          ? 'bg-[#C0263D]/14 border-[#FB7185]/45'
                          : isTop3
                            ? 'bg-white/[0.04] border-white/12 hover:border-white/25'
                            : 'bg-[#09080B]/55 border-white/[0.06] hover:border-white/16'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-7 text-sm font-bold font-mono-num shrink-0 ${
                              isTop3 ? vis.numClass : 'text-[#A7A0AA]'
                            }`}
                          >
                            #{String(displayRank).padStart(2, '0')}
                          </span>
                          <div
                            className={`w-10 h-10 rounded-full overflow-hidden border bg-[#09080B] shrink-0 ${
                              isTop3 ? vis.ringClass : 'border-white/15'
                            }`}
                          >
                            <KageImage
                              src={h.avatarUrl}
                              alt={h.displayName}
                              className="w-full h-full object-cover object-top"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs sm:text-sm font-bold text-[#F5F1F2] truncate">
                                {h.displayName}
                              </span>
                              <OwnerBadge role={h.role} size="xs" />
                            </div>
                            <p className="text-[11px] text-[#A7A0AA] truncate font-mono-num">
                              @{h.username} · Lvl {h.accountLevel} · {h.wins}W-{h.losses}L ·{' '}
                              {formatCompactNumber(h.votesEarned)} votes
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {formatCompactNumber(h.powerScore)}
                          </p>
                          <p className="text-[11px] text-[#FB7185] font-mono-num">
                            {h.completedMatches > 0 ? `${h.winRate}% win` : `${h.votesCast} ballots`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 rounded-full bg-[#09080B]/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            isTop3 ? vis.barClass : 'from-[#C0263D]/80 to-[#FB7185]/80'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Top Performing Communities */}
          <div className="rounded-2xl bg-[#141116]/70 backdrop-blur-xl border border-white/12 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#6D28D9]/25 border border-[#6D28D9]/45 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#A78BFA]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                    Top Communities &amp; Guilds
                  </h3>
                  <p className="text-[11px] text-[#A7A0AA] truncate">
                    Guild Wars, community XP, members &amp; discussions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('communities')}
                className="text-xs font-semibold text-[#A78BFA] hover:text-white inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>Full Table</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {sortedCommunities.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Shield className="w-7 h-7 text-[#A7A0AA] mx-auto" />
                <p className="text-xs font-semibold text-[#F5F1F2]">No matching communities</p>
                <p className="text-[11px] text-[#A7A0AA]">
                  Forge a Guild or launch a Guild War in the Clash Arena.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedCommunities.slice(0, 8).map((g, idx) => {
                  const displayRank =
                    searchQuery || communitySort !== 'powerScore' ? idx + 1 : g.rank;
                  const pct = Math.max(8, Math.round((g.powerScore / topCommunityScore) * 100));
                  const isTop3 = displayRank <= 3;
                  const vis = getRankVisuals(displayRank);

                  return (
                    <Link
                      key={g.id}
                      to={`/guilds/${g.slug}`}
                      className={`block rounded-xl p-3 transition-all border ${
                        isTop3
                          ? 'bg-white/[0.04] border-white/12 hover:border-white/25'
                          : 'bg-[#09080B]/55 border-white/[0.06] hover:border-white/16'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-7 text-sm font-bold font-mono-num shrink-0 ${
                              isTop3 ? vis.numClass : 'text-[#A7A0AA]'
                            }`}
                          >
                            #{String(displayRank).padStart(2, '0')}
                          </span>
                          <div
                            className={`w-10 h-10 rounded-xl overflow-hidden border bg-[#09080B] shrink-0 ${
                              isTop3 ? vis.ringClass : 'border-white/15'
                            }`}
                          >
                            <KageImage
                              src={g.artworkUrl}
                              alt={g.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs sm:text-sm font-bold text-[#F5F1F2] truncate">
                                {g.name}
                              </span>
                              {g.isVerified && (
                                <BadgeCheck className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-[#A7A0AA] truncate font-mono-num">
                              {g.category} · Lvl {g.communityLevel} ·{' '}
                              {formatCompactNumber(g.memberCount)} members · {g.guildWarWins}W War
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {formatCompactNumber(g.powerScore)}
                          </p>
                          <p className="text-[11px] text-[#A78BFA] font-mono-num">
                            {formatCompactNumber(g.communityXp)} XP
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 rounded-full bg-[#09080B]/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            isTop3 ? vis.barClass : 'from-[#6D28D9]/85 to-[#A78BFA]/85'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'hunters' ? (
        /* Full Hunters Leaderboard: Top-3 Glass Podium + Dense SaaS Table */
        <div className="relative space-y-5">
          {sortedHunters.length === 0 ? (
            <div className="rounded-2xl bg-[#141116]/70 backdrop-blur-xl border border-white/10 p-10 text-center space-y-2">
              <Swords className="w-8 h-8 text-[#FB7185] mx-auto" />
              <p className="text-sm font-semibold text-[#F5F1F2]">No Clash Hunters matched</p>
              <p className="text-xs text-[#A7A0AA]">
                Clear your search or start a duel in the Clash Arena.
              </p>
            </div>
          ) : (
            <>
              {/* Podium Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sortedHunters.slice(0, 3).map((h, idx) => {
                  const displayRank =
                    searchQuery || hunterSort !== 'powerScore' ? idx + 1 : h.rank;
                  const vis = getRankVisuals(displayRank);
                  const RankIcon = vis.Icon;
                  return (
                    <Link
                      key={h.uid}
                      to={`/profile/${h.username}`}
                      className={`rounded-2xl backdrop-blur-xl border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5 ${vis.cardClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-14 h-14 rounded-2xl overflow-hidden border-2 bg-[#09080B] shrink-0 ${vis.ringClass}`}
                          >
                            <KageImage
                              src={h.avatarUrl}
                              alt={h.displayName}
                              className="w-full h-full object-cover object-top"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[11px] font-bold uppercase tracking-wider font-mono-num ${vis.numClass}`}>
                              {vis.label}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <h3 className="text-base font-bold text-[#F5F1F2] truncate">
                                {h.displayName}
                              </h3>
                              <OwnerBadge role={h.role} size="xs" />
                            </div>
                            <p className="text-xs text-[#A7A0AA] truncate">
                              @{h.username} · Level {h.accountLevel}
                            </p>
                          </div>
                        </div>

                        <RankIcon className={`w-5 h-5 shrink-0 ${vis.iconClass}`} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-left">
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">Rating</p>
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {formatCompactNumber(h.powerScore)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">Record</p>
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {h.wins}W-{h.losses}L
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">Votes</p>
                          <p className="text-sm font-bold font-mono-num text-[#FB7185]">
                            {formatCompactNumber(h.votesEarned)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Ranked Table */}
              <div className="rounded-2xl bg-[#141116]/75 backdrop-blur-xl border border-white/12 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#A7A0AA]">
                        <th className="py-3.5 px-4 font-semibold">Rank</th>
                        <th className="py-3.5 px-4 font-semibold">Hunter</th>
                        <th className="py-3.5 px-4 font-semibold text-right">W · L · D</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Win %</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Votes Earned</th>
                        <th className="py-3.5 px-4 font-semibold text-right hidden sm:table-cell">
                          Edits / Cast
                        </th>
                        <th className="py-3.5 px-4 font-semibold text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-xs sm:text-sm">
                      {sortedHunters.map((h, idx) => {
                        const displayRank =
                          searchQuery || hunterSort !== 'powerScore' ? idx + 1 : h.rank;
                        const pct = Math.max(6, Math.round((h.powerScore / topHunterScore) * 100));
                        const isViewer = user?.uid === h.uid;
                        return (
                          <tr
                            key={h.uid}
                            className={`transition-colors ${
                              isViewer
                                ? 'bg-[#C0263D]/14 hover:bg-[#C0263D]/20'
                                : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono-num font-bold whitespace-nowrap">
                              <span
                                className={
                                  displayRank === 1
                                    ? 'text-amber-300'
                                    : displayRank === 2
                                      ? 'text-[#FB7185]'
                                      : displayRank === 3
                                        ? 'text-[#A78BFA]'
                                        : 'text-[#A7A0AA]'
                                }
                              >
                                #{String(displayRank).padStart(2, '0')}
                              </span>
                            </td>
                            <td className="py-3 px-4 min-w-[200px]">
                              <Link
                                to={`/profile/${h.username}`}
                                className="flex items-center gap-3 group"
                              >
                                <div className="w-9 h-9 rounded-full overflow-hidden border border-white/15 bg-[#09080B] shrink-0">
                                  <KageImage
                                    src={h.avatarUrl}
                                    alt={h.displayName}
                                    className="w-full h-full object-cover object-top"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-[#F5F1F2] group-hover:text-[#FB7185] truncate">
                                      {h.displayName}
                                    </span>
                                    <OwnerBadge role={h.role} size="xs" />
                                  </div>
                                  <p className="text-[11px] text-[#A7A0AA] truncate font-mono-num">
                                    @{h.username} · Lvl {h.accountLevel}
                                    {h.rewardsCaptured > 0 ? ` · ${h.rewardsCaptured} prizes` : ''}
                                  </p>
                                </div>
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#D8D2DC] whitespace-nowrap">
                              {h.wins}-{h.losses}-{h.draws}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#D8D2DC] whitespace-nowrap">
                              {h.completedMatches > 0 ? `${h.winRate}%` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#FB7185] whitespace-nowrap">
                              {formatCompactNumber(h.votesEarned)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#A7A0AA] hidden sm:table-cell whitespace-nowrap">
                              {h.entriesSubmitted} · {h.votesCast}
                            </td>
                            <td className="py-3 px-4 text-right min-w-[115px]">
                              <div className="inline-flex flex-col items-end gap-1 w-full">
                                <span className="font-mono-num font-bold text-[#F5F1F2]">
                                  {formatCompactNumber(h.powerScore)}
                                </span>
                                <div className="w-20 h-1 rounded-full bg-[#09080B] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#C0263D] to-[#FB7185]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Full Communities Leaderboard: Top-3 Glass Podium + Dense SaaS Table */
        <div className="relative space-y-5">
          {sortedCommunities.length === 0 ? (
            <div className="rounded-2xl bg-[#141116]/70 backdrop-blur-xl border border-white/10 p-10 text-center space-y-2">
              <Shield className="w-8 h-8 text-[#A78BFA] mx-auto" />
              <p className="text-sm font-semibold text-[#F5F1F2]">No Communities matched</p>
              <p className="text-xs text-[#A7A0AA]">
                Clear your search or forge a new Guild to compete on the global ladder.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sortedCommunities.slice(0, 3).map((g, idx) => {
                  const displayRank =
                    searchQuery || communitySort !== 'powerScore' ? idx + 1 : g.rank;
                  const vis = getRankVisuals(displayRank);
                  const RankIcon = vis.Icon;
                  return (
                    <Link
                      key={g.id}
                      to={`/guilds/${g.slug}`}
                      className={`rounded-2xl backdrop-blur-xl border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5 ${vis.cardClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-14 h-14 rounded-2xl overflow-hidden border-2 bg-[#09080B] shrink-0 ${vis.ringClass}`}
                          >
                            <KageImage
                              src={g.artworkUrl}
                              alt={g.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[11px] font-bold uppercase tracking-wider font-mono-num ${vis.numClass}`}>
                              {vis.label}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <h3 className="text-base font-bold text-[#F5F1F2] truncate">
                                {g.name}
                              </h3>
                              {g.isVerified && (
                                <BadgeCheck className="w-4 h-4 text-[#A78BFA] shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-[#A7A0AA] truncate">
                              {g.category} · Level {g.communityLevel}
                            </p>
                          </div>
                        </div>

                        <RankIcon className={`w-5 h-5 shrink-0 ${vis.iconClass}`} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-left">
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">Guild Power</p>
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {formatCompactNumber(g.powerScore)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">War Wins</p>
                          <p className="text-sm font-bold font-mono-num text-[#F5F1F2]">
                            {g.guildWarWins}W · {g.winRate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[#A7A0AA]">Members</p>
                          <p className="text-sm font-bold font-mono-num text-[#A78BFA]">
                            {formatCompactNumber(g.memberCount)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-[#141116]/75 backdrop-blur-xl border border-white/12 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#A7A0AA]">
                        <th className="py-3.5 px-4 font-semibold">Rank</th>
                        <th className="py-3.5 px-4 font-semibold">Community / Guild</th>
                        <th className="py-3.5 px-4 font-semibold text-right">War W-L</th>
                        <th className="py-3.5 px-4 font-semibold text-right">War Votes</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Members</th>
                        <th className="py-3.5 px-4 font-semibold text-right hidden sm:table-cell">
                          Community XP
                        </th>
                        <th className="py-3.5 px-4 font-semibold text-right">Guild Power</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-xs sm:text-sm">
                      {sortedCommunities.map((g, idx) => {
                        const displayRank =
                          searchQuery || communitySort !== 'powerScore' ? idx + 1 : g.rank;
                        const pct = Math.max(
                          6,
                          Math.round((g.powerScore / topCommunityScore) * 100)
                        );
                        return (
                          <tr key={g.id} className="hover:bg-white/[0.04] transition-colors">
                            <td className="py-3 px-4 font-mono-num font-bold whitespace-nowrap">
                              <span
                                className={
                                  displayRank === 1
                                    ? 'text-amber-300'
                                    : displayRank === 2
                                      ? 'text-[#FB7185]'
                                      : displayRank === 3
                                        ? 'text-[#A78BFA]'
                                        : 'text-[#A7A0AA]'
                                }
                              >
                                #{String(displayRank).padStart(2, '0')}
                              </span>
                            </td>
                            <td className="py-3 px-4 min-w-[210px]">
                              <Link
                                to={`/guilds/${g.slug}`}
                                className="flex items-center gap-3 group"
                              >
                                <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/15 bg-[#09080B] shrink-0">
                                  <KageImage
                                    src={g.artworkUrl}
                                    alt={g.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-[#F5F1F2] group-hover:text-[#A78BFA] truncate">
                                      {g.name}
                                    </span>
                                    {g.isVerified && (
                                      <BadgeCheck className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[#A7A0AA] truncate font-mono-num">
                                    {g.category} · Lvl {g.communityLevel} ·{' '}
                                    {formatCompactNumber(g.discussionCount)} posts
                                  </p>
                                </div>
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#D8D2DC] whitespace-nowrap">
                              {g.guildWarWins}-{g.guildWarLosses}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#FB7185] whitespace-nowrap">
                              {formatCompactNumber(g.warVotesEarned)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#D8D2DC] whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 justify-end">
                                <Users className="w-3.5 h-3.5 text-[#A7A0AA]" />
                                {formatCompactNumber(g.memberCount)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#A78BFA] hidden sm:table-cell whitespace-nowrap">
                              {formatCompactNumber(g.communityXp)} XP
                            </td>
                            <td className="py-3 px-4 text-right min-w-[115px]">
                              <div className="inline-flex flex-col items-end gap-1 w-full">
                                <span className="font-mono-num font-bold text-[#F5F1F2]">
                                  {formatCompactNumber(g.powerScore)}
                                </span>
                                <div className="w-20 h-1 rounded-full bg-[#09080B] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#6D28D9] to-[#A78BFA]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Formula & Integrity Footer */}
      <div className="relative pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#A7A0AA]">
        <div className="flex items-center gap-2">
          <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Scores aggregate verified Clash victories, arena votes, prize captures, Guild XP &amp;
            community activity in real time.
          </span>
        </div>
        {data?.generatedAt && (
          <span className="font-mono-num shrink-0">
            Synced {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </section>
  );
};
