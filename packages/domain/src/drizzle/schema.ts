import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("active"),
  cutoffDate: text("cutoff_date").notNull().default(""),
  dipThreshold: real("dip_threshold").notNull().default(5),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const positions = pgTable("positions", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull(),
  ticker: text("ticker").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("open"),
  totalShares: real("total_shares").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  avgCostBasis: real("avg_cost_basis").notNull().default(0),
  openedAt: text("opened_at").notNull().default(""),
  closedAt: text("closed_at").notNull().default(""),
  timingScore: real("timing_score").notNull().default(50),
  dcaSavingsPct: real("dca_savings_pct").notNull().default(0),
  periodAvg: real("period_avg").notNull().default(0),
  periodLow: real("period_low").notNull().default(0),
  periodHigh: real("period_high").notNull().default(0),
  // Technical indicators at entry (computed on backfill + lot changes)
  ma50AtEntry: real("ma50_at_entry").notNull().default(0),
  ma200AtEntry: real("ma200_at_entry").notNull().default(0),
  entryVsMa50: real("entry_vs_ma50").notNull().default(0),
  maxDrawdown: real("max_drawdown").notNull().default(0),
  daysUnderwater: integer("days_underwater").notNull().default(0),
  yearlyRangePct: real("yearly_range_pct").notNull().default(50),
  entryGrade: text("entry_grade").notNull().default("C"),
  entryGradeScore: real("entry_grade_score").notNull().default(50),
  rsiAtEntry: real("rsi_at_entry").notNull().default(50),
  bollingerPctAtEntry: real("bollinger_pct_at_entry").notNull().default(50),
  // Benchmark (S&P 500) comparison — cached, recomputed on lot changes
  benchmarkShares: real("benchmark_shares").notNull().default(0),  // hypothetical VOO shares if same $ invested
  benchmarkCost: real("benchmark_cost").notNull().default(0),      // total $ invested (same as totalCost)
  benchmarkValue: real("benchmark_value").notNull().default(0),    // current value of hypothetical VOO
  benchmarkReturnPct: real("benchmark_return_pct").notNull().default(0),
  actualReturnPct: real("actual_return_pct").notNull().default(0),
  alphaPct: real("alpha_pct").notNull().default(0),                // actual return - benchmark return
});

export const lots = pgTable("lots", {
  id: text("id").primaryKey(),
  positionId: text("position_id").notNull(),
  portfolioId: text("portfolio_id").notNull(),
  ticker: text("ticker").notNull(),
  type: text("type").notNull(), // 'buy' | 'sell'
  transactionDate: text("transaction_date").notNull(),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  fees: real("fees").notNull().default(0),
  notes: text("notes").notNull().default(""),
  grade: text("grade").notNull().default(""),
  gradeScore: real("grade_score").notNull().default(0),
  gradeExplanation: text("grade_explanation").notNull().default(""),
});

export const tickers = pgTable("tickers", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull().default(""),
  exchange: text("exchange").notNull().default(""),
  priceCount: integer("price_count").notNull().default(0),
  firstPriceDate: text("first_price_date").notNull().default(""),
  lastPriceDate: text("last_price_date").notNull().default(""),
  lastClose: real("last_close").notNull().default(0),
  previousClose: real("previous_close").notNull().default(0),
  registeredAt: text("registered_at").notNull().default(""),
  // Technical indicators (computed on backfill)
  ma50: real("ma50").notNull().default(0),
  ma200: real("ma200").notNull().default(0),
  volatility30d: real("volatility_30d").notNull().default(0),
  yearlyHigh: real("yearly_high").notNull().default(0),
  yearlyLow: real("yearly_low").notNull().default(0),
  signal: text("signal").notNull().default("hold"),
  compositeScore: real("composite_score").notNull().default(0),
  rsi14: real("rsi_14").notNull().default(50),
  macdLine: real("macd_line").notNull().default(0),
  macdSignalLine: real("macd_signal_line").notNull().default(0),
  macdHistogram: real("macd_histogram").notNull().default(0),
  roc10: real("roc_10").notNull().default(0),
  roc20: real("roc_20").notNull().default(0),
  volumeRatio: real("volume_ratio").notNull().default(1),
});

export const tickerFundamentals = pgTable("ticker_fundamentals", {
  symbol: text("symbol").primaryKey(),
  trailingPE: real("trailing_pe"),
  forwardPE: real("forward_pe"),
  epsTrailing: real("eps_trailing"),
  epsForward: real("eps_forward"),
  dividendYield: real("dividend_yield"),
  marketCap: real("market_cap"),
  bookValue: real("book_value"),
  priceToBook: real("price_to_book"),
  fiftyTwoWeekHigh: real("fifty_two_week_high"),
  fiftyTwoWeekLow: real("fifty_two_week_low"),
  sector: text("sector"),
  industry: text("industry"),
  fetchedAt: text("fetched_at").notNull(),
});

export const prices = pgTable(
  "prices",
  {
    ticker: text("ticker").notNull(),
    date: text("date").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: integer("volume").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.ticker, table.date] })]
);
