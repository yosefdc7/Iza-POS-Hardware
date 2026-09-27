import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { runDatabaseDiagnostics } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { DatabaseDiagnosticsView } from "@/components/settings/database-diagnostics-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Database & System Diagnostics - Settings",
  description: "Live PostgreSQL connection verification, latency measurement, schema table checks, and Cloud Run / Cloud SQL operational health.",
};

export default async function DatabaseDiagnosisPage() {
  noStore();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "ADMIN") {
    redirect("/pos");
  }

  const initialDiagnostics = serialize(await runDatabaseDiagnostics());

  return (
    <div className="p-4 sm:p-6">
      <DatabaseDiagnosticsView initialData={initialDiagnostics} />
    </div>
  );
}
