import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

export { users, portfolios, positions, lots, tickers, tickerFundamentals, prices } from "./schema.js";

/** PostgresStore deserializes ISO dates to Date objects via dateReviver.
 *  Drizzle text columns need strings. This safely converts. */
export function str(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return String(val ?? "");
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function initDb(connectionString?: string) {
  const connStr =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5479/postgres";

  _client = postgres(connStr);
  _db = drizzle(_client, { schema });
  return _db;
}

export function db() {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

export async function migrateDb(connectionString?: string) {
  const connStr =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5479/postgres";
  const migrationClient = postgres(connStr, { max: 1 });
  const migrationDb = drizzle(migrationClient);
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(__dirname, "../../drizzle");
  await migrate(migrationDb, { migrationsFolder });
  await migrationClient.end();
}

export async function truncateAll() {
  const d = db();
  await d.execute(sql`TRUNCATE users, portfolios, positions, lots, tickers, prices`);
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}
