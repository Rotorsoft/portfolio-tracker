/**
 * Ticker queries and backfill — no event-sourced state.
 * Tickers are derived from portfolio positions.
 * Prices are written directly by the backfill service.
 */
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, tickers, prices } from "./drizzle/index.js";
import type { PriceRecord } from "./schemas.js";
import { sma, volatility30d, yearlyRange, computeSignal } from "./indicators.js";

export type TickerView = {
  symbol: string;
  name: string;
  exchange: string;
  priceCount: number;
  firstPriceDate: string;
  lastPriceDate: string;
  lastClose: number;
  ma50: number;
  ma200: number;
  volatility30d: number;
  yearlyHigh: number;
  yearlyLow: number;
  signal: string;
};

export type PricePoint = PriceRecord;

// === Ticker projection (called from portfolio projection) ===
export async function ensureTicker(symbol: string) {
  await db()
    .insert(tickers)
    .values({
      symbol,
      name: "",
      exchange: "",
      priceCount: 0,
      lastPriceDate: "",
      lastClose: 0,
      registeredAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

// === Queries ===
export async function getTickers(): Promise<TickerView[]> {
  return db().select().from(tickers);
}

export async function getTicker(symbol: string): Promise<TickerView | undefined> {
  const rows = await db().select().from(tickers).where(eq(tickers.symbol, symbol.toUpperCase()));
  return rows[0];
}

export async function getTickerPrices(symbol: string, from?: string, to?: string) {
  const conditions = [eq(prices.ticker, symbol.toUpperCase())];
  if (from) conditions.push(gte(prices.date, from));
  if (to) conditions.push(lte(prices.date, to));
  return db().select().from(prices).where(and(...conditions)).orderBy(prices.date);
}

export async function getPriceOnDate(symbol: string, date: string) {
  const rows = await db()
    .select()
    .from(prices)
    .where(and(eq(prices.ticker, symbol.toUpperCase()), lte(prices.date, date)))
    .orderBy(sql`date DESC`)
    .limit(1);
  return rows[0];
}

/** Get the date range of all prices across all tickers */
export async function getPriceDateRange(): Promise<{ firstDate: string; lastDate: string } | null> {
  const result = await db()
    .select({ firstDate: sql<string>`min(date)`, lastDate: sql<string>`max(date)` })
    .from(prices);
  if (!result[0]?.firstDate) return null;
  return { firstDate: result[0].firstDate, lastDate: result[0].lastDate };
}

/** Get price on or after the given date (for what-if scenarios) */
export async function getPriceOnOrAfterDate(symbol: string, date: string) {
  const rows = await db()
    .select()
    .from(prices)
    .where(and(eq(prices.ticker, symbol.toUpperCase()), gte(prices.date, date)))
    .orderBy(prices.date)
    .limit(1);
  return rows[0];
}

export async function getMissingPriceDates(
  symbol: string,
  from: string,
  to: string
): Promise<{ missing: number; total: number; firstDate: string; lastDate: string }> {
  const countResult = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(prices)
    .where(and(eq(prices.ticker, symbol.toUpperCase()), gte(prices.date, from), lte(prices.date, to)));
  const priceCount = countResult[0]?.count ?? 0;

  const rangeResult = await db()
    .select({ firstDate: sql<string>`min(date)`, lastDate: sql<string>`max(date)` })
    .from(prices)
    .where(eq(prices.ticker, symbol.toUpperCase()));

  return {
    missing: priceCount === 0 ? 1 : 0,
    total: priceCount,
    firstDate: rangeResult[0]?.firstDate ?? "",
    lastDate: rangeResult[0]?.lastDate ?? "",
  };
}

// === Backfill (direct DB write) ===
export async function backfillPrices(
  symbol: string,
  newPrices: PriceRecord[],
  meta?: { name?: string; exchange?: string }
) {
  const sym = symbol.toUpperCase();

  if (newPrices.length === 0 && !meta) return;

  // Insert prices in batches
  const batch = 50;
  for (let i = 0; i < newPrices.length; i += batch) {
    const chunk = newPrices.slice(i, i + batch);
    await db()
      .insert(prices)
      .values(chunk.map((p) => ({
        ticker: sym,
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume ?? 0,
      })))
      .onConflictDoUpdate({
        target: [prices.ticker, prices.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
        },
      });
  }

  // Update ticker stats
  const countResult = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(prices)
    .where(eq(prices.ticker, sym));

  const latestPrice = await db()
    .select({ date: prices.date, close: prices.close })
    .from(prices)
    .where(eq(prices.ticker, sym))
    .orderBy(sql`date DESC`)
    .limit(1);

  const firstPrice = await db()
    .select({ date: prices.date })
    .from(prices)
    .where(eq(prices.ticker, sym))
    .orderBy(prices.date)
    .limit(1);

  // Fetch all prices for indicator computation
  const allPrices = await db().select().from(prices).where(eq(prices.ticker, sym)).orderBy(prices.date);

  const updates: Record<string, unknown> = { priceCount: countResult[0]?.count ?? 0 };
  if (firstPrice.length > 0) updates.firstPriceDate = firstPrice[0].date;
  if (latestPrice.length > 0) {
    updates.lastPriceDate = latestPrice[0].date;
    updates.lastClose = latestPrice[0].close;
  }
  if (meta?.name) updates.name = meta.name;
  if (meta?.exchange) updates.exchange = meta.exchange;

  // Technical indicators
  if (allPrices.length > 0) {
    const ma50Val = sma(allPrices, 50);
    const ma200Val = sma(allPrices, 200);
    const vol = volatility30d(allPrices);
    const range = yearlyRange(allPrices);
    const lastClose = latestPrice[0]?.close ?? 0;
    updates.ma50 = Math.round(ma50Val * 100) / 100;
    updates.ma200 = Math.round(ma200Val * 100) / 100;
    updates.volatility30d = Math.round(vol * 100) / 100;
    updates.yearlyHigh = range.high;
    updates.yearlyLow = range.low;
    updates.signal = computeSignal(lastClose, ma50Val, ma200Val);
  }

  await db().update(tickers).set(updates).where(eq(tickers.symbol, sym));

  // Recalculate analytics for all positions holding this ticker
  const { positions } = await import("./drizzle/schema.js");
  const { recalcPositionAnalytics } = await import("./portfolio.js");
  const positionsForTicker = await db().select({ id: positions.id }).from(positions).where(eq(positions.ticker, sym));
  for (const p of positionsForTicker) {
    await recalcPositionAnalytics(p.id);
  }
}
