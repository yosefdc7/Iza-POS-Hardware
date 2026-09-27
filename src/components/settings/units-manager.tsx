"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Tag, Loader2 } from "lucide-react";
import { DEFAULT_HARDWARE_UNITS, UnitOption } from "@/lib/hardware-units";

export function UnitsManager() {
  const [units, setUnits] = useState<UnitOption[]>(DEFAULT_HARDWARE_UNITS);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("Custom");
  const [saving, setSaving] = useState(false);

  async function loadUnits() {
    try {
      const res = await fetch("/api/units");
      if (res.ok) {
        const data = await res.json();
        if (data.units?.length) {
          setUnits(data.units);
        }
      }
    } catch {
      // Fallback to defaults
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) {
      toast.error("Unit code is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCode.trim().toLowerCase(),
          label: newLabel.trim() || `${newCode.trim()} (${newCode.trim()})`,
          category: newCategory,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add unit");
      }

      toast.success(`Unit '${newCode}' added successfully`);
      setNewCode("");
      setNewLabel("");
      setShowAdd(false);
      await loadUnits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving unit");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Are you sure you want to remove the custom unit '${name}'?`)) return;

    try {
      const res = await fetch(`/api/units?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete unit");
      toast.success(`Unit '${name}' removed`);
      await loadUnits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const defaultCodes = new Set(DEFAULT_HARDWARE_UNITS.map((u) => u.value.toLowerCase()));

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Units of Measure (UoM)
          </h2>
          <p className="text-sm text-muted-foreground">
            Standard hardware units for catalog products and stock conversions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Custom Unit
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <h3 className="text-sm font-medium">New Store Unit</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Unit Code (e.g. coil, drum, tub) *
              </label>
              <input
                type="text"
                maxLength={20}
                required
                placeholder="e.g. coil"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Display Label
              </label>
              <input
                type="text"
                placeholder="e.g. Coil of wire (coil)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="Count">Count / Discrete</option>
                <option value="Length">Length & Linear</option>
                <option value="Weight">Weight & Mass</option>
                <option value="Volume">Volume & Liquid</option>
                <option value="Bulk">Bulk & Structural</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Unit"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hardware units…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
          {units.map((u) => {
            const isCustom = !defaultCodes.has(u.value.toLowerCase());
            return (
              <div
                key={u.value}
                className="flex items-center justify-between rounded-lg border bg-background/50 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold">{u.value}</span>
                  <span className="text-muted-foreground ml-1.5 truncate max-w-[120px] inline-block align-bottom">
                    {u.label}
                  </span>
                </div>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => handleDelete(u.value)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors ml-1"
                    title={`Delete custom unit '${u.value}'`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
