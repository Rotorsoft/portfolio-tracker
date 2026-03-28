CREATE TABLE "lots" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"ticker" text NOT NULL,
	"type" text NOT NULL,
	"transaction_date" text NOT NULL,
	"quantity" real NOT NULL,
	"price" real NOT NULL,
	"fees" real DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cutoff_date" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"ticker" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total_shares" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"avg_cost_basis" real DEFAULT 0 NOT NULL,
	"opened_at" text DEFAULT '' NOT NULL,
	"closed_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"ticker" text NOT NULL,
	"date" text NOT NULL,
	"open" real NOT NULL,
	"high" real NOT NULL,
	"low" real NOT NULL,
	"close" real NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prices_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "tickers" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"exchange" text DEFAULT '' NOT NULL,
	"price_count" integer DEFAULT 0 NOT NULL,
	"last_price_date" text DEFAULT '' NOT NULL,
	"last_close" real DEFAULT 0 NOT NULL,
	"registered_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" text DEFAULT '' NOT NULL
);
