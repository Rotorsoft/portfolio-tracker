import { projection, slice, state } from "@rotorsoft/act";
import { eq } from "drizzle-orm";
import {
  CreatePortfolio,
  UpdatePortfolio,
  ArchivePortfolio,
  OpenPosition,
  ClosePosition,
  AddLot,
  RemoveLot,
  PortfolioCreated,
  PortfolioUpdated,
  PortfolioArchived,
  PositionOpened,
  PositionClosed,
  LotAdded,
  LotRemoved,
  PortfolioState,
  type PositionData,
  type Lot,
} from "./schemas.js";
import { db, portfolios, positions, lots, str } from "./drizzle/index.js";
import { ensureTicker } from "./ticker.js";

// === Invariants ===
const mustBeActive = {
  description: "Portfolio must be active",
  valid: (s: { status: string }) => s.status === "active",
};

// === State ===
export const Portfolio = state({ Portfolio: PortfolioState })
  .init(() => ({
    name: "",
    description: "",
    currency: "USD",
    cutoffDate: undefined,
    status: "active",
    createdBy: "",
    positions: {} as Record<string, PositionData>,
  }))
  .emits({
    PortfolioCreated,
    PortfolioUpdated,
    PortfolioArchived,
    PositionOpened,
    PositionClosed,
    LotAdded,
    LotRemoved,
  })
  .patch({
    PortfolioCreated: ({ data }) => ({
      name: data.name,
      description: data.description,
      currency: data.currency,
      cutoffDate: data.cutoffDate,
      status: "active",
      createdBy: data.createdBy,
    }),
    PortfolioUpdated: ({ data }) => ({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.cutoffDate !== undefined ? { cutoffDate: data.cutoffDate } : {}),
    }),
    PortfolioArchived: () => ({
      status: "archived",
    }),
    PositionOpened: ({ data }, s) => ({
      positions: {
        ...s.positions,
        [data.ticker]: {
          ticker: data.ticker,
          notes: data.notes,
          status: "open",
          lots: [],
        },
      },
    }),
    PositionClosed: ({ data }, s) => ({
      positions: {
        ...s.positions,
        [data.ticker]: { ...s.positions[data.ticker], status: "closed" },
      },
    }),
    LotAdded: ({ data }, s) => {
      const pos = s.positions[data.ticker];
      if (!pos) return {};
      return {
        positions: {
          ...s.positions,
          [data.ticker]: { ...pos, lots: [...pos.lots, data.lot] },
        },
      };
    },
    LotRemoved: ({ data }, s) => {
      const pos = s.positions[data.ticker];
      if (!pos) return {};
      return {
        positions: {
          ...s.positions,
          [data.ticker]: { ...pos, lots: pos.lots.filter((l) => l.id !== data.lotId) },
        },
      };
    },
  })
  // --- Portfolio lifecycle ---
  .on({ CreatePortfolio })
  .emit((data, _, { actor }) => [
    "PortfolioCreated",
    {
      name: data.name,
      description: data.description ?? "",
      currency: data.currency ?? "USD",
      cutoffDate: data.cutoffDate,
      createdBy: actor.id,
    },
  ])
  .on({ UpdatePortfolio })
  .given([mustBeActive])
  .emit((data) => ["PortfolioUpdated", { ...data }])
  .on({ ArchivePortfolio })
  .given([mustBeActive])
  .emit(() => ["PortfolioArchived", {}])
  // --- Position lifecycle ---
  .on({ OpenPosition })
  .given([mustBeActive])
  .emit((data) => ["PositionOpened", { ticker: data.ticker.toUpperCase(), notes: data.notes ?? "" }])
  .on({ ClosePosition })
  .given([mustBeActive])
  .emit((data) => ["PositionClosed", { ticker: data.ticker }])
  // --- Lot management ---
  .on({ AddLot })
  .given([mustBeActive])
  .emit((data) => ["LotAdded", { ticker: data.ticker, lot: data.lot }])
  .on({ RemoveLot })
  .given([mustBeActive])
  .emit((data) => ["LotRemoved", { ticker: data.ticker, lotId: data.lotId }])
  .build();

// === Helper: recalc position stats ===
function calcPositionStats(posLots: Lot[]) {
  let totalShares = 0;
  let totalCost = 0;
  for (const lot of posLots) {
    if (lot.type === "buy") {
      totalShares += lot.quantity;
      totalCost += lot.quantity * lot.price + (lot.fees ?? 0);
    } else {
      totalShares -= lot.quantity;
      totalCost -= lot.quantity * lot.price - (lot.fees ?? 0);
    }
  }
  return { totalShares, totalCost, avgCostBasis: totalShares > 0 ? totalCost / totalShares : 0 };
}

/** Recalculate timing score and DCA comparison for a position */
export async function recalcPositionAnalytics(positionId: string) {
  const { getTickerPrices } = await import("./ticker.js");
  const pos = await db().select().from(positions).where(eq(positions.id, positionId));
  if (pos.length === 0) return;
  const ticker = pos[0].ticker;
  const posLots = await db().select().from(lots).where(eq(lots.positionId, positionId));
  const buyLots = posLots.filter((l) => l.type === "buy");
  if (buyLots.length === 0) return;

  const allPrices = await getTickerPrices(ticker);
  const sortedDates = buyLots.map((l) => l.transactionDate).sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];
  const relevant = allPrices.filter((p) => p.date >= firstDate);

  if (relevant.length === 0) {
    await db().update(positions).set({ timingScore: 50, dcaSavingsPct: 0, periodAvg: 0, periodLow: 0, periodHigh: 0 }).where(eq(positions.id, positionId));
    return;
  }

  const periodLow = relevant.reduce((m, p) => Math.min(m, p.low), Infinity);
  const periodHigh = relevant.reduce((m, p) => Math.max(m, p.high), 0);
  const periodAvg = relevant.reduce((s, p) => s + p.close, 0) / relevant.length;
  const range = periodHigh - periodLow;

  const avgEntry = pos[0].avgCostBasis ?? 0;
  // 100% = bought at the low (best), 0% = bought at the high (worst)
  const timingScore = range > 0 ? Math.max(0, Math.min(100, 100 - ((avgEntry - periodLow) / range) * 100)) : 50;

  // DCA: average price over the lot date range
  const dcaPrices = allPrices.filter((p) => p.date >= firstDate && p.date <= lastDate);
  const dcaAvgPrice = dcaPrices.length > 0 ? dcaPrices.reduce((s, p) => s + p.close, 0) / dcaPrices.length : avgEntry;
  const totalShares = buyLots.reduce((s, l) => s + l.quantity, 0);
  const totalCost = buyLots.reduce((s, l) => s + l.quantity * l.price, 0);
  const dcaCost = totalShares * dcaAvgPrice;
  const dcaSavingsPct = totalCost > 0 ? ((dcaCost - totalCost) / totalCost) * 100 : 0;

  await db().update(positions).set({ timingScore, dcaSavingsPct, periodAvg, periodLow, periodHigh }).where(eq(positions.id, positionId));
}

// === Projection (Drizzle PG) ===
export const PortfolioProjection = projection("portfolios")
  .on({ PortfolioCreated })
  .do(async ({ stream, data, created }) => {
    await db().insert(portfolios).values({
      id: stream,
      name: str(data.name),
      description: str(data.description),
      currency: str(data.currency),
      cutoffDate: str(data.cutoffDate),
      status: "active",
      createdBy: str(data.createdBy),
      createdAt: created.toISOString(),
      updatedAt: "",
    }).onConflictDoUpdate({
      target: portfolios.id,
      set: { name: str(data.name), description: str(data.description), currency: str(data.currency), cutoffDate: str(data.cutoffDate), status: "active", createdBy: str(data.createdBy), createdAt: created.toISOString() },
    });
  })
  .on({ PortfolioUpdated })
  .do(async ({ stream, data, created }) => {
    const updates: Record<string, unknown> = { updatedAt: created.toISOString() };
    if (data.name !== undefined) updates.name = str(data.name);
    if (data.description !== undefined) updates.description = str(data.description);
    if (data.currency !== undefined) updates.currency = str(data.currency);
    if (data.cutoffDate !== undefined) updates.cutoffDate = str(data.cutoffDate);
    await db().update(portfolios).set(updates).where(eq(portfolios.id, stream));
  })
  .on({ PortfolioArchived })
  .do(async ({ stream }) => {
    await db().update(portfolios).set({ status: "archived" }).where(eq(portfolios.id, stream));
  })
  .on({ PositionOpened })
  .do(async ({ stream, data, created }) => {
    await ensureTicker(str(data.ticker));
    await db().insert(positions).values({
      id: `${stream}:${str(data.ticker)}`,
      portfolioId: stream,
      ticker: str(data.ticker),
      notes: str(data.notes),
      status: "open",
      totalShares: 0,
      totalCost: 0,
      avgCostBasis: 0,
      openedAt: created.toISOString(),
      closedAt: "",
    }).onConflictDoUpdate({
      target: positions.id,
      set: { notes: str(data.notes), status: "open", openedAt: created.toISOString() },
    });
  })
  .on({ PositionClosed })
  .do(async ({ stream, data, created }) => {
    const posId = `${stream}:${str(data.ticker)}`;
    await db().update(positions).set({ status: "closed", closedAt: created.toISOString() }).where(eq(positions.id, posId));
  })
  .on({ LotAdded })
  .do(async ({ stream, data }) => {
    await ensureTicker(str(data.ticker));
    const posId = `${stream}:${str(data.ticker)}`;
    await db().insert(lots).values({
      id: str(data.lot.id),
      positionId: posId,
      portfolioId: stream,
      ticker: str(data.ticker),
      type: str(data.lot.type),
      transactionDate: str(data.lot.transaction_date),
      quantity: data.lot.quantity,
      price: data.lot.price,
      fees: data.lot.fees ?? 0,
      notes: str(data.lot.notes ?? ""),
    }).onConflictDoUpdate({
      target: lots.id,
      set: { transactionDate: str(data.lot.transaction_date), quantity: data.lot.quantity, price: data.lot.price, fees: data.lot.fees ?? 0, notes: str(data.lot.notes ?? "") },
    });
    const posLots = await db().select().from(lots).where(eq(lots.positionId, posId));
    const stats = calcPositionStats(posLots.map((l) => ({ ...l, transaction_date: l.transactionDate })) as Lot[]);
    await db().update(positions).set(stats).where(eq(positions.id, posId));
    await recalcPositionAnalytics(posId);
  })
  .on({ LotRemoved })
  .do(async ({ stream, data }) => {
    const posId = `${stream}:${str(data.ticker)}`;
    await db().delete(lots).where(eq(lots.id, str(data.lotId)));
    const posLots = await db().select().from(lots).where(eq(lots.positionId, posId));
    const stats = calcPositionStats(posLots.map((l) => ({ ...l, transaction_date: l.transactionDate })) as Lot[]);
    await db().update(positions).set(stats).where(eq(positions.id, posId));
    await recalcPositionAnalytics(posId);
  })
  .build();

// === Query functions ===
export async function getPortfolios() {
  return db().select().from(portfolios);
}

export async function getPortfolio(id: string) {
  const rows = await db().select().from(portfolios).where(eq(portfolios.id, id));
  return rows[0] ?? null;
}

export async function getPositionsByPortfolio(portfolioId: string) {
  const posRows = await db().select().from(positions).where(eq(positions.portfolioId, portfolioId));
  const result = [];
  for (const pos of posRows) {
    const posLots = await db().select().from(lots).where(eq(lots.positionId, pos.id));
    result.push({ ...pos, lots: posLots });
  }
  return result;
}

export async function getPosition(portfolioId: string, ticker: string) {
  const posId = `${portfolioId}:${ticker}`;
  const rows = await db().select().from(positions).where(eq(positions.id, posId));
  if (rows.length === 0) return null;
  const posLots = await db().select().from(lots).where(eq(lots.positionId, posId));
  return { ...rows[0], lots: posLots };
}

export async function getPositionById(positionId: string) {
  const rows = await db().select().from(positions).where(eq(positions.id, positionId));
  if (rows.length === 0) return null;
  const posLots = await db().select().from(lots).where(eq(lots.positionId, positionId));
  return { ...rows[0], lots: posLots };
}

// === Slice ===
export const PortfolioSlice = slice()
  .withState(Portfolio)
  .withProjection(PortfolioProjection)
  .build();
