ALTER TABLE "positions" ADD COLUMN "ma50_at_entry" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "ma200_at_entry" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "entry_vs_ma50" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "max_drawdown" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "days_underwater" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "yearly_range_pct" real DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "ma50" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "ma200" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "volatility_30d" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "yearly_high" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "yearly_low" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "signal" text DEFAULT 'hold' NOT NULL;