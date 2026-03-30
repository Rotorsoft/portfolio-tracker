import {
  app,
  getPortfolios,
  getPortfolio,
  getPositionsByPortfolio,
  getPositionById,
  getTickers,
  getTicker,
  getTickerPrices,
  getPriceOnDate,
  getPriceOnOrAfterDate,
  getPriceDateRange,
  getMissingPriceDates,
  backfillPrices,
  getTickerFundamentals,
  upsertTickerFundamentals,
  recomputeIndicators,
} from "@portfolio-tracker/domain";
import { z } from "zod";
import { t, authedProcedure, publicProcedure } from "./trpc.js";
import { doAction } from "./app.js";
import { fetchPrices, fetchFundamentals, fetchQuotes, getQuoteStats } from "./price-service.js";

export const domainRouter = t.router({
  // === Portfolio CRUD ===
  createPortfolio: authedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      currency: z.string().optional(),
      cutoffDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const stream = `portfolio-${crypto.randomUUID()}`;
      await doAction("CreatePortfolio", { stream, actor: ctx.actor }, { ...input, cutoffDate: input.cutoffDate ?? "" });
      return { id: stream };
    }),

  updatePortfolio: authedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      currency: z.string().optional(),
      cutoffDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await doAction("UpdatePortfolio", { stream: id, actor: ctx.actor }, data);
      return { success: true };
    }),

  archivePortfolio: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await doAction("ArchivePortfolio", { stream: input.id, actor: ctx.actor }, {});
      return { success: true };
    }),

  getPortfolios: publicProcedure.query(async () => getPortfolios()),
  getPortfolio: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => getPortfolio(input.id)),

  // === Position CRUD (targets portfolio stream) ===
  openPosition: authedProcedure
    .input(z.object({
      portfolioId: z.string(),
      ticker: z.string().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ticker = input.ticker.toUpperCase();
      await doAction("OpenPosition", { stream: input.portfolioId, actor: ctx.actor }, {
        ticker, notes: input.notes ?? "",
      });
      // Ticker is ensured by the PositionOpened projection handler
      return { success: true };
    }),

  addLot: authedProcedure
    .input(z.object({
      portfolioId: z.string(),
      ticker: z.string(),
      lot: z.object({
        id: z.string(),
        type: z.enum(["buy", "sell"]),
        transaction_date: z.string(),
        quantity: z.number().positive(),
        price: z.number().positive(),
        fees: z.number().min(0).default(0),
        notes: z.string().default(""),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      await doAction("AddLot", { stream: input.portfolioId, actor: ctx.actor }, {
        ticker: input.ticker.toUpperCase(), lot: input.lot,
      });
      return { success: true };
    }),

  removeLot: authedProcedure
    .input(z.object({ portfolioId: z.string(), ticker: z.string(), lotId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await doAction("RemoveLot", { stream: input.portfolioId, actor: ctx.actor }, {
        ticker: input.ticker, lotId: input.lotId,
      });
      return { success: true };
    }),

  closePosition: authedProcedure
    .input(z.object({ portfolioId: z.string(), ticker: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await doAction("ClosePosition", { stream: input.portfolioId, actor: ctx.actor }, {
        ticker: input.ticker,
      });
      return { success: true };
    }),

  getPositionsByPortfolio: publicProcedure
    .input(z.object({ portfolioId: z.string() }))
    .query(async ({ input }) => getPositionsByPortfolio(input.portfolioId)),
  getPosition: publicProcedure
    .input(z.object({ positionId: z.string() }))
    .query(async ({ input }) => getPositionById(input.positionId)),

  // === Ticker & Prices ===
  getTickers: publicProcedure.query(async () => getTickers()),
  getTicker: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => getTicker(input.symbol)),
  getBulkFundamentals: publicProcedure
    .input(z.object({ symbols: z.array(z.string()) }))
    .query(async ({ input }) => {
      const results: Record<string, Awaited<ReturnType<typeof getTickerFundamentals>>> = {};
      for (const sym of input.symbols) {
        const cached = await getTickerFundamentals(sym.toUpperCase());
        if (cached) results[sym.toUpperCase()] = cached;
      }
      return results;
    }),
  getFundamentals: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => {
      const symbol = input.symbol.toUpperCase();
      const cached = await getTickerFundamentals(symbol);
      if (cached) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < 60 * 60 * 1000) return cached;
      }
      try {
        const fresh = await fetchFundamentals(symbol);
        await upsertTickerFundamentals(symbol, fresh);
        return { ...fresh, symbol, fetchedAt: new Date().toISOString() };
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    }),
  getTickerPrices: publicProcedure
    .input(z.object({ symbol: z.string(), from: z.string().optional(), to: z.string().optional() }))
    .query(async ({ input }) => getTickerPrices(input.symbol, input.from, input.to)),
  getMissingPrices: publicProcedure
    .input(z.object({ symbol: z.string(), from: z.string(), to: z.string() }))
    .query(async ({ input }) => getMissingPriceDates(input.symbol, input.from, input.to)),
  getPriceDateRange: publicProcedure.query(async () => getPriceDateRange()),

  // === Backfill (direct DB write — no events) ===
  recomputeAllIndicators: authedProcedure
    .mutation(async () => {
      const allTickers = await getTickers();
      let count = 0;
      for (const t of allTickers) {
        await recomputeIndicators(t.symbol);
        count++;
      }
      return { success: true, count };
    }),
  requestBackfill: authedProcedure
    .input(z.object({ symbol: z.string(), fromDate: z.string(), toDate: z.string() }))
    .mutation(async ({ input }) => {
      const symbol = input.symbol.toUpperCase();
      let fetched;
      try {
        fetched = await fetchPrices(symbol, input.fromDate, input.toDate);
      } catch (error) {
        return { success: false, count: 0, error: error instanceof Error ? error.message : "Unknown error" };
      }
      if (fetched.prices.length === 0) return { success: true, count: 0 };

      // Filter idempotent: skip dates with same close price
      const existing = await getTickerPrices(symbol, input.fromDate, input.toDate);
      const existingByDate = new Map(existing.map((p) => [p.date, p]));
      const newPrices = fetched.prices.filter((p) => {
        const ex = existingByDate.get(p.date);
        if (!ex) return true;
        return ex.close !== p.close;
      });

      // Always update metadata even if no new prices
      await backfillPrices(symbol, newPrices, fetched.meta);
      return { success: true, count: newPrices.length };
    }),

  getQuotes: publicProcedure
    .input(z.object({ symbols: z.array(z.string()) }))
    .query(async ({ input }) => {
      return fetchQuotes(input.symbols.map((s) => s.toUpperCase()));
    }),

  getQuoteStats: publicProcedure.query(() => getQuoteStats()),

  // === Analytics ===
  getChartOverlays: publicProcedure
    .input(z.object({ symbol: z.string(), from: z.string().optional() }))
    .query(async ({ input }) => {
      const { maSeries, bollingerSeries } = await import("@portfolio-tracker/domain");
      const prices = await getTickerPrices(input.symbol, input.from);
      return {
        ma50: maSeries(prices, 50),
        ma200: maSeries(prices, 200),
        bollinger: bollingerSeries(prices),
      };
    }),

  getPortfolioSummary: publicProcedure
    .input(z.object({ portfolioId: z.string() }))
    .query(async ({ input }) => {
      const positions = await getPositionsByPortfolio(input.portfolioId);
      let totalCost = 0;
      let totalMarketValue = 0;
      const tickerSummaries: Array<{
        ticker: string; tickerName: string; totalShares: number; avgCostBasis: number; currentPrice: number;
        marketValue: number; unrealizedGL: number; unrealizedGLPercent: number; lots: number;
        positionId: string; timingScore: number; dcaSavingsPct: number; signal: string;
        maxDrawdown: number; daysUnderwater: number; yearlyRangePct: number; entryVsMa50: number;
        compositeScore: number; rsi14: number; entryGrade: string; entryGradeScore: number;
      }> = [];

      for (const pos of positions) {
        if (pos.status !== "open") continue;
        const tickerInfo = await getTicker(pos.ticker);
        const currentPrice = tickerInfo?.lastClose ?? 0;
        const marketValue = (pos.totalShares ?? 0) * currentPrice;
        const cost = pos.totalCost ?? 0;
        const unrealizedGL = marketValue - cost;
        const unrealizedGLPercent = cost > 0 ? (unrealizedGL / cost) * 100 : 0;
        totalCost += cost;
        totalMarketValue += marketValue;
        tickerSummaries.push({
          ticker: pos.ticker, tickerName: tickerInfo?.name ?? "", totalShares: pos.totalShares ?? 0, avgCostBasis: pos.avgCostBasis ?? 0,
          currentPrice, marketValue, unrealizedGL, unrealizedGLPercent, lots: pos.lots?.length ?? 0,
          positionId: pos.id, timingScore: pos.timingScore ?? 50, dcaSavingsPct: pos.dcaSavingsPct ?? 0,
          signal: tickerInfo?.signal ?? "hold", maxDrawdown: pos.maxDrawdown ?? 0,
          daysUnderwater: pos.daysUnderwater ?? 0, yearlyRangePct: pos.yearlyRangePct ?? 50,
          entryVsMa50: pos.entryVsMa50 ?? 0,
          compositeScore: tickerInfo?.compositeScore ?? 0, rsi14: tickerInfo?.rsi14 ?? 50,
          entryGrade: pos.entryGrade ?? "C", entryGradeScore: pos.entryGradeScore ?? 50,
        });
      }
      return {
        totalCost, totalMarketValue,
        totalUnrealizedGL: totalMarketValue - totalCost,
        totalUnrealizedGLPercent: totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0,
        positions: tickerSummaries.sort((a, b) => b.marketValue - a.marketValue),
      };
    }),


  getEntryAnalysis: publicProcedure
    .input(z.object({ positionId: z.string() }))
    .query(async ({ input }) => {
      const pos = await getPositionById(input.positionId);
      if (!pos) return null;
      const allPrices = await getTickerPrices(pos.ticker);
      const buyLots = (pos.lots ?? []).filter((l) => l.type === "buy");
      if (allPrices.length === 0 || buyLots.length === 0) return { position: pos, analysis: null };

      const lotDates = buyLots.map((l) => l.transactionDate).sort();
      const firstDate = lotDates[0];
      const lastDate = lotDates[lotDates.length - 1];
      const relevantPrices = allPrices.filter((p) => p.date >= firstDate);
      if (relevantPrices.length === 0) return { position: pos, analysis: null };

      // Period stats
      const periodLow = relevantPrices.reduce((m, p) => Math.min(m, p.low), Infinity);
      const periodHigh = relevantPrices.reduce((m, p) => Math.max(m, p.high), 0);
      const periodAvg = relevantPrices.reduce((s, p) => s + p.close, 0) / relevantPrices.length;

      // Actual weighted average entry
      const totalShares = buyLots.reduce((s, l) => s + l.quantity, 0);
      const totalCost = buyLots.reduce((s, l) => s + l.quantity * l.price, 0);
      const actualAvgEntry = totalShares > 0 ? totalCost / totalShares : 0;

      // DCA comparison: if you had bought equal $ amounts on each trading day in the range
      const dcaPrices = allPrices.filter((p) => p.date >= firstDate && p.date <= lastDate);
      const dcaAvgPrice = dcaPrices.length > 0
        ? dcaPrices.reduce((s, p) => s + p.close, 0) / dcaPrices.length
        : actualAvgEntry;
      const dcaCost = totalShares * dcaAvgPrice;
      const dcaSavings = dcaCost - totalCost; // positive = you did better than DCA

      // Entry timing score: 0% = bought at period low, 100% = bought at period high
      const range = periodHigh - periodLow;
      const timingScore = range > 0 ? ((actualAvgEntry - periodLow) / range) * 100 : 50;

      // Per-lot analysis
      const lots = buyLots.map((lot) => {
        const lotTimingScore = range > 0 ? 100 - ((lot.price - periodLow) / range) * 100 : 50;
        const vsAvg = lot.price - periodAvg;
        const vsAvgPct = periodAvg > 0 ? (vsAvg / periodAvg) * 100 : 0;
        return {
          lotId: lot.id,
          date: lot.transactionDate,
          quantity: lot.quantity,
          entryPrice: lot.price,
          vsAvg,
          vsAvgPct,
          timingScore: lotTimingScore,
          grade: lot.grade || "C",
          gradeScore: lot.gradeScore || 0,
          gradeExplanation: lot.gradeExplanation || "",
        };
      });

      return {
        position: pos,
        analysis: {
          periodLow,
          periodHigh,
          periodAvg,
          actualAvgEntry,
          dcaAvgPrice,
          dcaSavings,
          dcaSavingsPct: totalCost > 0 ? (dcaSavings / totalCost) * 100 : 0,
          timingScore,
          lots,
        },
      };
    }),

  getTickerPerformance: publicProcedure
    .input(z.object({ symbol: z.string(), from: z.string().optional(), to: z.string().optional() }))
    .query(async ({ input }) => {
      const allPrices = await getTickerPrices(input.symbol, input.from, input.to);
      if (allPrices.length === 0) return { prices: [], performance: [] };
      const basePrice = allPrices[0].close;
      return {
        prices: allPrices,
        performance: allPrices.map((p) => ({ date: p.date, close: p.close, changePercent: ((p.close - basePrice) / basePrice) * 100 })),
      };
    }),

  // === What-If Analysis ===
  getWhatIfComparison: publicProcedure
    .input(z.object({ portfolioId: z.string(), whatIfDate: z.string(), from: z.string().optional(), to: z.string().optional() }))
    .query(async ({ input }) => {
      const positions = await getPositionsByPortfolio(input.portfolioId);
      const today = new Date().toISOString().split("T")[0];
      const from = input.from ?? input.whatIfDate;
      const to = input.to ?? today;

      // For each position, get the hypothetical buy price on whatIfDate
      const positionInfo = [];
      for (const pos of positions) {
        if (pos.status !== "open") continue;
        const totalShares = pos.totalShares ?? 0;
        if (totalShares <= 0) continue;
        const whatIfPrice = await getPriceOnOrAfterDate(pos.ticker, input.whatIfDate);
        positionInfo.push({
          ticker: pos.ticker,
          actualShares: totalShares,
          actualCost: pos.totalCost ?? 0,
          whatIfPricePerShare: whatIfPrice?.close ?? 0,
          whatIfCost: totalShares * (whatIfPrice?.close ?? 0),
        });
      }

      if (positionInfo.length === 0) return { positions: positionInfo, timeline: [] };

      const totalActualCost = positionInfo.reduce((s, p) => s + p.actualCost, 0);
      const totalWhatIfCost = positionInfo.reduce((s, p) => s + p.whatIfCost, 0);

      // Build daily timeline comparing actual vs what-if
      const timeline: Array<{
        date: string;
        actualCost: number;
        actualValue: number;
        actualGL: number;
        whatIfCost: number;
        whatIfValue: number;
        whatIfGL: number;
      }> = [];

      const current = new Date(from);
      const end = new Date(to);
      while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
          const dateStr = current.toISOString().split("T")[0];
          let actualCostAtDate = 0;
          let actualValue = 0;
          let whatIfValue = 0;

          for (const pos of positions) {
            if (pos.status !== "open") continue;
            // Actual: shares held at this date based on lot transaction dates
            let sharesAtDate = 0;
            let costAtDate = 0;
            for (const lot of pos.lots ?? []) {
              if (lot.transactionDate <= dateStr) {
                if (lot.type === "buy") { sharesAtDate += lot.quantity; costAtDate += lot.quantity * lot.price + lot.fees; }
                else { sharesAtDate -= lot.quantity; costAtDate -= lot.quantity * lot.price - lot.fees; }
              }
            }

            const price = await getPriceOnDate(pos.ticker, dateStr);
            const closePrice = price?.close ?? 0;

            if (sharesAtDate > 0) {
              actualCostAtDate += costAtDate;
              actualValue += sharesAtDate * closePrice;
            }

            // What-if: all final shares bought on whatIfDate
            const info = positionInfo.find((p) => p.ticker === pos.ticker);
            if (info && dateStr >= input.whatIfDate) {
              whatIfValue += info.actualShares * closePrice;
            }
          }

          {
            timeline.push({
              date: dateStr,
              actualCost: actualCostAtDate,
              actualValue,
              actualGL: actualValue - actualCostAtDate,
              whatIfCost: dateStr >= input.whatIfDate ? totalWhatIfCost : 0,
              whatIfValue,
              whatIfGL: dateStr >= input.whatIfDate ? whatIfValue - totalWhatIfCost : 0,
            });
          }
        }
        current.setDate(current.getDate() + 1);
      }

      return { positions: positionInfo, timeline };
    }),
});
