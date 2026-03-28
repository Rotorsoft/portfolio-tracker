import { store } from "@rotorsoft/act";
import { PostgresStore } from "@rotorsoft/act-pg";
import { app, initDb, migrateDb, db } from "@portfolio-tracker/domain";
import { sql } from "drizzle-orm";

const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5479/postgres";

export async function bootstrap() {
  // Event store → PostgreSQL
  store(
    new PostgresStore({
      host: process.env.PG_HOST ?? "localhost",
      port: Number(process.env.PG_PORT ?? 5479),
      database: process.env.PG_DATABASE ?? "postgres",
      user: process.env.PG_USER ?? "postgres",
      password: process.env.PG_PASSWORD ?? "postgres",
    })
  );
  await store().seed();

  // Drizzle projections
  initDb(DB_URL);
  await migrateDb();

  // Unblock stuck projection streams
  await db().execute(
    sql`UPDATE public.events_streams SET blocked = false, error = null, retry = 0 WHERE blocked = true`
  );

  const settleOpts = { maxPasses: 10, streamLimit: 100, eventLimit: 1000 };

  // Settle after every commit
  app.on("committed", () => app.settle(settleOpts));

  // Settle on startup
  await new Promise<void>((resolve) => {
    app.on("settled", function handler() {
      app.off("settled", handler);
      resolve();
    });
    app.settle(settleOpts);
  });

  // Diagnostic: log stream watermarks after settle
  const streams = await db().execute(sql`SELECT stream, at, blocked FROM public.events_streams ORDER BY stream`);
  const maxEvent = await db().execute(sql`SELECT max(id) as max_id FROM public.events`);
  console.log(`[bootstrap] max event: ${(maxEvent as any)[0]?.max_id}`);
  for (const s of streams as any[]) {
    console.log(`[bootstrap] stream ${s.stream}: at=${s.at} blocked=${s.blocked}`);
  }
}
