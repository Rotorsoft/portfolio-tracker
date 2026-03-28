import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { store, dispose } from "@rotorsoft/act";
import { app, Portfolio, type AppActor } from "../src/index.js";

const actor: AppActor = { id: "user-1", name: "Test User", role: "user" };
const target = (stream = crypto.randomUUID()) => ({ stream, actor });

describe("Portfolio lifecycle", () => {
  beforeEach(async () => { await store().seed(); });
  afterAll(async () => { await dispose()(); });

  it("should create a portfolio with defaults", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "My Portfolio" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.name).toBe("My Portfolio");
    expect(snap.state.description).toBe("");
    expect(snap.state.currency).toBe("USD");
    expect(snap.state.status).toBe("active");
    expect(snap.state.createdBy).toBe("user-1");
    expect(snap.state.cutoffDate).toBeUndefined();
  });

  it("should create with all fields", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, {
      name: "Full", description: "Desc", currency: "EUR", cutoffDate: "2024-01-01",
    });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.name).toBe("Full");
    expect(snap.state.description).toBe("Desc");
    expect(snap.state.currency).toBe("EUR");
    expect(snap.state.cutoffDate).toBe("2024-01-01");
  });

  it("should update individual fields", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Original" });
    await app.do("UpdatePortfolio", t, { name: "Updated" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.name).toBe("Updated");
    expect(snap.state.currency).toBe("USD"); // unchanged
  });

  it("should update cutoff date", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("UpdatePortfolio", t, { cutoffDate: "2025-06-01" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.cutoffDate).toBe("2025-06-01");
  });

  it("should archive a portfolio", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "To Archive" });
    await app.do("ArchivePortfolio", t, {});
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.status).toBe("archived");
  });

  it("should reject update on archived portfolio", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Archived" });
    await app.do("ArchivePortfolio", t, {});
    await expect(app.do("UpdatePortfolio", t, { name: "Nope" })).rejects.toThrow();
  });

  it("should reject archive on already archived portfolio", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("ArchivePortfolio", t, {});
    await expect(app.do("ArchivePortfolio", t, {})).rejects.toThrow();
  });

  it("should reject open position on archived portfolio", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("ArchivePortfolio", t, {});
    await expect(app.do("OpenPosition", t, { ticker: "AAPL" })).rejects.toThrow();
  });
});

describe("Positions", () => {
  beforeEach(async () => { await store().seed(); });
  afterAll(async () => { await dispose()(); });

  it("should open a position", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"]).toBeDefined();
    expect(snap.state.positions["AAPL"].status).toBe("open");
    expect(snap.state.positions["AAPL"].ticker).toBe("AAPL");
    expect(snap.state.positions["AAPL"].lots).toHaveLength(0);
  });

  it("should uppercase ticker", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "aapl" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"]).toBeDefined();
    expect(snap.state.positions["aapl"]).toBeUndefined();
  });

  it("should open multiple positions", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
    await app.do("OpenPosition", t, { ticker: "GOOG" });
    await app.do("OpenPosition", t, { ticker: "MSFT" });
    const snap = await app.load(Portfolio, t.stream);
    expect(Object.keys(snap.state.positions)).toHaveLength(3);
  });

  it("should close a position", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "MSFT" });
    await app.do("ClosePosition", t, { ticker: "MSFT" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["MSFT"].status).toBe("closed");
  });

  it("should open position with notes", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "TSLA", notes: "High risk" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["TSLA"].notes).toBe("High risk");
  });
});

describe("Lots", () => {
  beforeEach(async () => { await store().seed(); });
  afterAll(async () => { await dispose()(); });

  const createWithPosition = async (t: ReturnType<typeof target>) => {
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
  };

  it("should add a buy lot", async () => {
    const t = target();
    await createWithPosition(t);
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 150.0, fees: 9.99, notes: "First buy" },
    });
    const snap = await app.load(Portfolio, t.stream);
    const lots = snap.state.positions["AAPL"].lots;
    expect(lots).toHaveLength(1);
    expect(lots[0].id).toBe("lot-1");
    expect(lots[0].type).toBe("buy");
    expect(lots[0].transaction_date).toBe("2024-01-15");
    expect(lots[0].quantity).toBe(100);
    expect(lots[0].price).toBe(150.0);
    expect(lots[0].fees).toBe(9.99);
    expect(lots[0].notes).toBe("First buy");
  });

  it("should add a sell lot", async () => {
    const t = target();
    await createWithPosition(t);
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 150.0 },
    });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-2", type: "sell", transaction_date: "2024-06-01", quantity: 50, price: 180.0 },
    });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"].lots).toHaveLength(2);
    expect(snap.state.positions["AAPL"].lots[1].type).toBe("sell");
  });

  it("should add multiple lots to same position", async () => {
    const t = target();
    await createWithPosition(t);
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 50, price: 150.0 },
    });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-2", type: "buy", transaction_date: "2024-03-20", quantity: 30, price: 160.0 },
    });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-3", type: "buy", transaction_date: "2024-06-10", quantity: 20, price: 170.0 },
    });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"].lots).toHaveLength(3);
  });

  it("should remove a lot", async () => {
    const t = target();
    await createWithPosition(t);
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 50, price: 140.0 },
    });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-2", type: "buy", transaction_date: "2024-03-20", quantity: 30, price: 150.0 },
    });
    await app.do("RemoveLot", t, { ticker: "AAPL", lotId: "lot-1" });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"].lots).toHaveLength(1);
    expect(snap.state.positions["AAPL"].lots[0].id).toBe("lot-2");
  });

  it("should reject add lot on archived portfolio", async () => {
    const t = target();
    await createWithPosition(t);
    await app.do("ArchivePortfolio", t, {});
    await expect(app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 10, price: 150.0 },
    })).rejects.toThrow();
  });

  it("should reject invalid transaction_date format", async () => {
    const t = target();
    await createWithPosition(t);
    await expect(app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "not-a-date", quantity: 10, price: 150.0 },
    })).rejects.toThrow();
  });

  it("should handle lots across multiple positions", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Multi" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
    await app.do("OpenPosition", t, { ticker: "GOOG" });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-a1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 150.0 },
    });
    await app.do("AddLot", t, {
      ticker: "GOOG",
      lot: { id: "lot-g1", type: "buy", transaction_date: "2024-01-15", quantity: 50, price: 140.0 },
    });
    const snap = await app.load(Portfolio, t.stream);
    expect(snap.state.positions["AAPL"].lots).toHaveLength(1);
    expect(snap.state.positions["GOOG"].lots).toHaveLength(1);
  });
});

describe("User", () => {
  beforeEach(async () => { await store().seed(); });
  afterAll(async () => { await dispose()(); });

  it("should register a user", async () => {
    const t = { stream: "test@example.com", actor: { id: "system", name: "System", role: "system" as const } };
    await app.do("RegisterUser", t, {
      email: "test@example.com", name: "Test", passwordHash: "hash123", role: "user",
    });
    // Verify via event query
    const events = await app.query_array({ stream: "test@example.com" });
    expect(events.length).toBe(1);
    expect(events[0].name).toBe("UserRegistered");
  });

  it("should assign role", async () => {
    const t = { stream: "admin@example.com", actor: { id: "system", name: "System", role: "system" as const } };
    await app.do("RegisterUser", t, {
      email: "admin@example.com", name: "Admin", passwordHash: "hash123", role: "user",
    });
    await app.do("AssignRole", t, { role: "admin" });
    const events = await app.query_array({ stream: "admin@example.com" });
    expect(events.length).toBe(2);
    expect(events[1].name).toBe("RoleAssigned");
  });
});

describe("Event integrity", () => {
  beforeEach(async () => { await store().seed(); });
  afterAll(async () => { await dispose()(); });

  it("should track actor in events", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    const events = await app.query_array({ stream: t.stream });
    expect(events[0].meta.causation.action?.actor.id).toBe("user-1");
  });

  it("should maintain event ordering", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 150.0 },
    });
    await app.do("ClosePosition", t, { ticker: "AAPL" });
    const events = await app.query_array({ stream: t.stream });
    expect(events.map((e) => e.name)).toEqual([
      "PortfolioCreated", "PositionOpened", "LotAdded", "PositionClosed",
    ]);
    // Versions are sequential
    expect(events.map((e) => e.version)).toEqual([0, 1, 2, 3]);
  });

  it("should not include redundant timestamps in event data", async () => {
    const t = target();
    await app.do("CreatePortfolio", t, { name: "Test" });
    await app.do("OpenPosition", t, { ticker: "AAPL" });
    await app.do("AddLot", t, {
      ticker: "AAPL",
      lot: { id: "lot-1", type: "buy", transaction_date: "2024-01-15", quantity: 100, price: 150.0 },
    });
    const events = await app.query_array({ stream: t.stream });
    for (const e of events) {
      const data = e.data as Record<string, unknown>;
      // No *At fields — timestamps come from event.created
      expect(data).not.toHaveProperty("createdAt");
      expect(data).not.toHaveProperty("updatedAt");
      expect(data).not.toHaveProperty("openedAt");
      expect(data).not.toHaveProperty("addedAt");
      // But event.created exists
      expect(e.created).toBeInstanceOf(Date);
    }
  });
});
