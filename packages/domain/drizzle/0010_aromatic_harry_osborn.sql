CREATE TABLE "market_holidays" (
	"date" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exchange" text DEFAULT 'NYSE' NOT NULL
);
