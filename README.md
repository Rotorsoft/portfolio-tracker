# Portfolio Tracker

An event-sourced portfolio tracker with live quotes, technical analysis signals, entry grading, and what-if scenario modeling. Built with [@rotorsoft/act](https://github.com/Rotorsoft/act) for event sourcing, tRPC for end-to-end type safety, and React for the frontend.

## Architecture

```
portfolio-tracker/
  packages/
    domain/          Event-sourced aggregates, projections, technical indicators
    app/
      src/client/    React SPA (Tailwind, Recharts, tRPC client)
      src/api/       tRPC server, Yahoo Finance integration
  scripts/           Backup/restore utilities
```

**Event Sourcing** powers the core domain. Portfolio commands (create, open position, add lot) produce events that are projected into Drizzle/PostgreSQL read models. This gives you a complete audit trail and the ability to replay or rebuild state from events.

**Key patterns:**
- Commands validate and emit events via `@rotorsoft/act`
- Projections materialize events into queryable tables (portfolios, positions, lots, tickers)
- tRPC provides full TypeScript type safety from DB to UI
- React Query handles caching, polling, and invalidation
- Yahoo Finance API provides historical prices, fundamentals, and live quotes

## Features

### Portfolio Management
- Multiple portfolios with configurable currency and cutoff dates
- Buy/sell lot tracking with fees and notes
- Bulk lot import and position management

### Live Market Data
- Real-time quotes polling every 5 minutes (configurable)
- Auto-backfill daily prices on server start when behind
- Market open/closed indicator with countdown timer
- Daily portfolio value delta in summary bar

### Technical Analysis
- **Composite Signal System** -- weighted score from RSI, MACD, Bollinger Bands, MA trend, momentum, and volume
- **Entry Grading** (A-F) -- evaluates each buy lot against RSI, Bollinger position, MA trend, price timing, and volume at time of purchase
- **Chart Overlays** -- MA50, MA200, Bollinger Bands on price charts
- **Intraday Alerts** -- detects live price crossing MA50/MA200 or big daily moves (3%+)

### Position Analytics
- Timing score (where your entry sits in the price range)
- DCA comparison (your actual cost vs. dollar-cost averaging)
- Max drawdown and days underwater
- 52-week range position
- Entry vs MA50 at time of purchase

### Avg-Down Opportunities
- Highlights when live price drops below your last buy price
- Configurable dip threshold per portfolio (default 5%)
- Hover tooltip shows 3 scenarios (buy 25%, 50%, or 100% more shares)
- Color intensity reflects opportunity quality (bigger dip = greener)

### What-If Analysis
- Compare actual portfolio performance against buying everything on a single date
- Timeline chart showing actual vs hypothetical portfolio value
- Per-ticker cost comparison with savings/overpayment breakdown

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Event Store | [@rotorsoft/act](https://github.com/Rotorsoft/act) + PostgreSQL |
| API | tRPC 11, Zod 4 |
| Database | Drizzle ORM, PostgreSQL 17 |
| Frontend | React 19, Tailwind CSS 4, Recharts |
| Build | Vite 7, TypeScript 5.9, pnpm workspaces |
| Testing | Vitest 4 (197 tests, 98.7% line coverage) |
| Market Data | Yahoo Finance (chart API, quoteSummary API) |

## Getting Started

### Prerequisites

- Node.js >= 22.18
- pnpm >= 10.32
- Docker (for PostgreSQL)

### Setup

```bash
# Clone and install
git clone https://github.com/Rotorsoft/portfolio-tracker.git
cd portfolio-tracker
pnpm install

# Start PostgreSQL
docker compose up -d

# Run database migrations
pnpm -F @rotorsoft/portfolio-tracker-domain drizzle:migrate

# Start dev server (API + client)
pnpm dev
```

The app will be available at `http://localhost:5173` with the API on port `4000`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5479/postgres` | PostgreSQL connection string |
| `PG_HOST` | `localhost` | Database host |
| `PG_PORT` | `5479` | Database port |
| `PG_DATABASE` | `postgres` | Database name |
| `PG_USER` | `postgres` | Database user |
| `PG_PASSWORD` | `postgres` | Database password |
| `SESSION_SECRET` | `portfolio-tracker-dev-secret` | JWT signing secret |

## Scripts

```bash
pnpm dev          # Start API server + Vite dev server
pnpm build        # Build all packages
pnpm test         # Run tests
pnpm typecheck    # TypeScript type checking
pnpm start        # Start production server
pnpm backup       # Backup event stream to CSV
pnpm restore      # Restore events from backup
```

### Database

```bash
# Generate a new migration after schema changes
pnpm -F @rotorsoft/portfolio-tracker-domain drizzle:generate

# Apply migrations
pnpm -F @rotorsoft/portfolio-tracker-domain drizzle:migrate
```

## Domain Model

### Aggregates

**Portfolio** -- the root aggregate, manages positions and lots through commands:

| Command | Event | Description |
|---------|-------|-------------|
| `CreatePortfolio` | `PortfolioCreated` | Create a new portfolio |
| `UpdatePortfolio` | `PortfolioUpdated` | Update name, description, currency, cutoff, dip threshold |
| `ArchivePortfolio` | `PortfolioArchived` | Archive (soft delete) |
| `OpenPosition` | `PositionOpened` | Add a ticker to the portfolio |
| `ClosePosition` | `PositionClosed` | Close a position |
| `AddLot` | `LotAdded` | Record a buy or sell transaction |
| `RemoveLot` | `LotRemoved` | Remove a transaction |

**User** -- authentication and role management:

| Command | Event | Description |
|---------|-------|-------------|
| `RegisterUser` | `UserRegistered` | Create user account |
| `AssignRole` | `RoleAssigned` | Set admin or user role |

### Projections

Events are projected into these read models:

- **portfolios** -- portfolio metadata and settings
- **positions** -- per-ticker aggregated stats (shares, cost, analytics)
- **lots** -- individual transactions with entry grades
- **tickers** -- market data, technical indicators, composite signals
- **prices** -- daily OHLCV price history
- **ticker_fundamentals** -- P/E, EPS, dividend yield, market cap
- **users** -- authentication data

### Technical Indicators

All indicator functions are pure (no side effects) and tested independently:

- `sma(prices, period)` -- Simple Moving Average
- `ema(prices, period)` -- Exponential Moving Average
- `rsi(prices, period)` -- Relative Strength Index (Wilder's smoothed)
- `macd(prices)` -- MACD line, signal, histogram (12/26/9)
- `bollingerBands(prices)` -- Upper, middle, lower bands (20-day, 2 std dev)
- `roc(prices, period)` -- Rate of Change
- `volumeRatio(prices)` -- Current vs average volume
- `volatility30d(prices)` -- 30-day annualized volatility
- `computeCompositeSignal(prices)` -- Weighted composite (strong buy/buy/hold/sell/strong sell)
- `computeEntryGrade(prices, entryPrice, entryDate)` -- Entry quality (A-F)

## API Endpoints

### Authentication
- `login` / `signup` -- credential-based auth returning JWT
- `me` -- current user info

### Portfolio Operations
- `createPortfolio` / `updatePortfolio` / `archivePortfolio`
- `openPosition` / `closePosition`
- `addLot` / `removeLot`

### Market Data
- `getTickers` / `getTicker` -- ticker metadata and indicators
- `getTickerPrices` -- OHLCV history with date range filtering
- `getQuotes` -- live quotes (cached 5 min)
- `getFundamentals` / `getBulkFundamentals` -- P/E, yield, market cap
- `requestBackfill` -- fetch prices from Yahoo Finance

### Analytics
- `getPortfolioSummary` -- totals + per-position metrics
- `getEntryAnalysis` -- timing, DCA comparison, per-lot grades
- `getChartOverlays` -- MA and Bollinger series for charts
- `getWhatIfComparison` -- hypothetical scenario modeling
- `getTickerPerformance` -- price history relative to entry

### Real-time
- `onEvent` -- WebSocket subscription to all domain events

## Testing

```bash
pnpm test                    # Run all tests
pnpm vitest run --coverage   # Run with coverage report
```

Coverage is tracked across domain logic and client utilities:

| File | Statements | Lines | Functions |
|------|-----------|-------|-----------|
| indicators.ts | 99% | 100% | 100% |
| portfolio.ts | 94% | 100% | 100% |
| ticker.ts | 96% | 100% | 100% |
| live.ts | 92% | 92% | 100% |
| fmt.ts | 100% | 100% | 100% |
| **All files** | **97%** | **99%** | **100%** |

## Data Flow

```
Yahoo Finance API
    |
    v
requestBackfill (tRPC mutation)
    |
    v
backfillPrices() --> prices table
    |
    v
recomputeIndicators() --> tickers table (RSI, MACD, signals)
    |
    v
recalcPositionAnalytics() --> positions table (timing, grades)
    |
    v
getPortfolioSummary() --> React UI
    |
    v
getQuotes() (5 min poll) --> live price overlay in UI
```

## Backup & Restore

The event store is the source of truth. All read models can be rebuilt from events.

```bash
# Backup events to timestamped CSV
pnpm backup

# Restore from a backup file
pnpm restore
```

Backups are stored in the `backups/` directory.

## License

Private
