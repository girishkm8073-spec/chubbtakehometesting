const ISO_DATE_LENGTH = 10;

/** ISO yyyy-mm-dd for today + offset (negative = past), computed in local time like a user's browser. */
export function dateDaysFromToday(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, ISO_DATE_LENGTH);
}
