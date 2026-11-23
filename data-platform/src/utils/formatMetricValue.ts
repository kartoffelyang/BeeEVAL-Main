export function formatMetricValue(kind: string, value: number | null, language: string): string {
  if (value == null) return '—';
  if (kind === 'percent') return `${(value * 100).toFixed(0)}%`;
  if (kind === 'latency') return `${value.toFixed(0)} ms`;
  if (kind === 'speed') return `${value.toFixed(1)} ${language.startsWith('zh') ? '字/秒' : 'chars/s'}`;
  return value.toFixed(2);
}
