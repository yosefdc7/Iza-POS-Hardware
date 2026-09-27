import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_HARDWARE_UNITS, UnitOption } from "@/lib/hardware-units";
import { requireAdmin } from "@/lib/require-admin";

async function ensureStoreUnitTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "StoreUnit" (
        "name" TEXT PRIMARY KEY,
        "label" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'Custom',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch {
    // If running in restricted environment or already exists, ignore
  }
}

export async function GET() {
  await ensureStoreUnitTable();

  let customUnits: UnitOption[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string; label: string; category: string }>>(
      `SELECT "name", "label", "category" FROM "StoreUnit" ORDER BY "name" ASC`
    );
    customUnits = rows.map((r) => ({
      value: r.name,
      label: r.label,
      category: "Custom",
    }));
  } catch {
    customUnits = [];
  }

  // Also discover any distinct units currently used on products
  let productUnits: string[] = [];
  try {
    const distinct = await prisma.product.findMany({
      select: { unit: true },
      distinct: ["unit"],
    });
    productUnits = distinct.map((p) => p.unit).filter(Boolean);
  } catch {
    productUnits = [];
  }

  const seen = new Set<string>();
  const combined: UnitOption[] = [];

  for (const u of DEFAULT_HARDWARE_UNITS) {
    if (!seen.has(u.value.toLowerCase())) {
      seen.add(u.value.toLowerCase());
      combined.push(u);
    }
  }

  for (const c of customUnits) {
    if (!seen.has(c.value.toLowerCase())) {
      seen.add(c.value.toLowerCase());
      combined.push(c);
    }
  }

  for (const pu of productUnits) {
    if (!seen.has(pu.toLowerCase())) {
      seen.add(pu.toLowerCase());
      combined.push({
        value: pu,
        label: `${pu.toUpperCase()} (${pu})`,
        category: "Custom",
      });
    }
  }

  return NextResponse.json({ units: combined });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Administrator authorization required" }, { status: 403 });
  }

  await ensureStoreUnitTable();

  try {
    const body = await req.json();
    const name = String(body.name || "").trim().toLowerCase();
    const label = String(body.label || "").trim() || name;
    const category = String(body.category || "Custom").trim();

    if (!name || name.length > 20) {
      return NextResponse.json({ error: "Unit code is required (max 20 characters)" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "StoreUnit" ("name", "label", "category", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("name") DO UPDATE SET "label" = $2, "category" = $3`,
      name,
      label,
      category
    );

    return NextResponse.json({
      unit: { value: name, label, category },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save unit" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Administrator authorization required" }, { status: 403 });
  }

  await ensureStoreUnitTable();

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim().toLowerCase();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    await prisma.$executeRawUnsafe(`DELETE FROM "StoreUnit" WHERE "name" = $1`, name);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete unit" },
      { status: 500 }
    );
  }
}
