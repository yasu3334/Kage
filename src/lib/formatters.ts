/**
 * Formats engagement & social counters into compact lowercase human notation:
 * - < 1,000         -> exact integer ("0", "42", "999")
 * - 1,000..999,999  -> thousands with 'k' ("1k", "1.5k", "10k", "12.4k")
 * - 1,000,000+      -> millions with 'm' ("1m", "2.5m")
 * - 1,000,000,000+  -> billions with 'b' ("1b")
 */
export function formatCompactNumber(value?: number | string | null): string {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return parsed < 0 && Number.isFinite(parsed)
      ? `-${formatCompactNumber(Math.abs(parsed))}`
      : '0';
  }

  const n = Math.floor(parsed);
  if (n < 1_000) {
    return String(n);
  }

  if (n < 1_000_000) {
    const tenths = Math.floor(n / 100);
    const formatted = (tenths / 10).toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }

  if (n < 1_000_000_000) {
    const tenths = Math.floor(n / 100_000);
    const formatted = (tenths / 10).toFixed(1).replace(/\.0$/, '');
    return `${formatted}m`;
  }

  const tenths = Math.floor(n / 100_000_000);
  const formatted = (tenths / 10).toFixed(1).replace(/\.0$/, '');
  return `${formatted}b`;
}
