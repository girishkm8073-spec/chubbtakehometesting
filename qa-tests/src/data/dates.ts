import { env } from '../config/env';

const MS_PER_DAY = 86_400_000;

/**
 * ISO yyyy-mm-dd for today + offset (negative = past), evaluated in TEST_TIMEZONE.
 * TEST_TIMEZONE must match the claims-service container clock (UTC for the supplied images),
 * because the server decides "future" with LocalDate.now(). Using the laptop's local zone instead
 * would make "today" a future date for the server between midnight and the UTC offset (e.g. IST 00:00–05:30).
 */
export function dateDaysFromToday(offsetDays: number): string {
  const target = new Date(Date.now() + offsetDays * MS_PER_DAY);
  // en-CA formats as yyyy-mm-dd
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.testTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}
