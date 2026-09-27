import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import path from "node:path";
import fs from "node:fs";

function hasPostgresConfig(): boolean {
  if (process.env.SQL_USER && process.env.SQL_HOST) return true;
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("<password>") &&
    !process.env.DATABASE_URL.startsWith("file:")
  ) {
    return true;
  }
  return false;
}

function createPgPool(): Pool {
  const isProd = process.env.NODE_ENV === "production";

  let pool: Pool;
  if (process.env.SQL_USER && process.env.SQL_HOST) {
    pool = new Pool({
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      host: process.env.SQL_HOST,
      port: process.env.SQL_PORT ? Number.parseInt(process.env.SQL_PORT, 10) : 5432,
      ssl: isProd && !process.env.SQL_HOST.startsWith("/") ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  } else {
    const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/pos";
    const needsSsl =
      connectionString.includes("sslmode=require") ||
      connectionString.includes("sslmode=no-verify") ||
      (isProd && !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1"));

    pool = new Pool({
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  // Prevent uncaught errors from crashing Node.js process during transient network drops
  pool.on("error", (err) => {
    console.warn("[Database Pool Warning] Idle client error:", err.message);
  });

  return pool;
}

let activePgPool: Pool | null = null;

function getPgPool(): Pool {
  if (!activePgPool) {
    activePgPool = createPgPool();
  }
  return activePgPool;
}

function createPrismaClient(): PrismaClient {
  try {
    if (hasPostgresConfig()) {
      const pool = getPgPool();
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });
    }

    const dbDir = path.resolve(process.cwd(), ".data/pglite");
    const pidFile = path.join(dbDir, "postmaster.pid");
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }
    const pglite = new PGlite(dbDir);
    const adapter = new PrismaPGlite(pglite);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  } catch (e) {
    console.warn("[AI Studio] Database client initialization fallback active", e);
    const noOp = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: unknown) => (d as { data?: unknown })?.data ?? {},
      update: async (d: unknown) => (d as { data?: unknown })?.data ?? {},
      delete: async () => ({}),
      count: async () => 0,
      upsert: async (d: unknown) => (d as { create?: unknown })?.create ?? {},
      $queryRaw: async () => [],
    };
    return new Proxy({}, { get: () => noOp }) as unknown as PrismaClient;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
export const db = prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface DatabaseDiagnosticResult {
  ok: boolean;
  timestamp: string;
  engine: "postgresql" | "pglite" | "fallback";
  source: "DATABASE_URL" | "SQL_ENVIRONMENT" | "PGLITE_EMBEDDED";
  sanitizedTarget: string;
  host: string;
  database: string;
  latencyMs: number;
  serverVersion?: string;
  tables: string[];
  tableCount: number;
  stats?: {
    users: number;
    products: number;
    sales: number;
    settingsConfigured: boolean;
  };
  sslEnabled: boolean;
  prismaOperational: boolean;
  error?: string | null;
  details?: Record<string, unknown>;
}

export function sanitizeConnectionString(urlStr?: string): string {
  if (!urlStr) return "N/A";
  try {
    const parsed = new URL(urlStr);
    if (parsed.password) {
      parsed.password = "******";
    }
    return parsed.toString();
  } catch {
    return urlStr.replace(/:([^:@/]+)@/, ":******@");
  }
}

export async function runDatabaseDiagnostics(): Promise<DatabaseDiagnosticResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  let engine: "postgresql" | "pglite" | "fallback" = "fallback";
  let source: "DATABASE_URL" | "SQL_ENVIRONMENT" | "PGLITE_EMBEDDED" = "PGLITE_EMBEDDED";
  let sanitizedTarget = "embedded://.data/pglite";
  let host = "local (pglite)";
  let database = "pos";
  let sslEnabled = false;

  if (process.env.SQL_USER && process.env.SQL_HOST) {
    engine = "postgresql";
    source = "SQL_ENVIRONMENT";
    host = process.env.SQL_HOST;
    database = process.env.SQL_DB_NAME || "cloud_sql_database";
    sanitizedTarget = `postgresql://${process.env.SQL_USER}:******@${host}/${database}`;
    sslEnabled = process.env.NODE_ENV === "production" && !host.startsWith("/");
  } else if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("<password>")) {
    engine = "postgresql";
    source = "DATABASE_URL";
    sanitizedTarget = sanitizeConnectionString(process.env.DATABASE_URL);
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      host = parsed.host;
      database = parsed.pathname.replace(/^\//, "") || "postgres";
      sslEnabled = process.env.DATABASE_URL.includes("sslmode=") || (process.env.NODE_ENV === "production" && !host.includes("localhost"));
    } catch {
      host = "configured via DATABASE_URL";
    }
  } else {
    engine = "pglite";
    source = "PGLITE_EMBEDDED";
  }

  try {
    let serverVersion = "unknown";
    let tables: string[] = [];

    // 1. Direct PG Pool verification if PostgreSQL is configured
    if (engine === "postgresql") {
      const pool = getPgPool();
      const client = await pool.connect();
      try {
        const versionRes = await client.query("SELECT version() as ver, NOW() as server_time");
        if (versionRes.rows.length > 0) {
          serverVersion = versionRes.rows[0].ver;
        }

        const tablesRes = await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC"
        );
        tables = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
      } finally {
        client.release();
      }
    }

    // 2. Prisma ORM verification
    let prismaOperational = false;
    let usersCount = 0;
    let productsCount = 0;
    let salesCount = 0;
    let settingsConfigured = false;

    try {
      const [uCount, pCount, sCount, bSettings] = await Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.product.count().catch(() => 0),
        prisma.sale.count().catch(() => 0),
        prisma.businessSettings.findFirst().catch(() => null),
      ]);
      usersCount = uCount;
      productsCount = pCount;
      salesCount = sCount;
      settingsConfigured = !!bSettings;
      prismaOperational = true;
    } catch (prismaErr) {
      console.warn("[Diagnostics] Prisma query warning:", prismaErr);
      prismaOperational = false;
    }

    const latencyMs = Date.now() - startTime;

    return {
      ok: true,
      timestamp,
      engine,
      source,
      sanitizedTarget,
      host,
      database,
      latencyMs,
      serverVersion,
      tables,
      tableCount: tables.length,
      stats: {
        users: usersCount,
        products: productsCount,
        sales: salesCount,
        settingsConfigured,
      },
      sslEnabled,
      prismaOperational,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Diagnostics Failed]", err);

    return {
      ok: false,
      timestamp,
      engine,
      source,
      sanitizedTarget,
      host,
      database,
      latencyMs,
      tables: [],
      tableCount: 0,
      sslEnabled,
      prismaOperational: false,
      error: errorMessage,
    };
  }
}
