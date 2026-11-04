import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Crown, Fingerprint, MessageSquare, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { KageImage } from './KageImage';
import { resolveAssetUrl } from '../lib/assets';

export interface KageIdentitySummary {
  uid: string;
  kageId?: string | null;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  favouriteCharacter?: string | null;
  shadowLabel?: string | null;
}

export const RolePill: React.FC<{ role?: string | null }> = ({ role }) => {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wider text-amber-300 uppercase">
        <Crown className="h-2.5 w-2.5" />
        Owner
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#C0263D]/50 bg-[#C0263D]/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-rose-300 uppercase">
        <Shield className="h-2.5 w-2.5" />
        Admin
      </span>
    );
  }
  if (role === 'moderator') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-violet-300 uppercase">
        Mod
      </span>
    );
  }
  return null;
};

export const KageIdentityBadge: React.FC<{
  identity: KageIdentitySummary;
  viewerUid?: string | null;
  showIdChip?: boolean;
  compact?: boolean;
  onStartMessage?: (uid: string) => void;
}> = ({ identity, viewerUid, showIdChip = true, compact = false, onStartMessage }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const cleanUsername = (identity.username || 'hunter').replace(/^@+/, '');
  const kageCode = identity.kageId || null;

  const copyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!kageCode) return;
    try {
      await navigator.clipboard.writeText(kageCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div ref={popRef} className="relative inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/profile/${cleanUsername}`);
        }}
        className={`inline-flex items-center gap-1.5 text-left font-bold text-[#F5F1F2] transition hover:text-[#C0263D] ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        <span>@{cleanUsername}</span>
      </button>

      {identity.displayName &&
        identity.displayName.toLowerCase() !== cleanUsername.toLowerCase() &&
        !compact && (
          <span className="text-xs text-[#A7A0AA]">· {identity.displayName}</span>
        )}

      <RolePill role={identity.role} />

      {showIdChip && kageCode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          title={`Permanent KAGE ID: ${kageCode}`}
          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-[#A7A0AA] transition hover:border-[#6D28D9]/60 hover:bg-[#6D28D9]/15 hover:text-[#F5F1F2]"
        >
          <Fingerprint className="h-2.5 w-2.5 text-[#8B5CF6]" />
          <span>{kageCode}</span>
        </button>
      )}

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full left-0 z-50 mt-2 w-72 rounded-2xl border border-white/15 bg-[#141116] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)]"
        >
          <div className="flex items-center gap-3">
            <KageImage
              src={resolveAssetUrl(identity.avatarUrl || '/assets/zenitsu-avatar.png')}
              alt={cleanUsername}
              className="h-11 w-11 shrink-0 rounded-full border border-white/15 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-[#F5F1F2]">@{cleanUsername}</p>
                <RolePill role={identity.role} />
              </div>
              {identity.displayName && (
                <p className="truncate text-xs text-[#A7A0AA]">{identity.displayName}</p>
              )}
            </div>
          </div>

          {kageCode && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#09080B] px-2.5 py-2">
              <div>
                <p className="text-[9.5px] font-semibold tracking-wider text-[#A7A0AA] uppercase">
                  Permanent KAGE Account ID
                </p>
                <p className="font-mono text-xs font-bold text-[#F5F1F2]">{kageCode}</p>
              </div>
              <button
                type="button"
                onClick={copyId}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-[#F5F1F2] transition hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}

          {(identity.favouriteCharacter || identity.shadowLabel) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10.5px]">
              {identity.favouriteCharacter && (
                <span className="rounded-md border border-[#C0263D]/30 bg-[#C0263D]/10 px-2 py-0.5 text-rose-200">
                  {identity.favouriteCharacter}
                </span>
              )}
              {identity.shadowLabel && (
                <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                  {identity.shadowLabel}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(`/profile/${cleanUsername}`);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 py-2 text-xs font-semibold text-[#F5F1F2] transition hover:bg-white/10"
            >
              <User className="h-3.5 w-3.5" />
              Profile
            </button>
            {viewerUid && viewerUid !== identity.uid && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onStartMessage) {
                    onStartMessage(identity.uid);
                  } else {
                    navigate(`/inbox?with=${encodeURIComponent(identity.uid)}`);
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#C0263D] py-2 text-xs font-semibold text-white transition hover:bg-[#a81f34]"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Message
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
