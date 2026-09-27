/**
 * Unit tests for the offline sync queue logic (src/lib/sync.ts).
 *
 * pglite is mocked so tests run without a real WASM database.
 * fetch is mocked via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock pglite before importing sync ────────────────────────────────────────
vi.mock("@/lib/pglite", () => ({
  getPendingQueue: vi.fn(),
  markSynced: vi.fn(),
}));

import { getSyncStatus, onSyncStatusChange, replayOfflineQueue } from "@/lib/sync";
import { getPendingQueue, markSynced } from "@/lib/pglite";

const mockGetPendingQueue = getPendingQueue as ReturnType<typeof vi.fn>;
const mockMarkSynced = markSynced as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(id: number, endpoint = "/api/sales") {
  return { id, endpoint, method: "POST", payload: { saleId: `s-${id}` } };
}

it("preserves another cashier's queued sale without submitting it", async () => {
  vi.clearAllMocks();
  localStorage.setItem("izah_user_id", "cashier-b");
  mockGetPendingQueue.mockResolvedValueOnce([{ ...makeItem(42), ownerUserId: "cashier-a" }]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await replayOfflineQueue();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockMarkSynced).not.toHaveBeenCalled();
  localStorage.clear();
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getSyncStatus", () => {
  it("returns a valid SyncStatus string", () => {
    const status = getSyncStatus();
    expect(["idle", "syncing", "synced", "error", "blocked"]).toContain(status);
  });
});

describe("onSyncStatusChange", () => {
  it("calls the callback when status changes during replay", async () => {
    mockGetPendingQueue.mockResolvedValueOnce([]);

    const statuses: string[] = [];
    const unsub = onSyncStatusChange((s) => statuses.push(s));

    await replayOfflineQueue();
    unsub();

    // With an empty queue, sync emits "synced" immediately
    expect(statuses).toContain("synced");
  });

  it("returns an unsubscribe function that stops notifications", async () => {
    mockGetPendingQueue.mockResolvedValueOnce([]);

    const calls: string[] = [];
    const unsub = onSyncStatusChange((s) => calls.push(s));
    unsub(); // unsubscribe immediately

    await replayOfflineQueue();

    // Should not hear anything after unsubscribing
    expect(calls).toHaveLength(0);
  });
});

describe("replayOfflineQueue — empty queue", () => {
  beforeEach(() => {
    mockGetPendingQueue.mockResolvedValue([]);
    mockMarkSynced.mockResolvedValue(undefined);
  });

  it("emits 'synced' when there are no pending items", async () => {
    const statuses: string[] = [];
    const unsub = onSyncStatusChange((s) => statuses.push(s));
    await replayOfflineQueue();
    unsub();
    expect(statuses).toEqual(["synced"]);
  });

  it("does not call markSynced when queue is empty", async () => {
    await replayOfflineQueue();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });
});

describe("replayOfflineQueue — successful items", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockGetPendingQueue.mockResolvedValue([makeItem(1), makeItem(2)]);
    mockMarkSynced.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("emits 'syncing' then 'synced' on full success", async () => {
    const statuses: string[] = [];
    const unsub = onSyncStatusChange((s) => statuses.push(s));
    await replayOfflineQueue();
    unsub();
    expect(statuses).toEqual(["syncing", "synced"]);
  });

  it("calls fetch for each pending item with correct args", async () => {
    await replayOfflineQueue();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sales",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("calls markSynced for each successful item", async () => {
    await replayOfflineQueue();
    expect(mockMarkSynced).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenCalledWith(1);
    expect(mockMarkSynced).toHaveBeenCalledWith(2);
  });

  it("coalesces concurrent replay calls", async () => {
    let releasePending!: (items: ReturnType<typeof makeItem>[]) => void;
    mockGetPendingQueue.mockReturnValueOnce(
      new Promise((resolve) => {
        releasePending = resolve;
      })
    );

    const first = replayOfflineQueue();
    const second = replayOfflineQueue();
    expect(second).toBe(first);

    releasePending([makeItem(3)]);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("replayOfflineQueue — fetch failure", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockGetPendingQueue.mockResolvedValue([makeItem(10), makeItem(11)]);
    mockMarkSynced.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("emits 'error' when at least one fetch returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 500 });

    const statuses: string[] = [];
    const unsub = onSyncStatusChange((s) => statuses.push(s));
    await replayOfflineQueue();
    unsub();

    expect(statuses).toEqual(["syncing", "error"]);
  });

  it("emits 'error' when fetch throws a network error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const statuses: string[] = [];
    const unsub = onSyncStatusChange((s) => statuses.push(s));
    await replayOfflineQueue();
    unsub();

    expect(statuses).toEqual(["syncing", "error"]);
  });

  it("still marks successfully fetched items as synced even if others fail", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 500 });

    await replayOfflineQueue();

    expect(mockMarkSynced).toHaveBeenCalledTimes(1);
    expect(mockMarkSynced).toHaveBeenCalledWith(10);
  });
});
