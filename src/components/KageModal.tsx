import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Reference-counted body scroll lock so stacked or sequential modals never leave the page frozen
// and background scrolling never competes with modal form scrolling on Android, iOS, tablet, or desktop.
let activeModalLockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';
let savedBodyPaddingRight = '';

function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (activeModalLockCount === 0) {
    const body = document.body;
    const html = document.documentElement;
    savedBodyOverflow = body.style.overflow;
    savedHtmlOverflow = html.style.overflow;
    savedBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }
  activeModalLockCount += 1;

  let released = false;
  return () => {
    if (released || typeof document === 'undefined') return;
    released = true;
    activeModalLockCount = Math.max(0, activeModalLockCount - 1);
    if (activeModalLockCount === 0) {
      document.body.style.overflow = savedBodyOverflow;
      document.documentElement.style.overflow = savedHtmlOverflow;
      document.body.style.paddingRight = savedBodyPaddingRight;
    }
  };
}

export interface KageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  maxWidthClass?: string;
  /**
   * When true, uses near-full-screen vertical height on compact mobile screens
   * while remaining horizontally & vertically centered on tablet/desktop.
   */
  tallForm?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Reusable viewport-anchored KAGE Modal rendered via Portal directly on document.body.
 * - Immune to parent CSS transforms, overflow clipping, or z-index stacking traps
 * - Horizontally & vertically centered within the true visible dynamic viewport (100dvh)
 * - Safe-area aware on iOS/Android
 * - Locks background page scroll while allowing smooth, independent internal touch/wheel scrolling
 */
export const KageModal: React.FC<KageModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  tallForm = false,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const releaseScroll = acquireBodyScrollLock();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      releaseScroll();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-black/82 backdrop-blur-sm flex items-center justify-center overflow-hidden px-3 sm:px-5 kage-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${maxWidthClass} ${
          tallForm ? 'kage-modal-panel-tall' : 'kage-modal-panel'
        } rounded-2xl bg-[#141116] border border-white/14 text-[#F5F1F2] shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden kage-modal-enter`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-[#141116]">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-bold text-[#F5F1F2] leading-snug">
              {title}
            </div>
            {subtitle && (
              <div className="text-xs text-[#A7A0AA] mt-0.5 leading-snug">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A7A0AA] hover:text-white hover:bg-white/6 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Independent Smooth Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain kage-thin-scrollbar kage-modal-body px-4 sm:px-5 py-4">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-white/10 bg-[#141116] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export interface KageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Reusable viewport-anchored right-side sheet/drawer rendered via Portal on document.body
 * with background scroll lock and smooth independent internal scrolling.
 */
export const KageDrawer: React.FC<KageDrawerProps> = ({
  isOpen,
  onClose,
  title,
  maxWidthClass = 'max-w-xl',
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const releaseScroll = acquireBodyScrollLock();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      releaseScroll();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-black/78 backdrop-blur-sm flex justify-end overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${maxWidthClass} kage-drawer-panel bg-[#09080B] border-l border-white/12 flex flex-col overflow-hidden shadow-[-20px_0_64px_rgba(0,0,0,0.85)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#09080B]">
          <div className="text-sm font-bold text-[#F5F1F2]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A7A0AA] hover:text-white hover:bg-white/6 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain kage-thin-scrollbar kage-modal-body p-4 space-y-5">
          {children}
        </div>

        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
