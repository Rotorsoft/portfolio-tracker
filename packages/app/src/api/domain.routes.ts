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
} from "@rotorsoft/portfolio-tracker-domain";
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
      cutoffDate: z.string().optional(),
      dipThreshold: z.number().min(0).max(50).optional(),
      refreshInterval: z.number().min(10).max(3600).optional(),
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
      cutoffDate: z.string().optional(),
      dipThreshold: z.number().min(0).max(50).optional(),
      refreshInterval: z.number().min(10).max(3600).optional(),
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
      const { maSeries, bollingerSeries } = await import("@rotorsoft/portfolio-tracker-domain");
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
      const allTickers = await getTickers();
      const tickerMap = new Map(allTickers.map((t) => [t.symbol, t]));
      let totalCost = 0;
      let totalMarketValue = 0;
      const tickerSummaries: Array<{
        ticker: string; tickerName: string; totalShares: number; avgCostBasis: number; currentPrice: number;
        marketValue: number; unrealizedGL: number; unrealizedGLPercent: number; lots: number; lastBuyPrice: number;
        positionId: string; timingScore: number; dcaSavingsPct: number; signal: string;
        maxDrawdown: number; daysUnderwater: number; yearlyRangePct: number; entryVsMa50: number;
        compositeScore: number; rsi14: number; entryGrade: string; entryGradeScore: number;
        alphaPct: number; benchmarkReturnPct: number; actualReturnPct: number;
        benchmarkValue: number; benchmarkCost: number;
      }> = [];

      for (const pos of positions) {
        if (pos.status !== "open") continue;
        const tickerInfo = tickerMap.get(pos.ticker);
        const currentPrice = tickerInfo?.lastClose ?? 0;
        const marketValue = (pos.totalShares ?? 0) * currentPrice;
        const cost = pos.totalCost ?? 0;
        const unrealizedGL = marketValue - cost;
        const unrealizedGLPercent = cost > 0 ? (unrealizedGL / cost) * 100 : 0;
        totalCost += cost;
        totalMarketValue += marketValue;
        const lastBuyPrice = (pos.lots ?? []).filter((l: any) => l.type === "buy")
          .sort((a: any, b: any) => b.transactionDate.localeCompare(a.transactionDate))[0]?.price ?? 0;
        tickerSummaries.push({
          ticker: pos.ticker, tickerName: tickerInfo?.name ?? "", totalShares: pos.totalShares ?? 0, avgCostBasis: pos.avgCostBasis ?? 0,
          currentPrice, marketValue, unrealizedGL, unrealizedGLPercent, lots: pos.lots?.length ?? 0, lastBuyPrice,
          positionId: pos.id, timingScore: pos.timingScore ?? 50, dcaSavingsPct: pos.dcaSavingsPct ?? 0,
          signal: tickerInfo?.signal ?? "hold", maxDrawdown: pos.maxDrawdown ?? 0,
          daysUnderwater: pos.daysUnderwater ?? 0, yearlyRangePct: pos.yearlyRangePct ?? 50,
          entryVsMa50: pos.entryVsMa50 ?? 0,
          compositeScore: tickerInfo?.compositeScore ?? 0, rsi14: tickerInfo?.rsi14 ?? 50,
          entryGrade: pos.entryGrade ?? "C", entryGradeScore: pos.entryGradeScore ?? 50,
          alphaPct: pos.alphaPct ?? 0, benchmarkReturnPct: pos.benchmarkReturnPct ?? 0, actualReturnPct: pos.actualReturnPct ?? 0,
          benchmarkValue: pos.benchmarkValue ?? 0, benchmarkCost: pos.benchmarkCost ?? 0,
        });
      }
      const totalBenchmarkCost = tickerSummaries.reduce((s, p) => s + p.benchmarkCost, 0);
      const totalBenchmarkValue = tickerSummaries.reduce((s, p) => s + p.benchmarkValue, 0);
      const portfolioBenchmarkReturnPct = totalBenchmarkCost > 0 ? ((totalBenchmarkValue - totalBenchmarkCost) / totalBenchmarkCost) * 100 : 0;
      const portfolioActualReturnPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0;
      return {
        totalCost, totalMarketValue,
        totalUnrealizedGL: totalMarketValue - totalCost,
        totalUnrealizedGLPercent: totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0,
        totalBenchmarkValue, portfolioBenchmarkReturnPct,
        portfolioAlphaPct: portfolioActualReturnPct - portfolioBenchmarkReturnPct,
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

      // Per-lot analysis with entry grade factors
      const { computeEntryGrade } = await import("@rotorsoft/portfolio-tracker-domain");
      const lots = buyLots.map((lot) => {
        const lotTimingScore = range > 0 ? 100 - ((lot.price - periodLow) / range) * 100 : 50;
        const vsAvg = lot.price - periodAvg;
        const vsAvgPct = periodAvg > 0 ? (vsAvg / periodAvg) * 100 : 0;
        const factors = computeEntryGrade(allPrices, lot.price, lot.transactionDate);
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
          factors,
        };
      });

      // Position-level weighted factors
      const posFactors = {
        trendScore: Math.round(lots.reduce((s, l) => s + l.factors.trendScore * l.quantity, 0) / totalShares),
        valueScore: Math.round(lots.reduce((s, l) => s + l.factors.valueScore * l.quantity, 0) / totalShares),
        timingScore: Math.round(lots.reduce((s, l) => s + l.factors.timingScore * l.quantity, 0) / totalShares),
      };

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
          posFactors,
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

      const totalWhatIfCost = positionInfo.reduce((s, p) => s + p.whatIfCost, 0);

      // Build daily timeline — batch-fetch all prices to avoid N*M queries
      const openPositions = positions.filter((p) => p.status === "open");
      const tickers = openPositions.map((p) => p.ticker);
      const allPricesMap: Record<string, Record<string, number>> = {};
      for (const t of tickers) {
        const prices = await getTickerPrices(t, from, to);
        allPricesMap[t] = {};
        for (const p of prices) allPricesMap[t][p.date] = p.close;
      }

      // Collect all trading dates
      const tradingDates = new Set<string>();
      for (const t of tickers) for (const d of Object.keys(allPricesMap[t])) tradingDates.add(d);
      const sortedDates = [...tradingDates].sort();

      const timeline: Array<{
        date: string;
        actualCost: number;
        actualValue: number;
        actualGL: number;
        whatIfCost: number;
        whatIfValue: number;
        whatIfGL: number;
      }> = [];

      // Track last known price per ticker for days with gaps
      const lastPrice: Record<string, number> = {};

      for (const dateStr of sortedDates) {
        let actualCostAtDate = 0;
        let actualValue = 0;
        let whatIfValue = 0;

        for (const pos of openPositions) {
          const closePrice = allPricesMap[pos.ticker]?.[dateStr] ?? lastPrice[pos.ticker] ?? 0;
          if (allPricesMap[pos.ticker]?.[dateStr]) lastPrice[pos.ticker] = closePrice;

          let sharesAtDate = 0;
          let costAtDate = 0;
          for (const lot of pos.lots ?? []) {
            if (lot.transactionDate <= dateStr) {
              if (lot.type === "buy") { sharesAtDate += lot.quantity; costAtDate += lot.quantity * lot.price + lot.fees; }
              else { sharesAtDate -= lot.quantity; costAtDate -= lot.quantity * lot.price - lot.fees; }
            }
          }

          if (sharesAtDate > 0) {
            actualCostAtDate += costAtDate;
            actualValue += sharesAtDate * closePrice;
          }

          const info = positionInfo.find((p) => p.ticker === pos.ticker);
          if (info && dateStr >= input.whatIfDate) {
            whatIfValue += info.actualShares * closePrice;
          }
        }

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

      return { positions: positionInfo, timeline };
    }),

  // === DCA Comparison ===
  getDCAComparison: publicProcedure
    .input(z.object({ portfolioId: z.string() }))
    .query(async ({ input }) => {
      const positions = await getPositionsByPortfolio(input.portfolioId);
      const today = new Date().toISOString().split("T")[0];
      const openPositions = positions.filter((p) => p.status === "open" && (p.totalShares ?? 0) > 0);
      if (openPositions.length === 0) return { timeline: [] };

      // Find portfolio-wide first and last lot dates
      let firstDate = today;
      let lastDate = "2000-01-01";
      for (const pos of openPositions) {
        for (const lot of (pos.lots ?? []).filter((l: any) => l.type === "buy")) {
          if (lot.transactionDate < firstDate) firstDate = lot.transactionDate;
          if (lot.transactionDate > lastDate) lastDate = lot.transactionDate;
        }
      }

      // Batch-fetch all prices from firstDate to today
      const tickers = openPositions.map((p) => p.ticker);
      const allPricesMap: Record<string, Record<string, number>> = {};
      for (const t of tickers) {
        const prices = await getTickerPrices(t, firstDate, today);
        allPricesMap[t] = {};
        for (const p of prices) allPricesMap[t][p.date] = p.close;
      }

      // Collect sorted trading dates
      const tradingDates = new Set<string>();
      for (const t of tickers) for (const d of Object.keys(allPricesMap[t])) tradingDates.add(d);
      const sortedDates = [...tradingDates].sort();
      if (sortedDates.length === 0) return { timeline: [] };

      // For each position, compute DCA schedule: spread total cost evenly across trading days from first to last lot
      // Single-lot positions: DCA = actual (nothing to spread), use actual lot as-is
      const dcaSchedule: Record<string, { dailyInvestment: number; fromDate: string; toDate: string; singleLot: boolean }> = {};
      for (const pos of openPositions) {
        const buyLots = (pos.lots ?? []).filter((l: any) => l.type === "buy");
        const lotDates = buyLots.map((l: any) => l.transactionDate).sort();
        const from = lotDates[0];
        const to = lotDates[lotDates.length - 1];
        const singleLot = from === to;
        const tradingDaysInRange = singleLot ? 1 : sortedDates.filter((d) => d >= from && d <= to).length;
        const totalInvested = pos.totalCost ?? 0;
        dcaSchedule[pos.ticker] = {
          dailyInvestment: tradingDaysInRange > 0 ? totalInvested / tradingDaysInRange : 0,
          fromDate: from,
          toDate: to,
          singleLot,
        };
      }

      // Build timeline
      const lastPrice: Record<string, number> = {};
      const dcaShares: Record<string, number> = {};
      const dcaCost: Record<string, number> = {};
      for (const t of tickers) { dcaShares[t] = 0; dcaCost[t] = 0; }

      const timeline: Array<{
        date: string;
        actualValue: number;
        actualCost: number;
        dcaValue: number;
        dcaCostCum: number;
        delta: number;
      }> = [];

      for (const dateStr of sortedDates) {
        let actualValue = 0;
        let actualCostAtDate = 0;
        let dcaValue = 0;

        for (const pos of openPositions) {
          const closePrice = allPricesMap[pos.ticker]?.[dateStr] ?? lastPrice[pos.ticker] ?? 0;
          if (allPricesMap[pos.ticker]?.[dateStr]) lastPrice[pos.ticker] = closePrice;

          // Actual portfolio
          let sharesAtDate = 0;
          let costAtDate = 0;
          for (const lot of pos.lots ?? []) {
            if (lot.transactionDate <= dateStr) {
              if (lot.type === "buy") { sharesAtDate += lot.quantity; costAtDate += lot.quantity * lot.price + lot.fees; }
              else { sharesAtDate -= lot.quantity; costAtDate -= lot.quantity * lot.price - lot.fees; }
            }
          }
          if (sharesAtDate > 0) {
            actualValue += sharesAtDate * closePrice;
            actualCostAtDate += costAtDate;
          }

          // DCA portfolio — buy daily during the position's lot range
          const sched = dcaSchedule[pos.ticker];
          if (sched && closePrice > 0) {
            if (sched.singleLot) {
              // Single lot: mirror actual purchase exactly
              if (dateStr === sched.fromDate) {
                dcaShares[pos.ticker] = (pos.totalShares ?? 0);
                dcaCost[pos.ticker] = (pos.totalCost ?? 0);
              }
            } else if (dateStr >= sched.fromDate && dateStr <= sched.toDate) {
              dcaShares[pos.ticker] += sched.dailyInvestment / closePrice;
              dcaCost[pos.ticker] += sched.dailyInvestment;
            }
          }
          dcaValue += dcaShares[pos.ticker] * closePrice;
        }

        const dcaCostCum = Object.values(dcaCost).reduce((s, v) => s + v, 0);
        timeline.push({
          date: dateStr,
          actualValue,
          actualCost: actualCostAtDate,
          dcaValue,
          dcaCostCum,
          delta: actualValue - dcaValue,
        });
      }

      // Per-position DCA breakdown using the same computation as the timeline
      const perPosition = openPositions.map((pos) => {
        const actualShares = pos.totalShares ?? 0;
        const actualCost = pos.totalCost ?? 0;
        const lastPriceVal = lastPrice[pos.ticker] ?? 0;
        const actualValue = actualShares * lastPriceVal;
        const dcaSharesFinal = dcaShares[pos.ticker] ?? 0;
        const dcaCostFinal = dcaCost[pos.ticker] ?? 0;
        const dcaValueFinal = dcaSharesFinal * lastPriceVal;
        return {
          ticker: pos.ticker,
          actualCost,
          actualValue,
          actualShares,
          dcaCost: dcaCostFinal,
          dcaValue: dcaValueFinal,
          dcaShares: dcaSharesFinal,
          singleLot: dcaSchedule[pos.ticker]?.singleLot ?? true,
        };
      });

      return { timeline, positions: perPosition };
    }),
});
