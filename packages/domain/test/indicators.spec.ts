import { describe, it, expect } from "vitest";
import {
  sma, smaAtDate, ema, rsi, rsiAtDate, macd, roc, volumeRatio,
  bollingerBands, bollingerPosition, bollingerPositionAtDate,
  computeCompositeSignal, signalExplanation, computeEntryGrade, gradeExplanation,
  volatility30d, yearlyRange, yearlyRangePosition, maxDrawdownSince, countDaysBelow,
  maSeries, bollingerSeries,
} from "../src/indicators.js";

type Price = { date: string; open: number; high: number; low: number; close: number; volume: number };

/** Generate synthetic prices with a trend */
function genPrices(count: number, startPrice = 100, dailyDrift = 0, volatility = 0.5, startDate = "2024-01-01"): Price[] {
  const prices: Price[] = [];
  let price = startPrice;
  const start = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const change = dailyDrift + (Math.sin(i * 0.3) * volatility);
    price = Math.max(1, price + change);
    prices.push({
      date: d.toISOString().split("T")[0],
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000000 + Math.sin(i) * 200000,
    });
  }
  return prices;
}

/** Generate a clear uptrend */
function uptrendPrices(count = 300): Price[] {
  return genPrices(count, 50, 0.3, 0.2);
}

/** Generate a clear downtrend */
function downtrendPrices(count = 300): Price[] {
  return genPrices(count, 150, -0.3, 0.2);
}

/** Generate flat/sideways prices */
function flatPrices(count = 300): Price[] {
  return genPrices(count, 100, 0, 0.5);
}

describe("SMA", () => {
  it("computes simple moving average", () => {
    const prices = genPrices(20);
    const result = sma(prices, 10);
    expect(result).toBeGreaterThan(0);
  });

  it("returns 0 for insufficient data", () => {
    expect(sma(genPrices(5), 10)).toBe(0);
  });

  it("smaAtDate filters to date", () => {
    const prices = genPrices(50);
    const midDate = prices[24].date;
    const result = smaAtDate(prices, 10, midDate);
    const manual = sma(prices.slice(0, 25), 10);
    expect(result).toBeCloseTo(manual);
  });
});

describe("EMA", () => {
  it("computes exponential moving average", () => {
    const prices = genPrices(30);
    const result = ema(prices, 10);
    expect(result).toBeGreaterThan(0);
  });

  it("returns 0 for insufficient data", () => {
    expect(ema(genPrices(5), 10)).toBe(0);
  });

  it("EMA reacts faster to recent prices than SMA", () => {
    const prices = genPrices(50, 100, 0, 0.1);
    // Add a spike
    const spiked = [...prices];
    spiked.push({ ...prices[prices.length - 1], close: 200, date: "2024-03-01" });
    const emaVal = ema(spiked, 10);
    const smaVal = sma(spiked, 10);
    // EMA should be closer to the spike than SMA
    expect(emaVal).toBeGreaterThan(smaVal);
  });
});

describe("RSI", () => {
  it("returns ~50 for insufficient data", () => {
    expect(rsi(genPrices(5))).toBe(50);
  });

  it("returns high RSI for strong uptrend", () => {
    const prices = uptrendPrices(50);
    expect(rsi(prices)).toBeGreaterThan(60);
  });

  it("returns low RSI for strong downtrend", () => {
    const prices = downtrendPrices(50);
    expect(rsi(prices)).toBeLessThan(40);
  });

  it("handles all-gains case (avgLoss=0)", () => {
    const prices: Price[] = [];
    for (let i = 0; i < 20; i++) {
      prices.push({ date: `2024-01-${String(i + 1).padStart(2, "0")}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000000 });
    }
    expect(rsi(prices)).toBe(100);
  });

  it("rsiAtDate filters by date", () => {
    const prices = genPrices(50);
    const midDate = prices[29].date;
    const result = rsiAtDate(prices, 14, midDate);
    const manual = rsi(prices.filter((p) => p.date <= midDate));
    expect(result).toBeCloseTo(manual);
  });

  it("computes Wilder smoothing for extended data", () => {
    // Ensure the smoothing loop runs (prices.length > period + 1)
    const prices = genPrices(100, 100, 0.1, 1);
    const result = rsi(prices);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

describe("MACD", () => {
  it("returns zeros for insufficient data", () => {
    const result = macd(genPrices(10));
    expect(result).toEqual({ macd: 0, signal: 0, histogram: 0 });
  });

  it("computes MACD for sufficient data", () => {
    const result = macd(uptrendPrices(100));
    expect(result.macd).not.toBe(0);
    expect(result.signal).not.toBe(0);
    expect(result.histogram).toBe(result.macd - result.signal);
  });

  it("positive histogram in uptrend", () => {
    const result = macd(uptrendPrices(100));
    expect(result.histogram).toBeGreaterThan(0);
  });

  it("histogram is non-zero for trending data", () => {
    const result = macd(downtrendPrices(100));
    expect(result.histogram).not.toBe(0);
  });
});

describe("ROC", () => {
  it("returns 0 for insufficient data", () => {
    expect(roc(genPrices(5), 10)).toBe(0);
  });

  it("positive in uptrend", () => {
    expect(roc(uptrendPrices(50), 10)).toBeGreaterThan(0);
  });

  it("negative in downtrend", () => {
    expect(roc(downtrendPrices(50), 10)).toBeLessThan(0);
  });
});

describe("Volume Ratio", () => {
  it("returns 1 for insufficient data", () => {
    expect(volumeRatio(genPrices(5))).toBe(1);
  });

  it("computes ratio for sufficient data", () => {
    const result = volumeRatio(genPrices(30));
    expect(result).toBeGreaterThan(0);
  });

  it("returns 1 when avg volume is 0", () => {
    const prices = genPrices(25);
    prices.forEach((p) => (p.volume = 0));
    expect(volumeRatio(prices)).toBe(1);
  });
});

describe("Bollinger Bands", () => {
  it("returns null for insufficient data", () => {
    expect(bollingerBands(genPrices(10))).toBeNull();
  });

  it("computes bands for sufficient data", () => {
    const bands = bollingerBands(genPrices(30));
    expect(bands).not.toBeNull();
    expect(bands!.upper).toBeGreaterThan(bands!.middle);
    expect(bands!.middle).toBeGreaterThan(bands!.lower);
  });

  it("bollingerPosition at lower band returns ~0", () => {
    const bands = { upper: 110, lower: 90 };
    expect(bollingerPosition(90, bands)).toBe(0);
  });

  it("bollingerPosition at upper band returns ~1", () => {
    const bands = { upper: 110, lower: 90 };
    expect(bollingerPosition(110, bands)).toBe(1);
  });

  it("bollingerPosition at middle returns ~0.5", () => {
    const bands = { upper: 110, lower: 90 };
    expect(bollingerPosition(100, bands)).toBeCloseTo(0.5);
  });

  it("bollingerPosition handles zero range", () => {
    expect(bollingerPosition(100, { upper: 100, lower: 100 })).toBe(0.5);
  });

  it("bollingerPosition clamps to [0,1]", () => {
    const bands = { upper: 110, lower: 90 };
    expect(bollingerPosition(80, bands)).toBe(0);
    expect(bollingerPosition(120, bands)).toBe(1);
  });

  it("bollingerPositionAtDate filters by date", () => {
    const prices = genPrices(50);
    const midDate = prices[29].date;
    const result = bollingerPositionAtDate(prices, 20, midDate);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("bollingerPositionAtDate returns 0.5 for insufficient data", () => {
    const prices = genPrices(10);
    expect(bollingerPositionAtDate(prices, 20, prices[5].date)).toBe(0.5);
  });
});

describe("Composite Signal", () => {
  it("returns a valid signal for uptrend", () => {
    const result = computeCompositeSignal(uptrendPrices());
    expect(["strong buy", "buy", "hold", "sell", "strong sell"]).toContain(result.signal);
    expect(typeof result.score).toBe("number");
  });

  it("returns a valid signal for downtrend", () => {
    const result = computeCompositeSignal(downtrendPrices());
    expect(["strong buy", "buy", "hold", "sell", "strong sell"]).toContain(result.signal);
  });

  it("returns a valid signal for flat market", () => {
    const result = computeCompositeSignal(flatPrices());
    expect(["strong buy", "buy", "hold", "sell", "strong sell"]).toContain(result.signal);
  });

  it("includes all component scores", () => {
    const result = computeCompositeSignal(uptrendPrices());
    expect(result.components.rsi).toBeDefined();
    expect(result.components.macd).toBeDefined();
    expect(result.components.bollinger).toBeDefined();
    expect(result.components.maTrend).toBeDefined();
    expect(result.components.momentum).toBeDefined();
    expect(result.components.volume).toBeDefined();
  });

  it("score is weighted sum of components", () => {
    const result = computeCompositeSignal(uptrendPrices());
    const c = result.components;
    const expected = c.rsi.score * 0.20 + c.macd.score * 0.25 + c.bollinger.score * 0.15 +
      c.maTrend.score * 0.20 + c.momentum.score * 0.10 + c.volume.score * 0.10;
    expect(result.score).toBeCloseTo(Math.round(expected * 100) / 100);
  });

  it("strong buy threshold >= 1.2", () => {
    // Create extremely bullish data
    const prices = genPrices(300, 20, 0.5, 0.05);
    const result = computeCompositeSignal(prices);
    if (result.score >= 1.2) {
      expect(result.signal).toBe("strong buy");
    }
  });

  it("strong sell threshold <= -1.2", () => {
    const prices = genPrices(300, 200, -0.5, 0.05);
    const result = computeCompositeSignal(prices);
    if (result.score <= -1.2) {
      expect(result.signal).toBe("strong sell");
    }
  });
});

describe("Signal Explanation", () => {
  it("generates explanation for bullish signal", () => {
    const result = computeCompositeSignal(uptrendPrices());
    const text = signalExplanation(result.components);
    expect(text).toContain("RSI");
    expect(text).toContain("MACD");
    expect(text.length).toBeGreaterThan(10);
  });

  it("generates explanation for bearish signal", () => {
    const result = computeCompositeSignal(downtrendPrices());
    const text = signalExplanation(result.components);
    expect(text).toContain("RSI");
    expect(text.length).toBeGreaterThan(10);
  });

  it("covers all RSI levels", () => {
    // Oversold
    expect(signalExplanation({ rsi: { value: 25, score: 2 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } })).toContain("oversold");
    // Near oversold
    expect(signalExplanation({ rsi: { value: 35, score: 1 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } })).toContain("near oversold");
    // Overbought
    expect(signalExplanation({ rsi: { value: 80, score: -2 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } })).toContain("overbought");
    // Near overbought
    expect(signalExplanation({ rsi: { value: 65, score: -1 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } })).toContain("near overbought");
    // Neutral
    expect(signalExplanation({ rsi: { value: 50, score: 0 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } })).toContain("neutral");
  });

  it("covers MACD bullish/bearish/neutral", () => {
    const base = { rsi: { value: 50, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } };
    expect(signalExplanation({ ...base, macd: { value: 1, histogram: 0.5, score: 1 } })).toContain("bullish");
    expect(signalExplanation({ ...base, macd: { value: -1, histogram: -0.5, score: -1 } })).toContain("bearish");
    expect(signalExplanation({ ...base, macd: { value: 0, histogram: 0, score: 0 } })).toContain("MACD neutral");
  });

  it("covers Bollinger bands positions", () => {
    const base = { rsi: { value: 50, score: 0 }, macd: { value: 0, histogram: 0, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 }, momentum: { roc10: 0, roc20: 0, score: 0 }, volume: { ratio: 1, score: 0 } };
    expect(signalExplanation({ ...base, bollinger: { position: 0.01, score: 2 } })).toContain("Below Bollinger lower");
    expect(signalExplanation({ ...base, bollinger: { position: 0.15, score: 1 } })).toContain("Near Bollinger support");
    expect(signalExplanation({ ...base, bollinger: { position: 0.99, score: -2 } })).toContain("Above Bollinger upper");
    expect(signalExplanation({ ...base, bollinger: { position: 0.85, score: -1 } })).toContain("Near Bollinger resistance");
  });

  it("covers momentum and volume", () => {
    const base = { rsi: { value: 50, score: 0 }, macd: { value: 0, histogram: 0, score: 0 }, bollinger: { position: 0.5, score: 0 }, maTrend: { ma50: 0, ma200: 0, crossover: "converging", score: 0 } };
    expect(signalExplanation({ ...base, momentum: { roc10: 5, roc20: 5, score: 2 }, volume: { ratio: 2, score: 1 } })).toContain("Momentum positive");
    expect(signalExplanation({ ...base, momentum: { roc10: -5, roc20: -5, score: -2 }, volume: { ratio: 2, score: -1 } })).toContain("Momentum negative");
    expect(signalExplanation({ ...base, momentum: { roc10: -5, roc20: -5, score: -2 }, volume: { ratio: 2, score: -1 } })).toContain("diverging");
  });
});

describe("Entry Grade", () => {
  it("grades a good entry in uptrend dip", () => {
    const prices = uptrendPrices();
    // Entry at a local dip in uptrend
    const entryDate = prices[100].date;
    const entryPrice = prices[100].close;
    const result = computeEntryGrade(prices, entryPrice, entryDate);
    expect(result.grade).toBeDefined();
    expect(["A", "B", "C", "D", "F"]).toContain(result.grade);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("grades a bad entry at top of downtrend", () => {
    const prices = downtrendPrices();
    const entryDate = prices[50].date;
    const entryPrice = prices[50].close;
    const result = computeEntryGrade(prices, entryPrice, entryDate);
    expect(result.total).toBeLessThan(70);
  });

  it("returns all factor scores", () => {
    const prices = genPrices(200);
    const entryDate = prices[100].date;
    const result = computeEntryGrade(prices, prices[100].close, entryDate);
    expect(result.trendScore).toBeGreaterThanOrEqual(0);
    expect(result.valueScore).toBeGreaterThanOrEqual(0);
    expect(result.timingScore).toBeGreaterThanOrEqual(0);
  });

  it("handles entry with moderate data", () => {
    const prices = genPrices(200);
    const entryDate = prices[100].date;
    const result = computeEntryGrade(prices, prices[100].close, entryDate);
    expect(result.valueScore).toBeGreaterThanOrEqual(0);
  });

  it("handles entry with very few prior prices", () => {
    const prices = genPrices(25);
    const entryDate = prices[20].date;
    const result = computeEntryGrade(prices, prices[20].close, entryDate);
    expect(result.grade).toBeDefined();
  });
});

describe("Grade Explanation", () => {
  it("explains good grade", () => {
    const factors = { trendScore: 80, valueScore: 75, timingScore: 90, total: 80, grade: "A" as const };
    const text = gradeExplanation(factors);
    expect(text).toContain("Grade A");
    expect(text).toContain("buying with the trend");
    expect(text).toContain("good value entry");
    expect(text).toContain("well-timed pullback");
  });

  it("explains poor grade", () => {
    const factors = { trendScore: 20, valueScore: 20, timingScore: 15, total: 18, grade: "F" as const };
    const text = gradeExplanation(factors);
    expect(text).toContain("Grade F");
    expect(text).toContain("against the trend");
    expect(text).toContain("extended from support");
    expect(text).toContain("bought near peak");
  });

  it("explains neutral grade", () => {
    const factors = { trendScore: 50, valueScore: 50, timingScore: 50, total: 50, grade: "C" as const };
    const text = gradeExplanation(factors);
    expect(text).toContain("trend neutral");
  });
});

describe("Volatility", () => {
  it("returns 0 for insufficient data", () => {
    expect(volatility30d(genPrices(20))).toBe(0);
  });

  it("computes annualized volatility", () => {
    const result = volatility30d(genPrices(60));
    expect(result).toBeGreaterThan(0);
  });

  it("higher volatility for wider swings", () => {
    const calm = volatility30d(genPrices(60, 100, 0, 0.1));
    const wild = volatility30d(genPrices(60, 100, 0, 5));
    expect(wild).toBeGreaterThan(calm);
  });

  it("handles zero close prices", () => {
    const prices = genPrices(35);
    prices[prices.length - 2].close = 0;
    // Should not crash, may return 0 or skip that return
    const result = volatility30d(prices);
    expect(typeof result).toBe("number");
  });
});

describe("Yearly Range", () => {
  it("computes high and low", () => {
    const prices = genPrices(100);
    const { high, low } = yearlyRange(prices);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("returns zeros for empty array", () => {
    const { high, low } = yearlyRange([]);
    expect(high).toBe(0);
    expect(low).toBe(0);
  });

  it("uses last 252 days", () => {
    const prices = genPrices(300);
    const { high } = yearlyRange(prices);
    // High should come from the last 252 prices
    const last252 = prices.slice(-252);
    const expectedHigh = Math.max(...last252.map((p) => p.high));
    expect(high).toBe(expectedHigh);
  });
});

describe("Yearly Range Position", () => {
  it("returns 0% at low", () => {
    expect(yearlyRangePosition(90, 110, 90)).toBe(0);
  });

  it("returns 100% at high", () => {
    expect(yearlyRangePosition(110, 110, 90)).toBe(100);
  });

  it("returns 50% at midpoint", () => {
    expect(yearlyRangePosition(100, 110, 90)).toBe(50);
  });

  it("returns 50 for zero range", () => {
    expect(yearlyRangePosition(100, 100, 100)).toBe(50);
  });

  it("clamps to [0, 100]", () => {
    expect(yearlyRangePosition(80, 110, 90)).toBe(0);
    expect(yearlyRangePosition(120, 110, 90)).toBe(100);
  });
});

describe("Max Drawdown", () => {
  it("returns 0 for no data after date", () => {
    expect(maxDrawdownSince(genPrices(10), "2025-01-01")).toBe(0);
  });

  it("computes drawdown in downtrend", () => {
    const prices = downtrendPrices(50);
    const dd = maxDrawdownSince(prices, prices[0].date);
    expect(dd).toBeGreaterThan(0);
  });

  it("returns 0 for pure uptrend", () => {
    // Strictly monotonic increasing
    const prices: Price[] = [];
    for (let i = 0; i < 30; i++) {
      prices.push({ date: `2024-01-${String(i + 1).padStart(2, "0")}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000000 });
    }
    expect(maxDrawdownSince(prices, prices[0].date)).toBe(0);
  });
});

describe("Count Days Below", () => {
  it("counts days below a level", () => {
    const prices = genPrices(30, 100, 0, 2);
    const count = countDaysBelow(prices, 100, prices[0].date);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(30);
  });

  it("returns 0 when all above", () => {
    const prices: Price[] = [];
    for (let i = 0; i < 10; i++) {
      prices.push({ date: `2024-01-${String(i + 1).padStart(2, "0")}`, open: 200, high: 210, low: 190, close: 200, volume: 1000000 });
    }
    expect(countDaysBelow(prices, 100, prices[0].date)).toBe(0);
  });
});

describe("MA Series", () => {
  it("generates correct number of points", () => {
    const prices = genPrices(30);
    const series = maSeries(prices, 10);
    expect(series).toHaveLength(21); // 30 - 10 + 1
  });

  it("each point has date and value", () => {
    const prices = genPrices(20);
    const series = maSeries(prices, 5);
    for (const point of series) {
      expect(point.date).toBeDefined();
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it("returns empty for insufficient data", () => {
    expect(maSeries(genPrices(5), 10)).toHaveLength(0);
  });
});

describe("Bollinger Series", () => {
  it("generates correct number of points", () => {
    const prices = genPrices(30);
    const series = bollingerSeries(prices);
    expect(series).toHaveLength(11); // 30 - 20 + 1
  });

  it("upper > middle > lower at each point", () => {
    const prices = genPrices(50);
    const series = bollingerSeries(prices);
    for (const point of series) {
      expect(point.upper).toBeGreaterThanOrEqual(point.middle);
      expect(point.middle).toBeGreaterThanOrEqual(point.lower);
    }
  });

  it("returns empty for insufficient data", () => {
    expect(bollingerSeries(genPrices(10))).toHaveLength(0);
  });
});
