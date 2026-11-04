import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import { KAGE_ASSETS } from '../lib/assets';
import { KageLogo } from '../components/KageBrand';

const DARK_INPUT_CLASS =
  'w-full min-h-[44px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-sm text-[#F5F1F2] placeholder:text-[#A7A0AA]/50 focus:outline-none focus:border-[#C0263D] [&:-webkit-autofill]:[-webkit-text-fill-color:#F5F1F2] [&:-webkit-autofill]:[box-shadow:0_0_0px_1000px_#09080B_inset] [&:-webkit-autofill]:[transition:background-color_5000s_ease-in-out_0s]';

function mapAuthError(err: any): string {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Incorrect email/username or password.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 8 characters long.';
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return 'Sign-in popup was closed before completing authentication.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Please allow popups and try again.';
  }
  if (
    code.includes('token-service-api-has-not-been-used') ||
    msg.includes('securetoken.googleapis.com') ||
    msg.includes('identitytoolkit.googleapis.com')
  ) {
    return 'External Firebase token service is disabled for this project. Please sign in with your KAGE username/email and password.';
  }
  return msg || 'Authentication failed. Please try again.';
}

const AuthLayout: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2] grid lg:grid-cols-2">
      {/* Left Desktop Cinematic Showcase */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden border-r border-white/8">
        <img
          src={KAGE_ASSETS.soloHeroHome}
          alt="KAGE Anime Universe"
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/55 to-[#09080B]/70" />

        <div className="relative z-10">
          <Link to="/" className="inline-block">
            <KageLogo size="lg" showSubtitle />
          </Link>
        </div>

        <div className="relative z-10 max-w-md space-y-3">
          <h2 className="font-display text-3xl font-bold leading-tight text-[#F5F1F2]">
            Enter the Guilds. Unseal Your Realm.
          </h2>
          <p className="text-sm text-[#A7A0AA] leading-relaxed">
            Explore anime realms, calibrate your personal taste engine, join fandom guilds, and gather in live WebRTC voice rooms.
          </p>
        </div>
      </div>

      {/* Right Form Column */}
      <div className="flex flex-col justify-start lg:justify-center px-5 pt-6 pb-10 sm:px-10 sm:py-10 max-w-md w-full mx-auto">
        <div className="mb-5 flex items-center justify-between">
          <Link
            to="/"
            className="min-h-[44px] inline-flex items-center gap-2 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Realms</span>
          </Link>

          <Link to="/" className="lg:hidden">
            <KageLogo size="sm" />
          </Link>
        </div>

        <div className="rounded-2xl bg-[#141116] border border-white/10 p-6 sm:p-7">
          <h1 className="text-2xl font-bold text-[#F5F1F2] tracking-tight">{title}</h1>
          <p className="text-xs text-[#A7A0AA] mt-1 mb-5">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
};

function sanitizeRedirectTarget(raw: string | null): string {
  if (!raw) return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/auth')) {
    return '/';
  }
  return trimmed;
}

export const WelcomePage: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirectTarget(searchParams.get('redirect'));
  const redirectQuery =
    redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome to KAGE"
      subtitle="Join the Anime Universe to track anime, forge guilds, and enter live voice & video rooms."
    >
      <div className="space-y-3">
        <Link
          to={`/auth/signup${redirectQuery}`}
          className="w-full min-h-[46px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-sm font-semibold flex items-center justify-center transition-colors"
        >
          Create Account
        </Link>

        <Link
          to={`/auth/login${redirectQuery}`}
          className="w-full min-h-[46px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/15 text-[#F5F1F2] text-sm font-semibold flex items-center justify-center transition-colors"
        >
          Sign In with Username or Email
        </Link>

        <div className="flex items-center gap-3 py-1.5">
          <div className="h-[1px] flex-1 bg-white/10" />
          <span className="text-[11px] text-[#A7A0AA]">OR</span>
          <div className="h-[1px] flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full min-h-[44px] px-4 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/12 text-[#F5F1F2] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <ShieldCheck className="w-4 h-4 text-[#6D28D9]" />
          <span>{busy ? 'Connecting...' : 'Continue with Google'}</span>
        </button>

        {error && <p className="text-xs text-rose-400 pt-2">{error}</p>}
      </div>
    </AuthLayout>
  );
};

export const SignUpPage: React.FC = () => {
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirectTarget(searchParams.get('redirect'));
  const redirectQuery =
    redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : '';

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    const clean = username.trim().replace(/^@+/, '');
    if (!clean) {
      setUsernameCheck({ status: 'idle' });
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(clean)) {
      setUsernameCheck({
        status: 'invalid',
        message: '3–24 chars (letters, numbers, _, ., -)',
      });
      return;
    }

    let cancelled = false;
    setUsernameCheck({ status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ available: boolean; reason?: string }>(
          '/api/auth/check-username',
          {
            method: 'POST',
            body: JSON.stringify({ username: clean }),
          }
        );
        if (cancelled) return;
        if (res.available) {
          setUsernameCheck({ status: 'available', message: 'Available' });
        } else {
          setUsernameCheck({
            status: 'taken',
            message: res.reason || 'Already claimed',
          });
        }
      } catch {
        if (!cancelled) setUsernameCheck({ status: 'idle' });
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanUsername = username.trim().replace(/^@+/, '');

    if (cleanName.length < 1 || cleanName.length > 50) {
      setError('Please enter your name (1–50 characters).');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(cleanUsername)) {
      setError('Username must be 3–24 characters (letters, numbers, _, ., -).');
      return;
    }
    if (usernameCheck.status === 'taken') {
      setError(usernameCheck.message || 'That username is already claimed in KAGE.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await signUpWithEmail({
        name: cleanName,
        username: cleanUsername,
        email,
        password,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Forge Your Account"
      subtitle="Enter your name and claim your unique @username across KAGE."
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Name</label>
          <input
            type="text"
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Levi Ackerman"
            autoComplete="name"
            className={DARK_INPUT_CLASS}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label className="block text-xs font-medium text-[#A7A0AA]">Username</label>
            {usernameCheck.status === 'checking' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#A7A0AA]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking...
              </span>
            )}
            {usernameCheck.status === 'available' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                Available
              </span>
            )}
            {(usernameCheck.status === 'taken' || usernameCheck.status === 'invalid') && (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                <XCircle className="w-3 h-3" />
                {usernameCheck.message}
              </span>
            )}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#A7A0AA]">
              @
            </span>
            <input
              type="text"
              required
              maxLength={24}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@+/, ''))}
              placeholder="levi"
              autoComplete="username"
              className={`${DARK_INPUT_CLASS} pl-8`}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hunter@kage.gg"
            autoComplete="email"
            className={DARK_INPUT_CLASS}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              className={`${DARK_INPUT_CLASS} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-1 top-1 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
            Confirm Password
          </label>
          <input
            type={showPass ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            className={DARK_INPUT_CLASS}
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            <p>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-[46px] rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          {busy ? 'Creating Account...' : 'Sign Up'}
        </button>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full min-h-[44px] rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/12 text-[#F5F1F2] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-[#6D28D9]" />
          <span>Sign Up Instantly with Google</span>
        </button>

        <p className="text-center text-xs text-[#A7A0AA] pt-2">
          Already have an account?{' '}
          <Link
            to={`/auth/login${redirectQuery}`}
            className="text-[#C0263D] font-semibold hover:underline"
          >
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export const LoginPage: React.FC = () => {
  const { loginWithIdentifier, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirectTarget(searchParams.get('redirect'));
  const redirectQuery =
    redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginWithIdentifier(identifier, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Sign in with your KAGE username, email, or Google account."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
            Email or Username
          </label>
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or @username"
            autoComplete="username"
            className={DARK_INPUT_CLASS}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-[#A7A0AA]">Password</label>
            <Link
              to="/auth/forgot-password"
              className="text-xs text-[#C0263D] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={`${DARK_INPUT_CLASS} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-1 top-1 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            <p>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-[46px] rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          {busy ? 'Signing In...' : 'Log In'}
        </button>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full min-h-[44px] rounded-xl bg-[#F5F1F2] hover:bg-white text-[#09080B] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-[#C0263D]" />
          <span>Continue with Google</span>
        </button>

        <p className="text-center text-xs text-[#A7A0AA] pt-2">
          New to KAGE?{' '}
          <Link
            to={`/auth/signup${redirectQuery}`}
            className="text-[#C0263D] font-semibold hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your account email and we will send a secure password reset link."
    >
      {sent ? (
        <div className="space-y-4 text-center py-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <p className="text-sm font-semibold">Reset Link Dispatched</p>
          <p className="text-xs text-[#A7A0AA]">
            Check <span className="text-[#F5F1F2]">{email}</span> for instructions to reset your password.
          </p>
          <Link
            to="/auth/login"
            className="inline-flex min-h-[44px] px-5 items-center justify-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
          >
            Return to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Account Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hunter@kage.gg"
              className={DARK_INPUT_CLASS}
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[46px] rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
          >
            {busy ? 'Sending...' : 'Send Reset Link'}
          </button>

          <p className="text-center text-xs text-[#A7A0AA]">
            <Link to="/auth/login" className="hover:text-[#F5F1F2]">
              Back to Log In
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

export const ResetPasswordAndVerifyPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, resendVerificationEmail } = useAuth();
  const oobCode = searchParams.get('oobCode') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus('Your password has been updated. You can now sign in.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerify = async () => {
    setBusy(true);
    setError('');
    try {
      await resendVerificationEmail();
      setStatus('Verification email sent. Check your inbox.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={oobCode ? 'Set New Password' : 'Email Verification'}
      subtitle={
        oobCode
          ? 'Choose a strong new password for your KAGE account.'
          : 'Verify your email address to secure your KAGE profile.'
      }
    >
      {oobCode ? (
        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={DARK_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className={DARK_INPUT_CLASS}
            />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          {status && <p className="text-xs text-emerald-400">{status}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[46px] rounded-xl bg-[#C0263D] text-white text-sm font-semibold cursor-pointer"
          >
            {busy ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      ) : (
        <div className="space-y-4 text-center py-2">
          <Mail className="w-10 h-10 text-[#6D28D9] mx-auto" />
          <p className="text-sm text-[#F5F1F2]">
            {user?.emailVerified
              ? 'Your email address is verified.'
              : 'Your email verification status can be refreshed or re-sent below.'}
          </p>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          {status && <p className="text-xs text-emerald-400">{status}</p>}
          {!user?.emailVerified && user && (
            <button
              type="button"
              onClick={handleResendVerify}
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-[#6D28D9] text-white text-xs font-semibold cursor-pointer"
            >
              {busy ? 'Sending...' : 'Resend Verification Email'}
            </button>
          )}
          <Link
            to="/"
            className="inline-flex min-h-[44px] px-5 items-center justify-center rounded-xl bg-[#09080B] border border-white/12 text-xs font-medium text-[#F5F1F2]"
          >
            Continue to Realms
          </Link>
        </div>
      )}
    </AuthLayout>
  );
};
