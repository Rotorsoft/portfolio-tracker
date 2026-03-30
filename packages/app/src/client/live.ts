/** Live quote and portfolio computation utilities */

export type LiveQuote = { price: number; previousClose: number };
export type LiveQuotes = Record<string, LiveQuote>;

export type LiveAlert = { text: string; bullish: boolean };

/** Detect intraday alerts: MA crossovers and big daily moves */
export function getLiveAlerts(
  livePrice: number,
  prevDailyClose: number,
  previousClose: number,
  ma50: number,
  ma200: number,
  bigMoveThreshold = 3
): LiveAlert[] {
  const alerts: LiveAlert[] = [];
  if (livePrice <= 0 || prevDailyClose <= 0) return alerts;

  // MA crossovers: previous daily close was on one side, live price on the other
  if (ma50 > 0) {
    if (prevDailyClose <= ma50 && livePrice > ma50) alerts.push({ text: "Crossed above MA50", bullish: true });
    if (prevDailyClose >= ma50 && livePrice < ma50) alerts.push({ text: "Crossed below MA50", bullish: false });
  }
  if (ma200 > 0) {
    if (prevDailyClose <= ma200 && livePrice > ma200) alerts.push({ text: "Crossed above MA200", bullish: true });
    if (prevDailyClose >= ma200 && livePrice < ma200) alerts.push({ text: "Crossed below MA200", bullish: false });
  }

  // Big intraday swing
  if (previousClose > 0) {
    const dayPct = ((livePrice - previousClose) / previousClose) * 100;
    if (Math.abs(dayPct) >= bigMoveThreshold) {
      alerts.push({ text: `${dayPct > 0 ? "Up" : "Down"} ${Math.abs(dayPct).toFixed(1)}% today`, bullish: dayPct > 0 });
    }
  }

  return alerts;
}

/** Get live price for a ticker, falling back to stored price */
export function getLivePrice(quotes: LiveQuotes | undefined, ticker: string, fallback: number): number {
  return quotes?.[ticker]?.price ?? fallback;
}

/** Compute live portfolio totals */
export function livePortfolioTotals(
  positions: { ticker: string; totalShares: number; currentPrice: number; avgCostBasis: number }[],
  quotes: LiveQuotes | undefined
) {
  let totalValue = 0;
  let totalCost = 0;
  for (const p of positions) {
    const price = getLivePrice(quotes, p.ticker, p.currentPrice);
    totalValue += p.totalShares * price;
    totalCost += p.totalShares * p.avgCostBasis;
  }
  const gl = totalValue - totalCost;
  const glPct = totalCost > 0 ? (gl / totalCost) * 100 : 0;
  return { totalValue, totalCost, gl, glPct };
}

/** Compute live position G/L */
export function livePositionGL(
  shares: number,
  avgCost: number,
  livePrice: number
) {
  const mv = shares * livePrice;
  const cost = shares * avgCost;
  const gl = mv - cost;
  const glPct = cost > 0 ? (gl / cost) * 100 : 0;
  return { mv, gl, glPct };
}

/** Daily change from live quote */
export function liveDayChange(
  livePrice: number,
  previousClose: number
) {
  if (previousClose <= 0 || livePrice <= 0) return { chg: 0, pct: 0 };
  const chg = livePrice - previousClose;
  const pct = (chg / previousClose) * 100;
  return { chg, pct };
}

/** Volatility color class */
export function volatilityColor(v: number) {
  return v > 30 ? "text-red-400" : v > 15 ? "text-amber-400" : "text-emerald-400";
}

/** Entry grade badge color */
export function gradeColor(grade: string) {
  return grade === "A" ? "bg-emerald-500/20 text-emerald-400" :
    grade === "B" ? "bg-emerald-500/10 text-emerald-400" :
    grade === "C" ? "bg-amber-500/10 text-amber-400" :
    grade === "D" ? "bg-red-500/10 text-red-400" :
    "bg-red-500/20 text-red-400";
}

/** Signal badge color */
export function signalColor(signal: string | undefined) {
  return signal === "strong buy" ? "bg-emerald-500/20 text-emerald-400" :
    signal === "buy" ? "bg-emerald-500/10 text-emerald-400" :
    signal === "strong sell" ? "bg-red-500/20 text-red-400" :
    signal === "sell" ? "bg-red-500/10 text-red-400" :
    "bg-gray-700 text-gray-400";
}

/** Format dividend yield */
export function fmtDividendYield(dy: number | null | undefined) {
  return dy != null ? `${(dy * 100).toFixed(2)}%` : "—";
}

/** Last settled trading date (after market close ~4pm ET / 21:00 UTC) */
export function lastTradingDate(): string {
  const now = new Date();
  const d = new Date(now);
  if (now.getUTCHours() < 21) d.setDate(d.getDate() - 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  if (day === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/** Whether US market is currently open (Mon-Fri, 9:30am-4pm ET) */
export function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  // Convert to ET using Intl to handle DST automatically
  const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = etTime.split(":").map(Number);
  const etMin = h * 60 + m;
  return etMin >= 9 * 60 + 30 && etMin < 16 * 60;
}

/** Format a relative time like "2h 15m", "4m 15s", or "30s" */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Time until market close (4pm ET), or time until market open (9:30am ET) */
export function marketCountdown(): { label: string; ms: number } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = etStr.split(":").map(Number);
  const etMin = h * 60 + m;
  const day = now.getDay();
  const weekend = day === 0 || day === 6;

  if (!weekend && etMin >= 9 * 60 + 30 && etMin < 16 * 60) {
    // Market open — time until 4pm ET
    const closeMin = 16 * 60;
    return { label: "closes in", ms: (closeMin - etMin) * 60_000 };
  }

  // Market closed — time until next 9:30am ET
  let daysUntil = 0;
  if (weekend) {
    daysUntil = day === 0 ? 1 : 2; // Sun→Mon, Sat→Mon
  } else if (etMin >= 16 * 60) {
    daysUntil = day === 5 ? 3 : 1; // Fri after close→Mon, else next day
  }
  // minutes until 9:30 on the target day
  const minUntilOpen = daysUntil * 24 * 60 + (9 * 60 + 30 - etMin);
  return { label: "opens in", ms: Math.max(0, minUntilOpen * 60_000) };
}

/** Check which tickers need daily price backfill */
export function pendingBackfillTickers(
  tickers: { symbol: string; lastPriceDate: string }[],
  positionTickers: string[]
): string[] {
  const target = lastTradingDate();
  return positionTickers.filter((sym) => {
    const t = tickers.find((td) => td.symbol === sym);
    return !t || t.lastPriceDate < target;
  });
}
