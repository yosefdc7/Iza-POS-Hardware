import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import path from "node:path";
import fs from "node:fs";

export function isUnixSocketPath(host?: string | null, connectionString?: string | null): boolean {
  if (host && host.startsWith("/")) return true;
  if (connectionString) {
    if (
      connectionString.includes("host=/") ||
      connectionString.includes("/cloudsql/") ||
      connectionString.includes("%2Fcloudsql%2F")
    ) {
      return true;
    }
  }
  return false;
}

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

function createPgPool(customConnectionString?: string): Pool {
  const isProd = process.env.NODE_ENV === "production";

  if (customConnectionString) {
    const isUnix = isUnixSocketPath(undefined, customConnectionString);
    const needsSsl =
      !isUnix &&
      (customConnectionString.includes("sslmode=require") ||
        customConnectionString.includes("sslmode=no-verify") ||
        (isProd && !customConnectionString.includes("localhost") && !customConnectionString.includes("127.0.0.1")));

    const pool = new Pool({
      connectionString: customConnectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (err) => {
      console.warn("[Database Sandbox Pool Warning] Idle client error:", err.message);
    });
    return pool;
  }

  let pool: Pool;
  if (process.env.SQL_USER && process.env.SQL_HOST) {
    const isUnix = isUnixSocketPath(process.env.SQL_HOST);
    pool = new Pool({
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      host: process.env.SQL_HOST,
      port: process.env.SQL_PORT ? Number.parseInt(process.env.SQL_PORT, 10) : 5432,
      ssl: isProd && !isUnix ? { rejectUnauthorized: false } : undefined,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  } else {
    const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/pos";
    const isUnix = isUnixSocketPath(undefined, connectionString);
    const needsSsl =
      !isUnix &&
      (connectionString.includes("sslmode=require") ||
        connectionString.includes("sslmode=no-verify") ||
        (isProd && !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")));

    pool = new Pool({
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 2,
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

    if (process.env.NODE_ENV === "production") throw new Error("Production DATABASE_URL is required");

    const dbDir = path.resolve(process.cwd(), ".data/pglite");
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch (mkdirErr) {
        console.warn("[Database] PGlite directory creation warning:", mkdirErr);
      }
    }
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
    console.warn("[Database] Client initialization fallback active", e);
    // Defer startup errors until use so builds can import modules without a database.
    return new Proxy({}, { get: () => { throw new Error("Database client is unavailable", { cause: e }); } }) as PrismaClient;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
export const db = prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface TableHealthItem {
  name: string;
  description: string;
  essential: boolean;
  exists: boolean;
  rowCount?: number;
}

export interface SanitizedConnectionParams {
  host: string;
  port: number | string;
  database: string;
  user: string;
  sslEnabled: boolean;
  isUnixSocket: boolean;
}

export interface DatabaseDiagnosticResult {
  ok: boolean;
  timestamp: string;
  engine: "postgresql" | "pglite" | "fallback";
  source: "DATABASE_URL" | "SQL_ENVIRONMENT" | "PGLITE_EMBEDDED" | "CUSTOM_TEST";
  sanitizedTarget: string;
  connectionParams: SanitizedConnectionParams;
  host: string;
  database: string;
  latencyMs: number;
  serverVersion?: string;
  tables: string[];
  tableCount: number;
  expectedTableCount: number;
  coreTables: TableHealthItem[];
  stats?: {
    users: number;
    products: number;
    sales: number;
    customers: number;
    settingsConfigured: boolean;
  };
  sslEnabled: boolean;
  prismaOperational: boolean;
  schemaUpToDate: boolean;
  error?: string | null;
  details?: Record<string, unknown>;
}

export const CORE_SCHEMA_TABLES: Array<{ name: string; description: string; essential: boolean }> = [
  { name: "User", description: "Cashiers & administrators", essential: true },
  { name: "BusinessSettings", description: "Store metadata & receipt config", essential: true },
  { name: "Sale", description: "Orders & transactions ledger", essential: true },
  { name: "Product", description: "Inventory catalog items", essential: true },
  { name: "Customer", description: "Customer directory & loyalty", essential: true },
  { name: "HeldOrder", description: "Parked cart sessions", essential: true },
  { name: "ReceiptSeries", description: "Official receipt & series numbering", essential: true },
  { name: "SaleItem", description: "Line items per transaction", essential: false },
  { name: "ProductPackaging", description: "Packaging conversion units", essential: false },
  { name: "StockAdjustment", description: "Inventory audit logs", essential: false },
  { name: "Supplier", description: "Supplier directory & purchase orders", essential: false },
  { name: "Refund", description: "Returns & refund records", essential: false },
  { name: "LoyaltyLog", description: "Points balance transactions", essential: false },
  { name: "Session", description: "Active authentication sessions", essential: false },
  { name: "Account", description: "OAuth & provider accounts", essential: false },
  { name: "Verification", description: "Token verifications", essential: false },
];

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

export async function runDatabaseDiagnostics(options?: {
  customConnectionString?: string;
}): Promise<DatabaseDiagnosticResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Handle custom sandbox connection test
  if (options?.customConnectionString) {
    const customUrl = options.customConnectionString.trim();
    let sanitizedTarget = sanitizeConnectionString(customUrl);
    let host = "custom-host";
    let database = "database";
    let user = "user";
    let port: number | string = 5432;
    const isUnix = isUnixSocketPath(undefined, customUrl);
    let sslEnabled = false;

    try {
      const parsed = new URL(customUrl);
      host = isUnix && customUrl.includes("host=")
        ? (new URLSearchParams(parsed.search).get("host") || parsed.hostname)
        : parsed.hostname;
      port = parsed.port || 5432;
      database = parsed.pathname.replace(/^\//, "") || "postgres";
      user = parsed.username || "postgres";
      sslEnabled = !isUnix && (customUrl.includes("sslmode=require") || customUrl.includes("sslmode=no-verify"));
      sanitizedTarget = sanitizeConnectionString(customUrl);
    } catch {
      host = "parsed via connection string";
    }

    const connectionParams: SanitizedConnectionParams = {
      host,
      port,
      database,
      user,
      sslEnabled,
      isUnixSocket: isUnix,
    };

    let sandboxPool: Pool | null = null;
    try {
      sandboxPool = createPgPool(customUrl);
      const client = await sandboxPool.connect();
      let serverVersion = "unknown";
      let tables: string[] = [];

      try {
        const verRes = await client.query("SELECT version() as ver, NOW() as server_time");
        if (verRes.rows.length > 0) {
          serverVersion = verRes.rows[0].ver;
        }

        const tablesRes = await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC"
        );
        tables = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
      } finally {
        client.release();
      }

      await sandboxPool.end();

      const tableNamesLower = new Set(tables.map((t) => t.toLowerCase()));
      const coreTables: TableHealthItem[] = CORE_SCHEMA_TABLES.map((t) => ({
        name: t.name,
        description: t.description,
        essential: t.essential,
        exists: tableNamesLower.has(t.name.toLowerCase()),
      }));

      const latencyMs = Date.now() - startTime;
      const schemaUpToDate = coreTables.filter((t) => t.essential).every((t) => t.exists);

      return {
        ok: true,
        timestamp,
        engine: "postgresql",
        source: "CUSTOM_TEST",
        sanitizedTarget,
        connectionParams,
        host,
        database,
        latencyMs,
        serverVersion,
        tables,
        tableCount: tables.length,
        expectedTableCount: CORE_SCHEMA_TABLES.length,
        coreTables,
        sslEnabled,
        prismaOperational: false, // Sandbox does not attach Prisma ORM
        schemaUpToDate,
        error: null,
      };
    } catch (err) {
      if (sandboxPool) {
        try {
          await sandboxPool.end();
        } catch {}
      }
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        timestamp,
        engine: "postgresql",
        source: "CUSTOM_TEST",
        sanitizedTarget,
        connectionParams,
        host,
        database,
        latencyMs,
        tables: [],
        tableCount: 0,
        expectedTableCount: CORE_SCHEMA_TABLES.length,
        coreTables: CORE_SCHEMA_TABLES.map((t) => ({ ...t, exists: false })),
        sslEnabled,
        prismaOperational: false,
        schemaUpToDate: false,
        error: errorMessage,
      };
    }
  }

  // Active Database Diagnostic
  let engine: "postgresql" | "pglite" | "fallback" = "fallback";
  let source: "DATABASE_URL" | "SQL_ENVIRONMENT" | "PGLITE_EMBEDDED" = "PGLITE_EMBEDDED";
  let sanitizedTarget = "embedded://.data/pglite";
  let host = "local (pglite)";
  let database = "pos";
  let user = "pglite";
  let port: number | string = 5432;
  let sslEnabled = false;
  let isUnix = false;

  if (process.env.SQL_USER && process.env.SQL_HOST) {
    engine = "postgresql";
    source = "SQL_ENVIRONMENT";
    host = process.env.SQL_HOST;
    port = process.env.SQL_PORT ? Number.parseInt(process.env.SQL_PORT, 10) : 5432;
    database = process.env.SQL_DB_NAME || "cloud_sql_database";
    user = process.env.SQL_USER;
    isUnix = isUnixSocketPath(host);
    sslEnabled = process.env.NODE_ENV === "production" && !isUnix;
    sanitizedTarget = `postgresql://${user}:******@${host}:${port}/${database}`;
  } else if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("<password>")) {
    engine = "postgresql";
    source = "DATABASE_URL";
    sanitizedTarget = sanitizeConnectionString(process.env.DATABASE_URL);
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      isUnix = isUnixSocketPath(parsed.hostname, process.env.DATABASE_URL);
      host = isUnix && process.env.DATABASE_URL.includes("host=")
        ? (new URLSearchParams(parsed.search).get("host") || parsed.hostname)
        : parsed.hostname;
      port = parsed.port || 5432;
      database = parsed.pathname.replace(/^\//, "") || "postgres";
      user = parsed.username || "postgres";
      sslEnabled =
        !isUnix &&
        (process.env.DATABASE_URL.includes("sslmode=") ||
          (process.env.NODE_ENV === "production" && !host.includes("localhost") && !host.includes("127.0.0.1")));
    } catch {
      host = "configured via DATABASE_URL";
    }
  } else {
    engine = "pglite";
    source = "PGLITE_EMBEDDED";
    database = "pos";
    host = "embedded (in-process)";
    user = "postgres";
    port = "N/A";
    sslEnabled = false;
    isUnix = false;
  }

  const connectionParams: SanitizedConnectionParams = {
    host,
    port,
    database,
    user,
    sslEnabled,
    isUnixSocket: isUnix,
  };

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
    } else if (engine === "pglite") {
      try {
        const verRes = await prisma.$queryRaw<Array<{ ver: string }>>`SELECT version() as ver`;
        if (verRes && verRes.length > 0) {
          serverVersion = verRes[0].ver;
        } else {
          serverVersion = "PGlite (Embedded PostgreSQL WASM/NodeFS)";
        }
      } catch {
        serverVersion = "PGlite (Embedded PostgreSQL WASM/NodeFS)";
      }

      try {
        const tablesRes = await prisma.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC
        `;
        tables = tablesRes.map((r) => r.table_name);
      } catch (err) {
        console.warn("[Diagnostics] PGlite table extraction warning:", err);
      }
    }

    const tableNamesLower = new Set(tables.map((t) => t.toLowerCase()));

    // 2. Core tables checklist
    const coreTables: TableHealthItem[] = CORE_SCHEMA_TABLES.map((t) => ({
      name: t.name,
      description: t.description,
      essential: t.essential,
      exists: tableNamesLower.has(t.name.toLowerCase()),
    }));

    // 3. Prisma ORM verification
    let prismaOperational = false;
    let usersCount = 0;
    let productsCount = 0;
    let salesCount = 0;
    let customersCount = 0;
    let settingsConfigured = false;

    try {
      const [uCount, pCount, sCount, cCount, bSettings] = await Promise.all([
        tableNamesLower.has("user") ? prisma.user.count().catch(() => 0) : 0,
        tableNamesLower.has("product") ? prisma.product.count().catch(() => 0) : 0,
        tableNamesLower.has("sale") ? prisma.sale.count().catch(() => 0) : 0,
        tableNamesLower.has("customer") ? prisma.customer.count().catch(() => 0) : 0,
        tableNamesLower.has("businesssettings") ? prisma.businessSettings.findFirst().catch(() => null) : null,
      ]);

      usersCount = uCount;
      productsCount = pCount;
      salesCount = sCount;
      customersCount = cCount;
      settingsConfigured = !!bSettings;
      prismaOperational = true;

      // Attach row counts to core table entries
      for (const ct of coreTables) {
        if (ct.name === "User" && ct.exists) ct.rowCount = uCount;
        else if (ct.name === "Product" && ct.exists) ct.rowCount = pCount;
        else if (ct.name === "Sale" && ct.exists) ct.rowCount = sCount;
        else if (ct.name === "Customer" && ct.exists) ct.rowCount = cCount;
        else if (ct.name === "BusinessSettings" && ct.exists) ct.rowCount = bSettings ? 1 : 0;
      }
    } catch (prismaErr) {
      console.warn("[Diagnostics] Prisma query warning:", prismaErr);
      prismaOperational = false;
    }

    const latencyMs = Date.now() - startTime;
    const schemaUpToDate = coreTables.filter((t) => t.essential).every((t) => t.exists);

    return {
      ok: true,
      timestamp,
      engine,
      source,
      sanitizedTarget,
      connectionParams,
      host,
      database,
      latencyMs,
      serverVersion,
      tables,
      tableCount: tables.length,
      expectedTableCount: CORE_SCHEMA_TABLES.length,
      coreTables,
      stats: {
        users: usersCount,
        products: productsCount,
        sales: salesCount,
        customers: customersCount,
        settingsConfigured,
      },
      sslEnabled,
      prismaOperational,
      schemaUpToDate,
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
      connectionParams,
      host,
      database,
      latencyMs,
      tables: [],
      tableCount: 0,
      expectedTableCount: CORE_SCHEMA_TABLES.length,
      coreTables: CORE_SCHEMA_TABLES.map((t) => ({ ...t, exists: false })),
      sslEnabled,
      prismaOperational: false,
      schemaUpToDate: false,
      error: errorMessage,
    };
  }
}
