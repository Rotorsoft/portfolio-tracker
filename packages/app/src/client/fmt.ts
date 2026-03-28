/** Format ISO date string (YYYY-MM-DD) to US format (MM/DD/YYYY) */
export function fmtDate(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

/** Short date for chart axes (MM/DD) */
export function fmtDateShort(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month/Year format for slider ticks (Jan'25) */
export function fmtMonthYear(iso: string): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]}'${y.slice(2)}`;
}
