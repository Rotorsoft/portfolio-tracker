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

/** Compute daily change across all positions using live vs previous close */
export function livePortfolioDayChange(
  positions: { ticker: string; totalShares: number; currentPrice: number }[],
  quotes: LiveQuotes | undefined,
  tickers: { symbol: string; previousClose: number }[] | undefined
) {
  let dayValue = 0;
  let prevValue = 0;
  for (const p of positions) {
    const lp = getLivePrice(quotes, p.ticker, p.currentPrice);
    const pc = quotes?.[p.ticker]?.previousClose ?? tickers?.find((t) => t.symbol === p.ticker)?.previousClose ?? lp;
    dayValue += p.totalShares * lp;
    prevValue += p.totalShares * pc;
  }
  const chg = dayValue - prevValue;
  const pct = prevValue > 0 ? (chg / prevValue) * 100 : 0;
  return { chg, pct };
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

/** Get the price of the most recent buy lot */
export function lastBuyPrice(lots: { type: string; transactionDate: string; price: number }[]): number {
  const buys = lots.filter((l) => l.type === "buy");
  if (buys.length === 0) return 0;
  return buys.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0].price;
}

/** Avg down scenario for a given number of additional shares */
export type AvgDownScenario = {
  addShares: number;
  addCost: number;
  newAvg: number;
  costReduction: number;
  newTotal: number;
};

/** Avg down opportunity: gap below last buy price with multiple scenarios */
export function avgDownOpportunity(
  lastBuyPrice: number,
  livePrice: number,
  avgCost: number,
  shares: number
) {
  if (lastBuyPrice <= 0 || livePrice <= 0 || livePrice >= lastBuyPrice) return null;
  const gapPct = ((livePrice - lastBuyPrice) / lastBuyPrice) * 100;

  const scenario = (addShares: number): AvgDownScenario => {
    const totalCost = avgCost * shares + livePrice * addShares;
    const totalShares = shares + addShares;
    const newAvg = totalShares > 0 ? totalCost / totalShares : 0;
    const costReduction = avgCost > 0 ? ((avgCost - newAvg) / avgCost) * 100 : 0;
    return { addShares, addCost: livePrice * addShares, newAvg, costReduction, newTotal: totalShares };
  };

  const scenarios = [
    scenario(Math.ceil(shares * 0.25)),
    scenario(Math.ceil(shares * 0.5)),
    scenario(shares),
  ];

  return { gapPct, scenarios };
}

/** Color for avg down opportunity — bigger dip = better timing = more green */
export function avgDownColor(gapPct: number, threshold = 5): string {
  const drop = Math.abs(gapPct);
  if (drop >= threshold * 2) return "text-green-300 font-bold";
  if (drop >= threshold) return "text-amber-400";
  if (drop >= threshold * 0.5) return "text-gray-500";
  return "";
}

/** Format dividend yield */
export function fmtDividendYield(dy: number | null | undefined) {
  return dy != null ? `${(dy * 100).toFixed(2)}%` : "—";
}

// Market schedule from server (unix seconds from Yahoo Finance currentTradingPeriod)
let _marketOpen: number | null = null;
let _marketClose: number | null = null;

/** Update market schedule from quoteStats (called by components that fetch stats) */
export function updateMarketSchedule(stats: { marketOpen?: number | null; marketClose?: number | null } | undefined) {
  if (!stats) return;
  if (stats.marketOpen != null) _marketOpen = stats.marketOpen;
  if (stats.marketClose != null) _marketClose = stats.marketClose;
}

/** Whether US market is currently open, based on Yahoo Finance trading period */
export function isMarketOpen(): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (_marketOpen && _marketClose) return now >= _marketOpen && now < _marketClose;
  // Fallback: basic weekday + hours check (no holiday awareness)
  return _fallbackMarketCheck(9 * 60 + 30, 16 * 60);
}

/** Whether we should poll for quotes — during market hours + 30min after close for settlement */
export function shouldPollQuotes(): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (_marketOpen && _marketClose) return now >= _marketOpen && now < _marketClose + 30 * 60;
  return _fallbackMarketCheck(9 * 60 + 30, 16 * 60 + 30);
}

/** Last settled trading date — today if market closed and settled, else previous trading day */
export function lastTradingDate(): string {
  const d = new Date();
  if (shouldPollQuotes()) d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function _fallbackMarketCheck(startMin: number, endMin: number): boolean {
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = etTime.split(":").map(Number);
  const etMin = h * 60 + m;
  return etMin >= startMin && etMin < endMin;
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

/** Time until market close or open, using server-provided trading period */
export function marketCountdown(isHoliday = false): { label: string; ms: number } {
  const nowSec = Math.floor(Date.now() / 1000);

  if (_marketOpen && _marketClose) {
    // Currently open
    if (nowSec >= _marketOpen && nowSec < _marketClose) {
      return { label: "closes in", ms: (_marketClose - nowSec) * 1000 };
    }
    // Before today's open (server has today's schedule)
    if (nowSec < _marketOpen && !isHoliday) {
      return { label: "opens in", ms: (_marketOpen - nowSec) * 1000 };
    }
  }

  // Holiday or no valid schedule — we don't know the next open
  if (isHoliday) {
    return { label: "", ms: 0 };
  }

  // Fallback: estimate next open as next weekday 9:30am ET
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const [h, m, s] = etStr.split(":").map(Number);
  const etSec = h * 3600 + m * 60 + s;
  const day = now.getDay();

  let daysUntil = 0;
  if (day === 0) daysUntil = 1;
  else if (day === 6) daysUntil = 2;
  else if (etSec >= 16 * 3600) daysUntil = day === 5 ? 3 : 1;

  const openSec = 9 * 3600 + 30 * 60;
  const secUntilOpen = daysUntil * 86400 + (openSec - etSec);
  return { label: "opens in", ms: Math.max(0, secUntilOpen * 1000) };
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
