/**
 * Technical indicator calculations.
 * All functions are pure — take price arrays, return computed values.
 */

type Price = { date: string; open: number; high: number; low: number; close: number; volume: number };

// ── Building Blocks ──

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

/** Exponential Moving Average — returns final value */
export function ema(prices: Price[], period: number): number {
  if (prices.length < period) return 0;
  const k = 2 / (period + 1);
  let avg = prices.slice(0, period).reduce((s, p) => s + p.close, 0) / period;
  for (let i = period; i < prices.length; i++) {
    avg = prices[i].close * k + avg * (1 - k);
  }
  return avg;
}

/** EMA series — returns value at each point after warm-up */
function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let avg = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const result = [avg];
  for (let i = period; i < values.length; i++) {
    avg = values[i] * k + avg * (1 - k);
    result.push(avg);
  }
  return result;
}

// ── Core Indicators ──

/** RSI (Relative Strength Index) — Wilder's smoothed, 14-day default */
export function rsi(prices: Price[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** RSI at a specific date */
export function rsiAtDate(prices: Price[], period: number, date: string): number {
  const upTo = prices.filter((p) => p.date <= date);
  return rsi(upTo, period);
}

/** MACD (12/26/9 default) — returns line, signal, histogram */
export function macd(prices: Price[], fast = 12, slow = 26, signalPeriod = 9): { macd: number; signal: number; histogram: number } {
  if (prices.length < slow + signalPeriod) return { macd: 0, signal: 0, histogram: 0 };
  const closes = prices.map((p) => p.close);
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  // Align: fastEma starts at index (fast-1), slowEma at (slow-1)
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  if (macdLine.length < signalPeriod) return { macd: 0, signal: 0, histogram: 0 };
  const signalLine = emaSeries(macdLine, signalPeriod);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

/** Rate of Change (%) over N periods */
export function roc(prices: Price[], period: number): number {
  if (prices.length <= period) return 0;
  const prev = prices[prices.length - 1 - period].close;
  const curr = prices[prices.length - 1].close;
  return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
}

/** Volume ratio: current volume / 20-day avg volume */
export function volumeRatio(prices: Price[], period = 20): number {
  if (prices.length < period + 1) return 1;
  const avgVol = prices.slice(-period - 1, -1).reduce((s, p) => s + p.volume, 0) / period;
  return avgVol > 0 ? prices[prices.length - 1].volume / avgVol : 1;
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

/** Where close sits in Bollinger bands: 0 = at/below lower, 1 = at/above upper */
export function bollingerPosition(close: number, bands: { upper: number; lower: number }): number {
  const range = bands.upper - bands.lower;
  if (range <= 0) return 0.5;
  return Math.max(0, Math.min(1, (close - bands.lower) / range));
}

/** Bollinger position at a specific date */
export function bollingerPositionAtDate(prices: Price[], period: number, date: string): number {
  const upTo = prices.filter((p) => p.date <= date);
  const bands = bollingerBands(upTo, period);
  if (!bands) return 0.5;
  const close = upTo[upTo.length - 1]?.close ?? 0;
  return bollingerPosition(close, bands);
}

// ── Composite Signal ──

export type SignalType = "strong buy" | "buy" | "hold" | "sell" | "strong sell";

export type SignalComponents = {
  rsi: { value: number; score: number };
  macd: { value: number; histogram: number; score: number };
  bollinger: { position: number; score: number };
  maTrend: { ma50: number; ma200: number; crossover: string; score: number };
  momentum: { roc10: number; roc20: number; score: number };
  volume: { ratio: number; score: number };
};

export function computeCompositeSignal(prices: Price[]): { signal: SignalType; score: number; components: SignalComponents } {
  const close = prices[prices.length - 1]?.close ?? 0;
  const prevClose = prices.length >= 2 ? prices[prices.length - 2].close : close;
  const priceRising = close >= prevClose;

  // RSI (weight 20%)
  const rsiVal = rsi(prices);
  const rsiScore = rsiVal < 30 ? 2 : rsiVal < 40 ? 1 : rsiVal > 70 ? -2 : rsiVal > 60 ? -1 : 0;

  // MACD (weight 25%)
  const macdVal = macd(prices);
  const prevMacd = prices.length > 1 ? macd(prices.slice(0, -1)) : macdVal;
  const histRising = macdVal.histogram > prevMacd.histogram;
  const macdScore =
    macdVal.macd > 0 && macdVal.histogram > 0 && histRising ? 2 :
    macdVal.histogram > 0 ? 1 :
    macdVal.macd < 0 && macdVal.histogram < 0 && !histRising ? -2 :
    macdVal.histogram < 0 ? -1 : 0;

  // Bollinger (weight 15%)
  const bands = bollingerBands(prices);
  const bbPos = bands ? bollingerPosition(close, bands) : 0.5;
  const bbScore = bbPos < 0.05 ? 2 : bbPos < 0.25 ? 1 : bbPos > 0.95 ? -2 : bbPos > 0.75 ? -1 : 0;

  // MA Trend (weight 20%)
  const ma50Val = sma(prices, 50);
  const ma200Val = sma(prices, 200);
  const goldenCross = ma50Val > ma200Val && ma200Val > 0;
  const deathCross = ma50Val < ma200Val && ma200Val > 0;
  const belowMa50 = close < ma50Val * 0.98;
  const crossover = goldenCross ? (belowMa50 ? "golden cross (dip)" : "golden cross") : deathCross ? (close > ma50Val * 1.02 ? "death cross (rally)" : "death cross") : "converging";
  const maScore = belowMa50 && goldenCross ? 2 : goldenCross ? 1 : close > ma50Val * 1.02 && deathCross ? -2 : deathCross ? -1 : 0;

  // Momentum (weight 10%)
  const roc10 = roc(prices, 10);
  const roc20 = roc(prices, 20);
  const momScore = roc10 > 3 && roc20 > 3 ? 2 : roc10 > 0 && roc20 > 0 ? 1 : roc10 < -3 && roc20 < -3 ? -2 : roc10 < 0 && roc20 < 0 ? -1 : 0;

  // Volume (weight 10%) — confirmation modifier
  const volR = volumeRatio(prices);
  const volScore = volR > 1.5 ? (priceRising ? 1 : -1) : volR < 0.5 ? 0 : 0;

  // Composite
  const composite = rsiScore * 0.20 + macdScore * 0.25 + bbScore * 0.15 + maScore * 0.20 + momScore * 0.10 + volScore * 0.10;

  const signal: SignalType =
    composite >= 1.2 ? "strong buy" :
    composite >= 0.4 ? "buy" :
    composite <= -1.2 ? "strong sell" :
    composite <= -0.4 ? "sell" : "hold";

  return {
    signal,
    score: Math.round(composite * 100) / 100,
    components: {
      rsi: { value: Math.round(rsiVal * 10) / 10, score: rsiScore },
      macd: { value: Math.round(macdVal.macd * 100) / 100, histogram: Math.round(macdVal.histogram * 100) / 100, score: macdScore },
      bollinger: { position: Math.round(bbPos * 100) / 100, score: bbScore },
      maTrend: { ma50: Math.round(ma50Val * 100) / 100, ma200: Math.round(ma200Val * 100) / 100, crossover, score: maScore },
      momentum: { roc10: Math.round(roc10 * 10) / 10, roc20: Math.round(roc20 * 10) / 10, score: momScore },
      volume: { ratio: Math.round(volR * 100) / 100, score: volScore },
    },
  };
}

/** Describe the signal reasoning for UI tooltips */
export function signalExplanation(components: SignalComponents): string {
  const parts: string[] = [];
  const c = components;

  // RSI
  if (c.rsi.score === 2) parts.push(`RSI ${c.rsi.value} — oversold`);
  else if (c.rsi.score === 1) parts.push(`RSI ${c.rsi.value} — near oversold`);
  else if (c.rsi.score === -2) parts.push(`RSI ${c.rsi.value} — overbought`);
  else if (c.rsi.score === -1) parts.push(`RSI ${c.rsi.value} — near overbought`);
  else parts.push(`RSI ${c.rsi.value} — neutral`);

  // MACD
  if (c.macd.score >= 1) parts.push(`MACD bullish (histogram ${c.macd.histogram > 0 ? "+" : ""}${c.macd.histogram})`);
  else if (c.macd.score <= -1) parts.push(`MACD bearish (histogram ${c.macd.histogram})`);
  else parts.push("MACD neutral");

  // Bollinger
  if (c.bollinger.score === 2) parts.push("Below Bollinger lower band");
  else if (c.bollinger.score === 1) parts.push("Near Bollinger support");
  else if (c.bollinger.score === -2) parts.push("Above Bollinger upper band");
  else if (c.bollinger.score === -1) parts.push("Near Bollinger resistance");

  // MA trend
  parts.push(`MA: ${c.maTrend.crossover}`);

  // Momentum
  if (c.momentum.score >= 1) parts.push(`Momentum positive (10d ${c.momentum.roc10}%, 20d ${c.momentum.roc20}%)`);
  else if (c.momentum.score <= -1) parts.push(`Momentum negative (10d ${c.momentum.roc10}%, 20d ${c.momentum.roc20}%)`);

  // Volume
  if (c.volume.score !== 0) parts.push(`Volume ${c.volume.ratio}x avg (${c.volume.score > 0 ? "confirming" : "diverging"})`);

  return parts.join(". ");
}

// ── Entry Grading ──

export type EntryGrade = "A" | "B" | "C" | "D" | "F";
export type EntryFactors = {
  rsiScore: number;       // 0-100
  bollingerScore: number; // 0-100
  maTrendScore: number;   // 0-100
  timingScore: number;    // 0-100 (price range position)
  volumeScore: number;    // 0-100
  total: number;          // weighted 0-100
  grade: EntryGrade;
};

export function computeEntryGrade(prices: Price[], entryPrice: number, entryDate: string, entryVolume?: number): EntryFactors {
  const upTo = prices.filter((p) => p.date <= entryDate);

  // RSI at entry (25%)
  const rsiVal = rsi(upTo);
  const rsiGrade = rsiVal < 30 ? 100 : rsiVal < 50 ? 80 - (rsiVal - 30) * 1.5 : rsiVal < 70 ? 50 - (rsiVal - 50) * 1.5 : 0;

  // Bollinger position at entry (20%)
  const bbPos = bollingerPositionAtDate(prices, 20, entryDate);
  const bbGrade = (1 - bbPos) * 100; // lower = better for buying

  // MA trend at entry (20%)
  const ma50 = smaAtDate(prices, 50, entryDate);
  const ma200 = smaAtDate(prices, 200, entryDate);
  const golden = ma50 > ma200 && ma200 > 0;
  const death = ma50 < ma200 && ma200 > 0;
  const belowMa50 = entryPrice < ma50 * 0.98;
  const maTrendGrade = golden && belowMa50 ? 100 : golden ? 70 : !golden && !death ? 50 : death && entryPrice < ma50 ? 30 : 0;

  // Timing score — price vs period range (20%)
  const relevant = prices.filter((p) => p.date >= entryDate);
  const periodWithEntry = [...upTo.slice(-20), ...relevant.slice(0, 20)]; // context around entry
  const low = periodWithEntry.reduce((m, p) => Math.min(m, p.low), Infinity);
  const high = periodWithEntry.reduce((m, p) => Math.max(m, p.high), 0);
  const range = high - low;
  const timingGrade = range > 0 ? Math.max(0, Math.min(100, 100 - ((entryPrice - low) / range) * 100)) : 50;

  // Volume confirmation (15%)
  const avgVol = upTo.length >= 21 ? upTo.slice(-21, -1).reduce((s, p) => s + p.volume, 0) / 20 : 0;
  const entryDayVol = entryVolume ?? (upTo[upTo.length - 1]?.volume ?? 0);
  const volRatio = avgVol > 0 ? entryDayVol / avgVol : 1;
  // High volume + bullish context = good, high volume + bearish = bad
  const bullishContext = rsiVal < 50 && (golden || (!golden && !death));
  const volGrade = volRatio > 1.5 ? (bullishContext ? 90 : 20) : volRatio > 0.8 ? 50 : 30;

  const total = rsiGrade * 0.25 + bbGrade * 0.20 + maTrendGrade * 0.20 + timingGrade * 0.20 + volGrade * 0.15;
  const grade: EntryGrade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";

  return {
    rsiScore: Math.round(rsiGrade),
    bollingerScore: Math.round(bbGrade * 10) / 10,
    maTrendScore: Math.round(maTrendGrade),
    timingScore: Math.round(timingGrade * 10) / 10,
    volumeScore: Math.round(volGrade),
    total: Math.round(total * 10) / 10,
    grade,
  };
}

/** Explain entry grade for tooltips */
export function gradeExplanation(factors: EntryFactors): string {
  const parts: string[] = [];
  if (factors.rsiScore >= 70) parts.push("RSI was favorable at entry");
  else if (factors.rsiScore < 30) parts.push("RSI was overbought at entry");
  if (factors.maTrendScore >= 70) parts.push("uptrend confirmed");
  else if (factors.maTrendScore <= 30) parts.push("entered in downtrend");
  if (factors.timingScore >= 70) parts.push("near period low");
  else if (factors.timingScore < 30) parts.push("near period high");
  if (factors.bollingerScore >= 70) parts.push("near Bollinger support");
  else if (factors.bollingerScore < 30) parts.push("near Bollinger resistance");
  if (factors.volumeScore >= 70) parts.push("volume confirmed");
  return `Grade ${factors.grade} (${factors.total.toFixed(0)}/100): ${parts.join(", ") || "mixed signals"}`;
}

// ── Existing Utilities ──

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
