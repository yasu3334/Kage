import React, { useState } from 'react';
import { Flag, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { KageModal } from './KageModal';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'discussion' | 'comment' | 'community' | 'user' | 'voice_room' | 'clash' | 'message';
  targetId: string | number;
  targetLabel?: string;
}

const REPORT_REASONS = [
  'Unmarked major spoilers',
  'Harassment or hate speech',
  'Spam or self-promotion',
  'Copyrighted or pirated stream link',
  'Inappropriate or off-topic content',
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel,
}) => {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId: String(targetId),
          reason,
          details,
        }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KageModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <span className="inline-flex items-center gap-2">
          <Flag className="w-4 h-4 text-[#C0263D] shrink-0" />
          <span>Report {targetLabel || targetType}</span>
        </span>
      }
      footer={
        done ? undefined : (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs font-medium text-[#A7A0AA] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="kage-report-form"
              disabled={submitting}
              className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        )
      }
    >
      {done ? (
        <div className="py-6 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <p className="text-sm font-semibold">Report received by KAGE Moderators</p>
          <p className="text-xs text-[#A7A0AA]">
            Thank you for keeping the Anime Universe safe and spoiler-respectful.
          </p>
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setDetails('');
              onClose();
            }}
            className="mt-2 min-h-[44px] px-6 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      ) : (
        <form id="kage-report-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#A7A0AA]">Select Reason</label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    reason === r
                      ? 'border-[#C0263D] bg-[#C0263D]/10 text-[#F5F1F2]'
                      : 'border-white/8 bg-[#09080B] text-[#A7A0AA]'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-[#C0263D]"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Additional context (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Provide details for moderators..."
              className="w-full rounded-xl bg-[#09080B] border border-white/10 px-3 py-2 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </form>
      )}
    </KageModal>
  );
};
