import { describe, it, expect } from "vitest";
import {
  getLiveAlerts, getLivePrice, livePortfolioTotals, livePortfolioDayChange,
  livePositionGL, liveDayChange, lastBuyPrice, avgDownOpportunity, avgDownColor, volatilityColor, gradeColor, signalColor,
  fmtDividendYield, lastTradingDate, pendingBackfillTickers, isMarketOpen,
  marketCountdown, fmtCountdown,
} from "../src/client/live.js";

describe("getLivePrice", () => {
  it("returns live quote price when available", () => {
    expect(getLivePrice({ AAPL: { price: 200, previousClose: 195 } }, "AAPL", 190)).toBe(200);
  });

  it("falls back to stored price", () => {
    expect(getLivePrice(undefined, "AAPL", 190)).toBe(190);
    expect(getLivePrice({}, "AAPL", 190)).toBe(190);
  });
});

describe("getLiveAlerts", () => {
  it("returns empty for no data", () => {
    expect(getLiveAlerts(0, 0, 0, 0, 0)).toEqual([]);
  });

  it("detects MA50 cross above", () => {
    const alerts = getLiveAlerts(105, 95, 100, 100, 0);
    expect(alerts.some((a) => a.text.includes("MA50") && a.bullish)).toBe(true);
  });

  it("detects MA50 cross below", () => {
    const alerts = getLiveAlerts(95, 105, 100, 100, 0);
    expect(alerts.some((a) => a.text.includes("MA50") && !a.bullish)).toBe(true);
  });

  it("detects MA200 cross above", () => {
    const alerts = getLiveAlerts(105, 95, 100, 0, 100);
    expect(alerts.some((a) => a.text.includes("MA200") && a.bullish)).toBe(true);
  });

  it("detects MA200 cross below", () => {
    const alerts = getLiveAlerts(95, 105, 100, 0, 100);
    expect(alerts.some((a) => a.text.includes("MA200") && !a.bullish)).toBe(true);
  });

  it("detects big move up", () => {
    const alerts = getLiveAlerts(110, 100, 100, 0, 0);
    expect(alerts.some((a) => a.text.includes("Up") && a.bullish)).toBe(true);
  });

  it("detects big move down", () => {
    const alerts = getLiveAlerts(90, 100, 100, 0, 0);
    expect(alerts.some((a) => a.text.includes("Down") && !a.bullish)).toBe(true);
  });

  it("no alert for small move", () => {
    const alerts = getLiveAlerts(101, 100, 100, 0, 0);
    expect(alerts.filter((a) => a.text.includes("Up") || a.text.includes("Down"))).toHaveLength(0);
  });

  it("respects custom threshold", () => {
    const alerts = getLiveAlerts(102, 100, 100, 0, 0, 1);
    expect(alerts.some((a) => a.text.includes("Up"))).toBe(true);
  });
});

describe("livePortfolioTotals", () => {
  const positions = [
    { ticker: "AAPL", totalShares: 10, currentPrice: 150, avgCostBasis: 100 },
    { ticker: "GOOG", totalShares: 5, currentPrice: 200, avgCostBasis: 180 },
  ];

  it("uses live quotes when available", () => {
    const quotes = { AAPL: { price: 160, previousClose: 150 }, GOOG: { price: 210, previousClose: 200 } };
    const result = livePortfolioTotals(positions, quotes);
    expect(result.totalValue).toBe(10 * 160 + 5 * 210);
    expect(result.totalCost).toBe(10 * 100 + 5 * 180);
    expect(result.gl).toBe(result.totalValue - result.totalCost);
  });

  it("falls back to currentPrice without quotes", () => {
    const result = livePortfolioTotals(positions, undefined);
    expect(result.totalValue).toBe(10 * 150 + 5 * 200);
  });

  it("computes glPct correctly", () => {
    const result = livePortfolioTotals(positions, undefined);
    expect(result.glPct).toBeCloseTo((result.gl / result.totalCost) * 100);
  });
});

describe("livePortfolioDayChange", () => {
  const positions = [
    { ticker: "AAPL", totalShares: 10, currentPrice: 150 },
    { ticker: "GOOG", totalShares: 5, currentPrice: 200 },
  ];

  it("computes daily change from quotes", () => {
    const quotes = { AAPL: { price: 155, previousClose: 150 }, GOOG: { price: 205, previousClose: 200 } };
    const result = livePortfolioDayChange(positions, quotes, undefined);
    expect(result.chg).toBe(10 * 5 + 5 * 5); // 75
    expect(result.pct).toBeGreaterThan(0);
  });

  it("falls back to tickers for previousClose", () => {
    const quotes = { AAPL: { price: 155, previousClose: 150 } };
    const tickers = [{ symbol: "GOOG", previousClose: 200 }];
    const result = livePortfolioDayChange(positions, quotes, tickers);
    // AAPL: (155-150)*10=50, GOOG: no quote so livePrice=200, prevClose from tickers=200, chg=0
    expect(result.chg).toBe(50);
  });

  it("returns zero change with no quotes", () => {
    const result = livePortfolioDayChange(positions, undefined, undefined);
    expect(result.chg).toBe(0);
    expect(result.pct).toBe(0);
  });
});

describe("lastBuyPrice", () => {
  it("returns price of most recent buy lot", () => {
    expect(lastBuyPrice([
      { type: "buy", transactionDate: "2024-01-15", price: 100 },
      { type: "buy", transactionDate: "2024-06-01", price: 120 },
      { type: "sell", transactionDate: "2024-07-01", price: 130 },
    ])).toBe(120);
  });

  it("returns 0 for no buy lots", () => {
    expect(lastBuyPrice([{ type: "sell", transactionDate: "2024-01-01", price: 50 }])).toBe(0);
    expect(lastBuyPrice([])).toBe(0);
  });
});

describe("avgDownOpportunity", () => {
  it("returns opportunity with scenarios when price is below last buy", () => {
    const result = avgDownOpportunity(100, 80, 90, 100);
    expect(result).not.toBeNull();
    expect(result!.gapPct).toBeCloseTo(-20);
    expect(result!.scenarios).toHaveLength(3);
    // 25% scenario: buy 25 more at 80
    expect(result!.scenarios[0].addShares).toBe(25);
    expect(result!.scenarios[0].newAvg).toBeCloseTo((90 * 100 + 80 * 25) / 125);
    // 50% scenario: buy 50 more at 80
    expect(result!.scenarios[1].addShares).toBe(50);
    // 100% scenario: buy 100 more at 80
    expect(result!.scenarios[2].addShares).toBe(100);
    expect(result!.scenarios[2].newAvg).toBeCloseTo(85);
    expect(result!.scenarios[2].costReduction).toBeGreaterThan(0);
  });

  it("returns null when price is above last buy", () => {
    expect(avgDownOpportunity(100, 110, 90, 50)).toBeNull();
  });

  it("returns null when price equals last buy", () => {
    expect(avgDownOpportunity(100, 100, 90, 50)).toBeNull();
  });

  it("returns null for zero inputs", () => {
    expect(avgDownOpportunity(0, 80, 90, 50)).toBeNull();
    expect(avgDownOpportunity(100, 0, 90, 50)).toBeNull();
  });
});

describe("livePositionGL", () => {
  it("computes market value, gl, glPct", () => {
    const result = livePositionGL(100, 50, 75);
    expect(result.mv).toBe(7500);
    expect(result.gl).toBe(2500);
    expect(result.glPct).toBeCloseTo(50);
  });

  it("handles zero cost", () => {
    const result = livePositionGL(0, 0, 100);
    expect(result.mv).toBe(0);
    expect(result.glPct).toBe(0);
  });
});

describe("liveDayChange", () => {
  it("computes change and percentage", () => {
    const result = liveDayChange(110, 100);
    expect(result.chg).toBe(10);
    expect(result.pct).toBeCloseTo(10);
  });

  it("returns zero for invalid inputs", () => {
    expect(liveDayChange(0, 100)).toEqual({ chg: 0, pct: 0 });
    expect(liveDayChange(100, 0)).toEqual({ chg: 0, pct: 0 });
  });
});

describe("avgDownColor", () => {
  it("returns green for big dip (>= 2x threshold)", () => {
    expect(avgDownColor(-10, 5)).toContain("green-300");
  });

  it("returns emerald for moderate dip (>= 1x threshold)", () => {
    expect(avgDownColor(-6, 5)).toContain("amber-400");
  });

  it("returns gray for small dip (>= 0.5x threshold)", () => {
    expect(avgDownColor(-3, 5)).toContain("gray");
  });

  it("returns empty for tiny dip (< 0.5x threshold)", () => {
    expect(avgDownColor(-1, 5)).toBe("");
  });

  it("uses custom threshold", () => {
    expect(avgDownColor(-4, 2)).toContain("green-300"); // 4 >= 2*2
    expect(avgDownColor(-3, 2)).toContain("amber-400"); // 3 >= 2
    expect(avgDownColor(-1, 2)).toContain("gray"); // 1 >= 0.5*2
    expect(avgDownColor(-0.5, 2)).toBe(""); // 0.5 < 0.5*2
  });
});

describe("color utils", () => {
  it("volatilityColor", () => {
    expect(volatilityColor(35)).toContain("red");
    expect(volatilityColor(20)).toContain("amber");
    expect(volatilityColor(10)).toContain("emerald");
  });

  it("gradeColor", () => {
    expect(gradeColor("A")).toContain("emerald");
    expect(gradeColor("B")).toContain("emerald");
    expect(gradeColor("C")).toContain("amber");
    expect(gradeColor("D")).toContain("red");
    expect(gradeColor("F")).toContain("red");
  });

  it("signalColor", () => {
    expect(signalColor("strong buy")).toContain("emerald");
    expect(signalColor("buy")).toContain("emerald");
    expect(signalColor("strong sell")).toContain("red");
    expect(signalColor("sell")).toContain("red");
    expect(signalColor("hold")).toContain("gray");
    expect(signalColor(undefined)).toContain("gray");
  });
});

describe("fmtDividendYield", () => {
  it("formats yield as percentage", () => {
    expect(fmtDividendYield(0.025)).toBe("2.50%");
  });

  it("returns dash for null/undefined", () => {
    expect(fmtDividendYield(null)).toBe("—");
    expect(fmtDividendYield(undefined)).toBe("—");
  });
});

describe("fmtCountdown", () => {
  it("formats hours and minutes", () => {
    expect(fmtCountdown(7200000)).toBe("2h 0m");
    expect(fmtCountdown(5400000)).toBe("1h 30m");
  });

  it("formats minutes and seconds", () => {
    expect(fmtCountdown(90000)).toBe("1m 30s");
  });

  it("formats seconds only", () => {
    expect(fmtCountdown(5000)).toBe("5s");
  });

  it("returns 'now' for zero/negative", () => {
    expect(fmtCountdown(0)).toBe("now");
    expect(fmtCountdown(-100)).toBe("now");
  });
});

describe("lastTradingDate", () => {
  it("returns a valid date string", () => {
    const d = lastTradingDate();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never returns a weekend", () => {
    const d = new Date(lastTradingDate() + "T12:00:00");
    expect(d.getDay()).not.toBe(0);
    expect(d.getDay()).not.toBe(6);
  });
});

describe("pendingBackfillTickers", () => {
  it("returns tickers with stale data", () => {
    const target = lastTradingDate();
    const tickers = [
      { symbol: "AAPL", lastPriceDate: target },
      { symbol: "GOOG", lastPriceDate: "2024-01-01" },
    ];
    const pending = pendingBackfillTickers(tickers, ["AAPL", "GOOG"]);
    expect(pending).toEqual(["GOOG"]);
  });

  it("returns tickers not in the list", () => {
    const pending = pendingBackfillTickers([], ["NEW"]);
    expect(pending).toEqual(["NEW"]);
  });

  it("returns empty when all up to date", () => {
    const target = lastTradingDate();
    const tickers = [{ symbol: "AAPL", lastPriceDate: target }];
    expect(pendingBackfillTickers(tickers, ["AAPL"])).toEqual([]);
  });
});

describe("isMarketOpen", () => {
  it("returns a boolean", () => {
    expect(typeof isMarketOpen()).toBe("boolean");
  });
});

describe("marketCountdown", () => {
  it("returns label and ms", () => {
    const mc = marketCountdown();
    expect(["closes in", "opens in"]).toContain(mc.label);
    expect(mc.ms).toBeGreaterThanOrEqual(0);
  });
});
