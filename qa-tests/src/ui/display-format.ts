/**
 * Independent re-implementation of how the UI is *supposed* to display values (en-US, USD).
 * Used to build expected strings — never imported from the app, so a formatting bug in the app
 * is caught instead of copied.
 */
const LOCALE = 'en-US';
const CURRENCY = 'USD';

export function expectedCurrency(amount: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(amount);
}

/** Calendar date as the user entered it (yyyy-mm-dd) — formatted without any timezone shift. */
export function expectedShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function expectedLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
