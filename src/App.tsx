/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SoundProvider } from './context/SoundContext';
import { AppShell } from './components/AppShell';
import { CinematicIntro, IntroCompletionPayload } from './components/CinematicIntro';
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordAndVerifyPage,
  SignUpPage,
  WelcomePage,
} from './pages/AuthPages';
import { HomePage } from './pages/HomePage';
import { AnimeFiltersPage, CategoryDetailPage } from './pages/CategoryAndFiltersPage';
import { AnimeDetailPage } from './pages/AnimeDetailPage';
import { PulsePage } from './pages/PulsePage';
import { CommunityChatRoomPage, GuildDetailPage, GuildsPage } from './pages/GuildsPages';
import { VoiceRoomActivePage, VoiceRoomsPage } from './pages/VoicePages';
import { ClashPage } from './pages/ClashPage';
import { ProfilePage } from './pages/ProfilePage';
import {
  InboxPage,
  NotificationsPage,
  SearchPage,
  SettingsPage,
} from './pages/SocialAndUtilityPages';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { InkverseDashboardPage } from './pages/InkverseDashboardPage';
import { InkverseBrowsePage } from './pages/InkverseBrowsePage';
import { InkverseMangaDetailPage } from './pages/InkverseMangaDetailPage';
import { InkverseReaderPage } from './pages/InkverseReaderPage';
import { InkverseMyMangaPage } from './pages/InkverseMyMangaPage';
import { InkverseUploadStudioPage } from './pages/InkverseUploadStudioPage';
import { KageLogo } from './components/KageBrand';
import { GlobalLeaderboard } from './components/GlobalLeaderboard';

const INTRO_SESSION_KEY = 'kage_zenitsu_intro_session_v3';

class KageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#141116] border border-white/12 p-6 text-center space-y-4">
            <div className="flex justify-center">
              <KageLogo size="lg" className="items-center" />
            </div>
            <p className="text-xs text-[#A7A0AA]">
              Something interrupted this realm: {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
            >
              Return to Realms
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#C0263D] border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) {
    const dest = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(dest)}`} replace />;
  }
  return <>{children}</>;
};

const KageExperience: React.FC = () => {
  const { settings } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(INTRO_SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [manualReplay, setManualReplay] = useState(false);

  const handleCompleteIntro = (payload?: IntroCompletionPayload) => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
    const wasManualReplay = manualReplay;
    setShowIntro(false);
    setManualReplay(false);

    // Smoothly land on KAGE homepage when completing or skipping the initial opening screen
    if ((payload?.skipped || !wasManualReplay) && location.pathname.startsWith('/auth')) {
      return;
    }
    if (!wasManualReplay && location.pathname === '/realms') {
      navigate('/', { replace: true });
    }
  };

  const shouldPlayIntro = manualReplay || (showIntro && !settings?.skipIntroAlways);

  return (
    <>
      {shouldPlayIntro && (
        <CinematicIntro
          reducedMotion={Boolean(settings?.reducedMotion)}
          isManualReplay={manualReplay}
          onComplete={handleCompleteIntro}
        />
      )}

      <AppShell onReplayIntro={() => setManualReplay(true)}>
        <Routes>
          {/* Auth Routes */}
          <Route path="/auth/welcome" element={<WelcomePage />} />
          <Route path="/auth/signup" element={<SignUpPage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordAndVerifyPage />} />
          <Route path="/auth/verify-email" element={<ResetPasswordAndVerifyPage />} />

          {/* Discovery & Anime Realms */}
          <Route path="/" element={<HomePage onReplayIntro={() => setManualReplay(true)} />} />
          <Route path="/realms" element={<HomePage onReplayIntro={() => setManualReplay(true)} />} />
          <Route path="/filters" element={<AnimeFiltersPage />} />
          <Route path="/realms/genre/:genre" element={<CategoryDetailPage />} />
          <Route path="/category/:genre" element={<CategoryDetailPage />} />
          <Route path="/anime/:malId" element={<AnimeDetailPage />} />

          {/* KAGE — INKVERSE Manga Platform */}
          <Route path="/inkverse" element={<InkverseDashboardPage />} />
          <Route path="/inkverse/browse" element={<InkverseBrowsePage />} />
          <Route path="/inkverse/manga/:mangaId" element={<InkverseMangaDetailPage />} />
          <Route path="/inkverse/read/:mangaId/:chapterId" element={<InkverseReaderPage />} />
          <Route path="/inkverse/my-manga" element={<InkverseMyMangaPage />} />
          <Route path="/inkverse/studio" element={<InkverseUploadStudioPage />} />

          {/* Fandom Feed, Guilds, Community Chat Rooms, Live Voice & Clash */}
          <Route path="/pulse" element={<PulsePage />} />
          <Route path="/pulse/:postId" element={<PulsePage />} />
          <Route path="/guilds" element={<GuildsPage />} />
          <Route path="/guilds/:slug" element={<GuildDetailPage />} />
          <Route path="/guilds/:slug/rooms/:roomSlug" element={<CommunityChatRoomPage />} />
          <Route path="/voice" element={<VoiceRoomsPage />} />
          <Route path="/voice/:id" element={<VoiceRoomActivePage />} />
          <Route path="/clash" element={<ClashPage />} />
          <Route path="/clash/:clashId" element={<ClashPage />} />
          <Route
            path="/leaderboard"
            element={
              <div className="pt-1 pb-6">
                <GlobalLeaderboard defaultTab="split" limit={40} />
              </div>
            }
          />

          {/* Profiles & Search */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/search" element={<SearchPage />} />

          {/* Protected Social & Account Routes */}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox/:conversationId"
            element={
              <ProtectedRoute>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage onReplayIntro={() => setManualReplay(true)} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPanelPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </>
  );
};

const shouldUseHashRouter =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('.github.io') ||
    window.location.hostname === 'kage.thecrexora.com' ||
    import.meta.env.VITE_USE_HASH_ROUTER === 'true');

const AppRouter: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  shouldUseHashRouter ? <HashRouter>{children}</HashRouter> : <BrowserRouter>{children}</BrowserRouter>;

export default function App() {
  return (
    <KageErrorBoundary>
      <AppRouter>
        <AuthProvider>
          <SoundProvider>
            <KageExperience />
          </SoundProvider>
        </AuthProvider>
      </AppRouter>
    </KageErrorBoundary>
  );
}
