const FIVE_HOUR_CEILING_MINUTES = 6 * 60; // Codex's short window is ~300 min; allow slack
const SEVEN_DAY_FLOOR_MINUTES = 6 * 24 * 60; // its weekly window is 10080 min; allow slack

/** A short label for a rate-limit window's duration, for compact display. */
export function describeWindow(windowMinutes: number): string {
  if (windowMinutes <= FIVE_HOUR_CEILING_MINUTES) return '5h';
  if (windowMinutes >= SEVEN_DAY_FLOOR_MINUTES) return '7d';
  return `${Math.round(windowMinutes / 60)}h`;
}
