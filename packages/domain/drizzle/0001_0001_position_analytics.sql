ALTER TABLE "positions" ADD COLUMN "timing_score" real DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "dca_savings_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "period_avg" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "period_low" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "period_high" real DEFAULT 0 NOT NULL;