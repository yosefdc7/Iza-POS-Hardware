import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BootstrapForm } from "@/components/settings/bootstrap-form";
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await prisma.user.count({ where: { role: "ADMIN" } })) redirect("/login");
  return <BootstrapForm />;
}
