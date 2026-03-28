CREATE TABLE IF NOT EXISTS ticker_fundamentals (
  symbol TEXT PRIMARY KEY,
  trailing_pe REAL,
  forward_pe REAL,
  eps_trailing REAL,
  eps_forward REAL,
  dividend_yield REAL,
  market_cap REAL,
  book_value REAL,
  price_to_book REAL,
  fifty_two_week_high REAL,
  fifty_two_week_low REAL,
  sector TEXT,
  industry TEXT,
  fetched_at TEXT NOT NULL
);
