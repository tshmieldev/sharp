const dash = '—';

/** Provider prices arrive per token; people reason in dollars per million. */
export function price(perToken: number | undefined): string {
  if (perToken === undefined) return dash;
  if (perToken === 0) return 'Free';
  const perMillion = perToken * 1e6;
  const digits = perMillion < 1 ? 3 : perMillion < 100 ? 2 : 0;
  return `$${perMillion.toFixed(digits).replace(/\.?0+$/, '')}`;
}

export function context(tokens: number | undefined): string {
  if (!tokens) return dash;
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(tokens % 1e6 === 0 ? 0 : 2)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export const speed = (value: number | undefined) =>
  value === undefined ? dash : `${Math.round(value)} tok/s`;
export const latency = (value: number | undefined) =>
  value === undefined ? dash : `${value < 10 ? value.toFixed(2) : Math.round(value)}s`;
export const uptime = (value: number | undefined) =>
  value === undefined ? dash : `${value.toFixed(value >= 99.95 ? 0 : 1)}%`;
export const kilobytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024).toLocaleString()} KB`;

/** Coarse on purpose: this is an estimate, not a stopwatch. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} h`;
}

export function buildTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
