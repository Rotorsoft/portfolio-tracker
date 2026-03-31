ALTER TABLE "positions" ADD COLUMN "benchmark_shares" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "benchmark_cost" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "benchmark_value" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "benchmark_return_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "actual_return_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "alpha_pct" real DEFAULT 0 NOT NULL;