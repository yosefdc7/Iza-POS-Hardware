import { describe, it, expect } from "vitest";
import {
  isUnixSocketPath,
  sanitizeConnectionString,
  CORE_SCHEMA_TABLES,
  runDatabaseDiagnostics,
} from "@/lib/db";

describe("Database Diagnostics Utility", () => {
  describe("isUnixSocketPath", () => {
    it("identifies host strings starting with / as Unix domain sockets", () => {
      expect(isUnixSocketPath("/cloudsql/project:region:instance")).toBe(true);
      expect(isUnixSocketPath("/var/run/postgresql")).toBe(true);
      expect(isUnixSocketPath("/tmp")).toBe(true);
    });

    it("identifies connection strings with host=/cloudsql/ as Unix domain sockets", () => {
      const connStr = "postgresql://user:pass@/pos?host=/cloudsql/project:region:instance";
      expect(isUnixSocketPath(undefined, connStr)).toBe(true);
      const encodedConnStr = "postgresql://user:pass@/pos?host=%2Fcloudsql%2Fproject%3Aregion%3Ainstance";
      expect(isUnixSocketPath(undefined, encodedConnStr)).toBe(true);
    });

    it("identifies TCP hosts as non-Unix sockets", () => {
      expect(isUnixSocketPath("localhost")).toBe(false);
      expect(isUnixSocketPath("127.0.0.1")).toBe(false);
      expect(isUnixSocketPath("db.example.com")).toBe(false);
      expect(isUnixSocketPath(undefined, "postgresql://user:pass@localhost:5432/pos")).toBe(false);
    });
  });

  describe("sanitizeConnectionString", () => {
    it("replaces passwords with ****** in valid URLs", () => {
      const input = "postgresql://postgres:mySecretPass123@db.supabase.co:5432/postgres";
      const sanitized = sanitizeConnectionString(input);
      expect(sanitized).not.toContain("mySecretPass123");
      expect(sanitized).toContain("******");
      expect(sanitized).toContain("db.supabase.co");
      expect(sanitized).toContain("postgres");
    });

    it("handles connection strings without passwords", () => {
      const input = "postgresql://postgres@localhost:5432/pos";
      const sanitized = sanitizeConnectionString(input);
      expect(sanitized).toBe(input);
    });

    it("returns N/A for empty or undefined inputs", () => {
      expect(sanitizeConnectionString(undefined)).toBe("N/A");
      expect(sanitizeConnectionString("")).toBe("N/A");
    });
  });

  describe("CORE_SCHEMA_TABLES", () => {
    it("contains all 16 core schema tables", () => {
      expect(CORE_SCHEMA_TABLES).toHaveLength(16);
      const names = CORE_SCHEMA_TABLES.map((t) => t.name);
      expect(names).toContain("User");
      expect(names).toContain("BusinessSettings");
      expect(names).toContain("Sale");
      expect(names).toContain("Product");
      expect(names).toContain("Customer");
      expect(names).toContain("HeldOrder");
      expect(names).toContain("ReceiptSeries");
      expect(names).toContain("SaleItem");
      expect(names).toContain("ProductPackaging");
      expect(names).toContain("StockAdjustment");
      expect(names).toContain("Supplier");
      expect(names).toContain("Refund");
      expect(names).toContain("LoyaltyLog");
      expect(names).toContain("Session");
      expect(names).toContain("Account");
      expect(names).toContain("Verification");
    });

    it("has exactly 7 essential core tables", () => {
      const essential = CORE_SCHEMA_TABLES.filter((t) => t.essential);
      expect(essential).toHaveLength(7);
      const essentialNames = essential.map((t) => t.name);
      expect(essentialNames).toEqual([
        "User",
        "BusinessSettings",
        "Sale",
        "Product",
        "Customer",
        "HeldOrder",
        "ReceiptSeries",
      ]);
    });
  });

  describe("runDatabaseDiagnostics", () => {
    it("runs diagnostic on active local database without throwing", async () => {
      const result = await runDatabaseDiagnostics();
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe("boolean");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.coreTables)).toBe(true);
      expect(result.coreTables).toHaveLength(16);
      expect(result.connectionParams).toBeDefined();
      expect(result.connectionParams.host).toBeDefined();
    });

    it("handles sandbox test with invalid connection string gracefully", async () => {
      const invalidUrl = "postgresql://user:pass@127.0.0.1:59999/nonexistent_db?sslmode=disable";
      const result = await runDatabaseDiagnostics({ customConnectionString: invalidUrl });
      expect(result.ok).toBe(false);
      expect(result.source).toBe("CUSTOM_TEST");
      expect(result.error).toBeDefined();
      expect(result.sanitizedTarget).toContain("******");
      expect(result.sanitizedTarget).not.toContain("pass");
    });
  });
});
