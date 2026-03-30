DO $$ BEGIN
  ALTER TABLE "portfolios" ADD COLUMN "dip_threshold" real DEFAULT 5 NOT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
