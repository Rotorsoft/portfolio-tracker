import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { store, dispose } from "@rotorsoft/act";
import { PostgresStore } from "@rotorsoft/act-pg";
import {
  app,
  Portfolio,
  initDb,
  getPortfolios,
  getPortfolio,
  getPosition,
  getPositionsByPortfolio,
  getPositionById,
  ensureTicker,
  getTickers,
  getTicker,
  backfillPrices,
  getTickerPrices,
  getMissingPriceDates,
  getPriceDateRange,
  getPriceOnOrAfterDate,
  getTickerFundamentals,
  upsertTickerFundamentals,
  getUserByEmail,
  getAllUsers,
  recomputeIndicators,
  recalcPositionAnalytics,
  type AppActor,
} from "../src/index.js";

const DB_URL = "postgres://postgres:postgres@localhost:5479/portfolio_tracker_test";
const actor: AppActor = { id: "test-user", name: "Test", role: "user" };
const systemActor: AppActor = { id: "system", name: "System", role: "system" };

describe("Integration: projections & queries", () => {
  beforeAll(async () => {
    store(new PostgresStore({
      host: "localhost", port: 5479, database: "portfolio_tracker_test", user: "postgres", password: "postgres",
    }));
    initDb(DB_URL);
    execSync(`DATABASE_URL=${DB_URL} pnpm drizzle-kit migrate`, { cwd: dirname(fileURLToPath(import.meta.url)) + "/..", stdio: "pipe" });
    // Clean slate for integration tests
    const { sql: rawSql } = await import("drizzle-orm");
    const d = (await import("../src/drizzle/index.js")).db();
    await d.execute(rawSql`TRUNCATE users, portfolios, positions, lots, tickers, prices`).catch(() => {});
    await store().seed();
    // Settle after commits
    const settleOpts = { maxPasses: 10, streamLimit: 100, eventLimit: 1000 };
    app.on("committed", () => app.settle(settleOpts));
  });

  afterAll(async () => {
    await dispose()();
  });

  const awaitSettle = () =>
    new Promise<void>((resolve) => {
      app.on("settled", function handler() { app.off("settled", handler); resolve(); });
      app.settle({ maxPasses: 10, streamLimit: 100, eventLimit: 1000 });
    });

  describe("User projections", () => {
    it("should project registered user to DB", async () => {
      const email = `test-${crypto.randomUUID().slice(0, 8)}@test.com`;
      await app.do("RegisterUser", { stream: email, actor: systemActor }, {
        email, name: "Test User", passwordHash: "hash", role: "user",
      });
      await awaitSettle();
      const user = await getUserByEmail(email);
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Test User");
      expect(user!.role).toBe("user");
    });

    it("should project role assignment", async () => {
      const email = `admin-${crypto.randomUUID().slice(0, 8)}@test.com`;
      await app.do("RegisterUser", { stream: email, actor: systemActor }, {
        email, name: "Admin", passwordHash: "hash", role: "user",
      });
      await app.do("AssignRole", { stream: email, actor: systemActor }, { role: "admin" });
      await awaitSettle();
      const user = await getUserByEmail(email);
      expect(user!.role).toBe("admin");
    });

    it("should list all users", async () => {
      const users = await getAllUsers();
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe("Portfolio projections", () => {
    let portfolioId: string;

    it("should project portfolio creation", async () => {
      portfolioId = `portfolio-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: portfolioId, actor }, {
        name: "Integration Test", description: "Testing", currency: "USD", cutoffDate: "2024-01-01",
      });
      await awaitSettle();
      const p = await getPortfolio(portfolioId);
      expect(p).not.toBeNull();
      expect(p!.name).toBe("Integration Test");
      expect(p!.cutoffDate).toBe("2024-01-01");
    });

    it("should list portfolios", async () => {
      const all = await getPortfolios();
      expect(all.some((p) => p.id === portfolioId)).toBe(true);
    });

    it("should project position opened", async () => {
      await app.do("OpenPosition", { stream: portfolioId, actor }, { ticker: "TEST" });
      await awaitSettle();
      const positions = await getPositionsByPortfolio(portfolioId);
      expect(positions.some((p) => p.ticker === "TEST")).toBe(true);
    });

    it("should ensure ticker on position open", async () => {
      const ticker = await getTicker("TEST");
      expect(ticker).toBeDefined();
      expect(ticker!.symbol).toBe("TEST");
    });

    it("should project lot added with stats", async () => {
      await app.do("AddLot", { stream: portfolioId, actor }, {
        ticker: "TEST",
        lot: { id: "int-lot-1", type: "buy", transaction_date: "2024-06-15", quantity: 100, price: 50.0, fees: 5.0 },
      });
      await app.do("AddLot", { stream: portfolioId, actor }, {
        ticker: "TEST",
        lot: { id: "int-lot-2", type: "buy", transaction_date: "2024-09-01", quantity: 50, price: 60.0, fees: 5.0 },
      });
      await awaitSettle();
      const posId = `${portfolioId}:TEST`;
      const pos = await getPositionById(posId);
      expect(pos).not.toBeNull();
      expect(pos!.lots).toHaveLength(2);
      expect(pos!.totalShares).toBe(150);
      expect(pos!.totalCost).toBeCloseTo(8010); // 100*50+5 + 50*60+5
      expect(pos!.avgCostBasis).toBeCloseTo(53.4);
    });

    it("should project lot removed and recalc stats", async () => {
      await app.do("RemoveLot", { stream: portfolioId, actor }, { ticker: "TEST", lotId: "int-lot-2" });
      await awaitSettle();
      const posId = `${portfolioId}:TEST`;
      const pos = await getPositionById(posId);
      expect(pos!.lots).toHaveLength(1);
      expect(pos!.totalShares).toBe(100);
      expect(pos!.totalCost).toBeCloseTo(5005);
    });

    it("should project position closed", async () => {
      await app.do("ClosePosition", { stream: portfolioId, actor }, { ticker: "TEST" });
      await awaitSettle();
      const posId = `${portfolioId}:TEST`;
      const pos = await getPositionById(posId);
      expect(pos!.status).toBe("closed");
    });

    it("should project sell lot stats correctly", async () => {
      const pid = `portfolio-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: pid, actor }, { name: "Sell Test" });
      await app.do("OpenPosition", { stream: pid, actor }, { ticker: "SELL" });
      await app.do("AddLot", { stream: pid, actor }, {
        ticker: "SELL",
        lot: { id: "s-1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 50.0, fees: 5.0 },
      });
      await app.do("AddLot", { stream: pid, actor }, {
        ticker: "SELL",
        lot: { id: "s-2", type: "sell", transaction_date: "2024-06-01", quantity: 30, price: 60.0, fees: 3.0 },
      });
      await awaitSettle();
      const pos = await getPositionById(`${pid}:SELL`);
      expect(pos!.totalShares).toBe(70); // 100 - 30
      expect(pos!.totalCost).toBeCloseTo(3208); // (100*50+5) - (30*60-3)
    });

    it("should project portfolio update", async () => {
      await app.do("UpdatePortfolio", { stream: portfolioId, actor }, { description: "Updated desc" });
      await awaitSettle();
      const p = await getPortfolio(portfolioId);
      expect(p!.description).toBe("Updated desc");
    });
  });

  describe("Ticker & prices", () => {
    it("should ensure ticker", async () => {
      const sym = `T${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      await ensureTicker(sym);
      const t = await getTicker(sym);
      expect(t).toBeDefined();
      expect(t!.symbol).toBe(sym);
      expect(t!.priceCount).toBe(0);
    });

    it("should backfill prices", async () => {
      await ensureTicker("INTTEST");
      await backfillPrices("INTTEST", [
        { date: "2024-01-02", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
        { date: "2024-01-03", open: 103, high: 108, low: 102, close: 107, volume: 1200 },
        { date: "2024-01-04", open: 107, high: 110, low: 106, close: 109, volume: 900 },
      ]);
      const t = await getTicker("INTTEST");
      expect(t!.priceCount).toBe(3);
      expect(t!.lastClose).toBe(109);
      expect(t!.lastPriceDate).toBe("2024-01-04");
    });

    it("should query prices with date range", async () => {
      const all = await getTickerPrices("INTTEST");
      expect(all).toHaveLength(3);

      const filtered = await getTickerPrices("INTTEST", "2024-01-03", "2024-01-04");
      expect(filtered).toHaveLength(2);
    });

    it("should backfill idempotently", async () => {
      await backfillPrices("INTTEST", [
        { date: "2024-01-02", open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      ]);
      const t = await getTicker("INTTEST");
      expect(t!.priceCount).toBe(3); // still 3, not 4
    });

    it("should update price on backfill with changed close", async () => {
      await backfillPrices("INTTEST", [
        { date: "2024-01-04", open: 107, high: 112, low: 106, close: 111, volume: 1500 },
      ]);
      const prices = await getTickerPrices("INTTEST", "2024-01-04", "2024-01-04");
      expect(prices[0].close).toBe(111);
      expect(prices[0].volume).toBe(1500);
    });

    it("should get missing price dates info", async () => {
      const info = await getMissingPriceDates("INTTEST", "2024-01-01", "2024-01-10");
      expect(info.total).toBe(3);
      expect(info.firstDate).toBe("2024-01-02");
      expect(info.lastDate).toBe("2024-01-04");
    });

    it("should return undefined for non-existent ticker", async () => {
      const t = await getTicker("NONEXISTENT");
      expect(t).toBeUndefined();
    });

    it("should get price on date", async () => {
      const { getPriceOnDate } = await import("../src/ticker.js");
      const p = await getPriceOnDate("INTTEST", "2024-01-03");
      expect(p).toBeDefined();
      expect(p!.close).toBe(107);
    });

    it("should get closest prior price when exact date missing", async () => {
      const { getPriceOnDate } = await import("../src/ticker.js");
      // 2024-01-05 doesn't exist, should return 2024-01-04
      const p = await getPriceOnDate("INTTEST", "2024-01-05");
      expect(p).toBeDefined();
      expect(p!.date).toBe("2024-01-04");
    });

    it("should return undefined for price before any data", async () => {
      const { getPriceOnDate } = await import("../src/ticker.js");
      const p = await getPriceOnDate("INTTEST", "2023-01-01");
      expect(p).toBeUndefined();
    });

    it("should backfill with metadata", async () => {
      await backfillPrices("INTTEST", [], { name: "Integration Test Corp", exchange: "TEST" });
      const t = await getTicker("INTTEST");
      expect(t!.name).toBe("Integration Test Corp");
      expect(t!.exchange).toBe("TEST");
    });

    it("should backfill with previousClose in metadata", async () => {
      await backfillPrices("INTTEST", [], { previousClose: 105 });
      const t = await getTicker("INTTEST");
      expect(t!.previousClose).toBe(105);
    });

    it("should recompute indicators from existing prices", async () => {
      // Backfill enough prices for indicators
      const sym = `IND${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      await ensureTicker(sym);
      const prices = [];
      for (let i = 0; i < 60; i++) {
        const d = new Date("2024-01-01");
        d.setDate(d.getDate() + i);
        prices.push({
          date: d.toISOString().split("T")[0],
          open: 100 + i * 0.5,
          high: 102 + i * 0.5,
          low: 99 + i * 0.5,
          close: 101 + i * 0.5,
          volume: 1000000,
        });
      }
      await backfillPrices(sym, prices);
      await recomputeIndicators(sym);
      const t = await getTicker(sym);
      expect(t).toBeDefined();
      expect(t!.signal).toBeDefined();
      expect(t!.compositeScore).toBeDefined();
    });

    it("should list all tickers", async () => {
      const all = await getTickers();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });

    it("should get price date range across all tickers", async () => {
      const range = await getPriceDateRange();
      expect(range).not.toBeNull();
      expect(range!.firstDate).toBeDefined();
      expect(range!.lastDate).toBeDefined();
    });

    it("should get price on or after date", async () => {
      const p = await getPriceOnOrAfterDate("INTTEST", "2024-01-02");
      expect(p).toBeDefined();
      expect(p!.date).toBe("2024-01-02");
    });

    it("should get price on or after date when exact missing", async () => {
      const p = await getPriceOnOrAfterDate("INTTEST", "2024-01-01");
      expect(p).toBeDefined();
      expect(p!.date).toBe("2024-01-02"); // first available
    });

    it("should upsert and get ticker fundamentals", async () => {
      await upsertTickerFundamentals("INTTEST", {
        trailingPE: 25.5, forwardPE: 22.0, epsTrailing: 5.0, epsForward: 6.0,
        dividendYield: 0.015, marketCap: 1000000000, bookValue: 30,
        priceToBook: 3.5, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80,
        sector: "Technology", industry: "Software",
      });
      const f = await getTickerFundamentals("INTTEST");
      expect(f).toBeDefined();
      expect(f!.trailingPE).toBe(25.5);
      expect(f!.sector).toBe("Technology");
    });

    it("should get missing price dates with count and range", async () => {
      const info = await getMissingPriceDates("INTTEST", "2024-01-01", "2024-01-10");
      expect(info.total).toBeGreaterThan(0);
      expect(info.firstDate).toBeDefined();
      expect(info.lastDate).toBeDefined();
      expect(typeof info.missing).toBe("number");
    });
  });

  describe("Position analytics", () => {
    it("should recalc position analytics with prices", async () => {
      // Create portfolio with position and lot
      const pid = `analytics-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: pid, actor }, { name: "Analytics Test" });
      await app.do("OpenPosition", { stream: pid, actor }, { ticker: "ANLYT" });
      await app.do("AddLot", { stream: pid, actor }, {
        ticker: "ANLYT",
        lot: { id: "a-1", type: "buy", transaction_date: "2024-03-15", quantity: 100, price: 105, fees: 5 },
      });
      await awaitSettle();

      // Backfill prices covering the lot date and beyond
      await ensureTicker("ANLYT");
      const prices = [];
      const seen = new Set<string>();
      for (let i = 0; i < 120; i++) {
        const d = new Date(Date.UTC(2024, 0, 1 + i));
        const date = d.toISOString().split("T")[0];
        if (seen.has(date)) continue;
        seen.add(date);
        prices.push({
          date,
          open: 100 + Math.sin(i * 0.2) * 5,
          high: 105 + Math.sin(i * 0.2) * 5,
          low: 95 + Math.sin(i * 0.2) * 5,
          close: 100 + Math.sin(i * 0.2) * 5,
          volume: 1000000,
        });
      }
      await backfillPrices("ANLYT", prices);

      // Recalc analytics
      const posId = `${pid}:ANLYT`;
      await recalcPositionAnalytics(posId);

      const pos = await getPositionById(posId);
      expect(pos).not.toBeNull();
      // Should have computed analytics
      expect(typeof pos!.timingScore).toBe("number");
      expect(typeof pos!.maxDrawdown).toBe("number");
    });

    it("should get positions by portfolio with lots", async () => {
      const pid = `posby-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: pid, actor }, { name: "PosByPortfolio" });
      await app.do("OpenPosition", { stream: pid, actor }, { ticker: "PBP1" });
      await app.do("AddLot", { stream: pid, actor }, {
        ticker: "PBP1",
        lot: { id: "pbp-1", type: "buy", transaction_date: "2024-01-15", quantity: 50, price: 100, fees: 0 },
      });
      await awaitSettle();

      const positions = await getPositionsByPortfolio(pid);
      expect(positions.length).toBeGreaterThanOrEqual(1);
      const pos = positions.find((p) => p.ticker === "PBP1");
      expect(pos).toBeDefined();
      expect(pos!.lots).toBeDefined();
      expect(pos!.lots.length).toBeGreaterThanOrEqual(1);
    });

    it("should get position by portfolio and ticker", async () => {
      const pid = `getpos-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: pid, actor }, { name: "GetPos Test" });
      await app.do("OpenPosition", { stream: pid, actor }, { ticker: "GP1" });
      await app.do("AddLot", { stream: pid, actor }, {
        ticker: "GP1",
        lot: { id: "gp-1", type: "buy", transaction_date: "2024-02-01", quantity: 25, price: 80, fees: 2 },
      });
      await awaitSettle();
      const pos = await getPosition(pid, "GP1");
      expect(pos).not.toBeNull();
      expect(pos!.ticker).toBe("GP1");
      expect(pos!.lots.length).toBe(1);
    });

    it("should return null for non-existent position", async () => {
      const pos = await getPosition("nonexistent", "NOPE");
      expect(pos).toBeNull();
    });

    it("should handle portfolio archive projection", async () => {
      const pid = `arch-${crypto.randomUUID()}`;
      await app.do("CreatePortfolio", { stream: pid, actor }, { name: "To Archive" });
      await app.do("ArchivePortfolio", { stream: pid, actor }, {});
      await awaitSettle();
      const p = await getPortfolio(pid);
      expect(p).not.toBeNull();
      expect(p!.status).toBe("archived");
    });
  });
});
