/**
 * Technical indicator calculations.
 * All functions are pure — take price arrays, return computed values.
 */

type Price = { date: string; open: number; high: number; low: number; close: number; volume: number };

/** Simple Moving Average over the last N prices */
export function sma(prices: Price[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p.close, 0) / period;
}

/** SMA at a specific date (using prices up to and including that date) */
export function smaAtDate(prices: Price[], period: number, date: string): number {
  const upTo = prices.filter((p) => p.date <= date);
  return sma(upTo, period);
}

/** Bollinger Bands (20-day SMA ± 2 std dev) */
export function bollingerBands(prices: Price[], period = 20, stdDevMultiplier = 2) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean = slice.reduce((s, p) => s + p.close, 0) / period;
  const variance = slice.reduce((s, p) => s + (p.close - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return { upper: mean + stdDevMultiplier * stdDev, middle: mean, lower: mean - stdDevMultiplier * stdDev };
}

/** 30-day rolling volatility (annualized std dev of daily returns) */
export function volatility30d(prices: Price[]): number {
  if (prices.length < 31) return 0;
  const recent = prices.slice(-31);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].close > 0) {
      returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close);
    }
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualized %
}

/** 52-week (or available period) high and low */
export function yearlyRange(prices: Price[]): { high: number; low: number } {
  const year = prices.slice(-252);
  if (year.length === 0) return { high: 0, low: 0 };
  return {
    high: year.reduce((m, p) => Math.max(m, p.high), 0),
    low: year.reduce((m, p) => Math.min(m, p.low), Infinity),
  };
}

/** Where a price sits in the yearly range (0% = at low, 100% = at high) */
export function yearlyRangePosition(price: number, high: number, low: number): number {
  const range = high - low;
  if (range <= 0) return 50;
  return Math.max(0, Math.min(100, ((price - low) / range) * 100));
}

/** Signal based on MA crossover and price position */
export function computeSignal(close: number, ma50: number, ma200: number): "buy" | "sell" | "hold" {
  if (ma50 === 0 || ma200 === 0) return "hold";
  // Price above both MAs + golden cross = buy
  if (close > ma50 && ma50 > ma200) return "buy";
  // Price below both MAs + death cross = sell
  if (close < ma50 && ma50 < ma200) return "sell";
  return "hold";
}

/** Max drawdown from peak since a given date */
export function maxDrawdownSince(prices: Price[], sinceDate: string): number {
  const relevant = prices.filter((p) => p.date >= sinceDate);
  if (relevant.length === 0) return 0;
  let peak = relevant[0].close;
  let maxDd = 0;
  for (const p of relevant) {
    if (p.close > peak) peak = p.close;
    const dd = peak > 0 ? ((peak - p.close) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

/** Count trading days where price was below a given level */
export function countDaysBelow(prices: Price[], level: number, sinceDate: string): number {
  return prices.filter((p) => p.date >= sinceDate && p.close < level).length;
}

/** Compute MA series for chart overlay */
export function maSeries(prices: Price[], period: number): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, p) => s + p.close, 0) / period;
    result.push({ date: prices[i].date, value: Math.round(avg * 100) / 100 });
  }
  return result;
}

/** Compute Bollinger Bands series for chart overlay */
export function bollingerSeries(prices: Price[], period = 20, mult = 2): Array<{ date: string; upper: number; middle: number; lower: number }> {
  const result: Array<{ date: string; upper: number; middle: number; lower: number }> = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, p) => s + p.close, 0) / period;
    const variance = slice.reduce((s, p) => s + (p.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    result.push({
      date: prices[i].date,
      upper: Math.round((mean + mult * stdDev) * 100) / 100,
      middle: Math.round(mean * 100) / 100,
      lower: Math.round((mean - mult * stdDev) * 100) / 100,
    });
  }
  return result;
}
