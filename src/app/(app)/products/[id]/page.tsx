import { requireStaff } from "@/lib/require-staff";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { formatCurrency } from "@/lib/utils";
import { Edit, Package, TrendingUp, TrendingDown } from "lucide-react";
import { StockAdjustButton } from "@/components/products/stock-adjust-button";
import { ProductPrintHistoryButton } from "@/components/products/product-print-history-button";
import { PackagingSection } from "@/components/products/packaging-section";
import { DbError } from "@/components/ui/db-error";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } }).catch(() => null);
  return { title: product ? `${product.name} — Inventory` : "Product" };
}

export default async function ProductDetailPage({ params }: Props) {
  noStore();
  const {user}=await requireStaff();
  const { id } = await params;

  let product;
  let adjustments: any[] = [];
  let settings: any = null;
  try {
    const [rawProduct, rawAdj, rawSettings] = await Promise.all([
      prisma.product.findUnique({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true } },
          packagings: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.stockAdjustment.findMany({
        where: { productId: id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.businessSettings.findUnique({ where: { id: "singleton" } }).catch(() => null),
    ]);

    if (!rawProduct) notFound();
    product = serialize(rawProduct);
    adjustments = serialize(rawAdj);
    settings = rawSettings ? serialize(rawSettings) : null;
  } catch (e: any) {
    if (e?.name === "NotFoundError") notFound();
    return <DbError page="product" />;
  }

  const reasonLabel: Record<string, string> = {
    RECEIVED: "Received",
    DAMAGED: "Damaged",
    THEFT: "Theft",
    CORRECTION: "Correction",
    OPENING_COUNT: "Opening Count",
  };

  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const businessName = settings?.name || "Izah Store";
  const now = new Date();
  const generatedDateStr = formatter.format(now);

  const totalAdjustments = adjustments.length;
  const totalAdded = adjustments
    .filter((adj: any) => Number(adj.delta) > 0)
    .reduce((sum: number, adj: any) => sum + Number(adj.delta), 0);
  const totalReduced = adjustments
    .filter((adj: any) => Number(adj.delta) < 0)
    .reduce((sum: number, adj: any) => sum + Math.abs(Number(adj.delta)), 0);
  const netAdjustment = adjustments.reduce(
    (sum: number, adj: any) => sum + Number(adj.delta),
    0
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 print:p-0 print:max-w-none print:space-y-4">
      {/* Breadcrumb - hidden during print */}
      <div className="print:hidden">
        <Breadcrumb items={[
          { label: "Products", href: "/products" },
          { label: product.name },
        ]} />
      </div>

      {/* Actions - hidden during print */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <StockAdjustButton isStaff={user.role!=="ADMIN"}
          productId={product.id}
          productName={product.name}
          currentStock={Number(product.stock)}
        />
        <Link
          href={`/products/${id}/edit`}
          className="flex items-center gap-2 border border-border bg-background text-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-muted transition-colors"
        >
          <Edit className="h-3.5 w-3.5" /> Edit
        </Link>
        <ProductPrintHistoryButton productName={product.name} />
      </div>

      {/* Print-only Official Report Header */}
      <div className="hidden print:block border-b-2 border-primary/30 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-gray-900">
                {businessName}
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold border border-gray-400 text-gray-700 px-1.5 py-0.5 rounded">
                Stock History Report
              </span>
            </div>
            <h1 className="text-lg font-bold text-gray-900 mt-1">
              Product Stock Adjustment &amp; Audit Report
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Report generated on: {generatedDateStr}
            </p>
          </div>
          <div className="text-right text-xs text-gray-600 space-y-0.5">
            <p className="font-semibold text-gray-900">{product.name}</p>
            {product.sku && <p>SKU: <span className="font-mono font-medium">{product.sku}</span></p>}
            {product.barcode && <p>Barcode: <span className="font-mono">{product.barcode}</span></p>}
            <p className="font-medium text-gray-800">
              Current Stock: <span className="font-bold text-gray-900">{Number(product.stock)} {product.unit}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Product summary */}
      <div className="rounded-lg border bg-card p-6 space-y-4 print:p-4 print:border-gray-300">
        <div className="flex items-start gap-4">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-20 w-20 rounded-lg object-cover border shrink-0 print:h-14 print:w-14"
            />
          ) : (
            <div className="h-20 w-20 rounded-lg border bg-muted flex items-center justify-center shrink-0 print:h-14 print:w-14">
              <Package className="h-8 w-8 text-muted-foreground print:h-6 print:w-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate print:text-xl">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground print:text-gray-700">
              {product.sku && <span>SKU: <span className="font-mono font-semibold">{product.sku}</span></span>}
              {product.barcode && <span>Barcode: <span className="font-mono font-semibold">{product.barcode}</span></span>}
              {product.category && <span>Category: <span className="font-semibold">{product.category}</span></span>}
              {product.supplier && <span>Supplier: <span className="font-semibold">{product.supplier.name}</span></span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t print:border-gray-200">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium print:text-gray-600">Current Stock</p>
            <p className={`text-2xl font-bold print:text-xl ${Number(product.stock) <= Number(product.lowStockThreshold) ? "text-amber-600 dark:text-amber-400 print:text-amber-700" : ""}`}>
              {Number(product.stock)} {product.unit}
              {Number(product.stock) <= Number(product.lowStockThreshold) && (
                <span className="ml-2 text-xs font-normal bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded print:border print:border-amber-400">Low</span>
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium print:text-gray-600">Sale Price</p>
            <p className="text-2xl font-bold print:text-xl">{formatCurrency(parseFloat(String(product.price)))}</p>
          </div>
          {product.cost && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium print:text-gray-600">Cost</p>
              <p className="text-2xl font-bold print:text-xl">{formatCurrency(parseFloat(String(product.cost)))}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium print:text-gray-600">Low Stock At</p>
            <p className="text-2xl font-bold print:text-xl">{Number(product.lowStockThreshold)} {product.unit}</p>
          </div>
        </div>
      </div>

      {/* Packaging Sizes - hidden during print */}
      <div className="print:hidden">
        <PackagingSection
          productId={product.id}
          initialPackagings={
            product.packagings?.map((p) => ({
              id: p.id,
              name: p.name,
              conversionQty: Number(p.conversionQty),
              price: Number(p.price),
              barcode: p.barcode,
            })) ?? []
          }
        />
      </div>

      {/* Inventory Log */}
      <div className="rounded-lg border bg-card overflow-hidden print:border-gray-300">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 print:border-gray-200">
          <div>
            <h2 className="text-sm font-semibold print:text-base print:font-bold">Inventory Adjustment Log</h2>
            <p className="text-xs text-muted-foreground mt-0.5 print:text-gray-600">
              All stock movements and audit records for this product
            </p>
          </div>
          <div className="print:hidden">
            <ProductPrintHistoryButton
              productName={product.name}
              variant="compact"
            />
          </div>
        </div>

        {/* Adjustment Summary Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-muted/30 border-b text-xs print:bg-gray-50 print:border-gray-200">
          <div className="space-y-0.5">
            <span className="text-muted-foreground block text-[11px] uppercase font-medium print:text-gray-600">Total Adjustments</span>
            <span className="font-bold text-foreground text-sm print:text-gray-900">{totalAdjustments} {totalAdjustments === 1 ? "entry" : "entries"}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground block text-[11px] uppercase font-medium print:text-gray-600">Stock Added (+)</span>
            <span className="font-bold text-green-600 dark:text-green-400 text-sm print:text-green-700">+{totalAdded} {product.unit}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground block text-[11px] uppercase font-medium print:text-gray-600">Stock Reduced (-)</span>
            <span className="font-bold text-destructive text-sm print:text-red-700">-{totalReduced} {product.unit}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground block text-[11px] uppercase font-medium print:text-gray-600">Net Adjustment</span>
            <span className={`font-bold text-sm ${netAdjustment >= 0 ? "text-green-600 dark:text-green-400 print:text-green-700" : "text-destructive print:text-red-700"}`}>
              {netAdjustment > 0 ? `+${netAdjustment}` : netAdjustment} {product.unit}
            </span>
          </div>
        </div>

        {adjustments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground print:py-8 print:text-gray-500">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No stock adjustments recorded</p>
            <p className="text-xs print:hidden">Use the &quot;Adjust Stock&quot; button to record stock movements</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 print:bg-gray-100 print:border-gray-300">
                <tr className="text-xs text-muted-foreground uppercase font-medium print:text-gray-700">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">By</th>
                </tr>
              </thead>
              <tbody className="divide-y print:divide-gray-200">
                {adjustments.map((adj: any) => (
                  <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap print:text-gray-700">
                      {formatter.format(new Date(adj.createdAt))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium print:text-gray-900">{reasonLabel[adj.reason] ?? adj.reason}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-sm font-semibold ${
                        adj.delta > 0 ? "text-green-600 dark:text-green-400 print:text-green-700" : "text-destructive print:text-red-700"
                      }`}>
                        {adj.delta > 0 ? <TrendingUp className="h-3.5 w-3.5 print:hidden" /> : <TrendingDown className="h-3.5 w-3.5 print:hidden" />}
                        {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate print:max-w-none print:whitespace-normal print:text-gray-700">
                      {adj.note ?? <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground print:text-gray-700">
                      {adj.user?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print-only audit sign-off section */}
      <div className="hidden print:block pt-8 mt-6 border-t border-gray-300">
        <div className="grid grid-cols-2 gap-12 text-xs text-gray-700">
          <div>
            <p className="font-semibold text-gray-900 mb-8">Prepared &amp; Verified By:</p>
            <div className="border-b border-gray-400 w-52 mb-1" />
            <p className="text-[10px] text-gray-500">Staff / Inventory Custodian (Signature &amp; Date)</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-8">Audited &amp; Approved By:</p>
            <div className="border-b border-gray-400 w-52 mb-1" />
            <p className="text-[10px] text-gray-500">Store Manager / Auditor (Signature &amp; Date)</p>
          </div>
        </div>
        <div className="flex justify-between items-center text-[10px] text-gray-400 mt-8 pt-2 border-t border-gray-200">
          <span>{businessName} — Stock Adjustment History Report</span>
          <span>Confidential Internal Store Audit Record</span>
        </div>
      </div>
    </div>
  );
}
