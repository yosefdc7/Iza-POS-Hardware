"use client";

import { Download } from "lucide-react";

interface ProductExportButtonProps {
  selectedTag?: string;
}

export function ProductExportButton({ selectedTag }: ProductExportButtonProps) {
  function handleDownload() {
    const params = new URLSearchParams();
    if (selectedTag && selectedTag !== "ALL") {
      params.set("tag", selectedTag);
    }
    const url = `/api/products/export${params.toString() ? `?${params.toString()}` : ""}`;
    window.location.assign(url);
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
      title="Export Products to CSV"
    >
      <Download className="h-4 w-4" />
      <span>Export CSV</span>
    </button>
  );
}
