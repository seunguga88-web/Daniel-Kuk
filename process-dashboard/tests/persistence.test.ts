import { describe, it, expect, beforeEach } from "vitest";
import { saveUpload, loadUpload, clearUpload, recordUpload, loadShipmentHistory } from "../lib/persistence";
import type { ParsedDataset, ShipmentTableRecord } from "../lib/types";

// vitest runs these tests in a plain Node environment (no DOM), so provide a
// minimal in-memory localStorage polyfill for the module to talk to.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = { localStorage: new MemoryStorage() };
});

const sampleDataset: ParsedDataset = {
  configInfo: [{ config: "Config 1", inputQty: 100, shipmentQty: 90, materials: [] }],
  shipmentPlan: [],
  dailyPlan: { schedule: [], shipments: [] },
  processStatus: [],
  shipmentTable: [],
  files: [{ fileName: "a.xlsx", kind: "configInfo" }],
};

describe("upload persistence", () => {
  it("returns null when nothing has been saved yet", () => {
    expect(loadUpload()).toBeNull();
  });

  it("round-trips a saved dataset exactly, including a savedAt timestamp", () => {
    saveUpload(sampleDataset, ["bad.xlsx"]);
    const loaded = loadUpload();
    expect(loaded).not.toBeNull();
    expect(loaded!.dataset).toEqual(sampleDataset);
    expect(loaded!.unrecognizedFiles).toEqual(["bad.xlsx"]);
    expect(typeof loaded!.savedAt).toBe("string");
    expect(new Date(loaded!.savedAt).toString()).not.toBe("Invalid Date");
  });

  it("clearUpload removes it", () => {
    saveUpload(sampleDataset, []);
    clearUpload();
    expect(loadUpload()).toBeNull();
  });

  it("loadUpload returns null instead of throwing on corrupted JSON", () => {
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.setItem(
      "process-dashboard:last-upload",
      "{not valid json"
    );
    expect(loadUpload()).toBeNull();
  });
});

function shipmentRow(overrides: Partial<ShipmentTableRecord>): ShipmentTableRecord {
  return {
    config: "Config 1",
    destination: "Destination 1",
    date: "2026-08-15",
    qty: 600,
    label: "OK",
    waiverStatus: "N/A",
    cause: "-",
    ...overrides,
  };
}

describe("recordUpload: accumulates shipment history across uploads", () => {
  it("records no history on the very first upload (nothing to compare against)", () => {
    const ds = { ...sampleDataset, shipmentTable: [shipmentRow({})] };
    const newEntries = recordUpload(ds, []);
    expect(newEntries).toEqual([]);
    expect(loadShipmentHistory()).toEqual([]);
  });

  it("diffs against the previous upload and appends (doesn't overwrite) history", () => {
    const v1 = { ...sampleDataset, shipmentTable: [shipmentRow({ qty: 600 })] };
    recordUpload(v1, []);

    const v2 = { ...sampleDataset, shipmentTable: [shipmentRow({ qty: 650 })] };
    const secondEntries = recordUpload(v2, []);
    expect(secondEntries).toHaveLength(1);
    expect(secondEntries[0]).toMatchObject({ changeType: "modified", field: "qty", oldValue: 600, newValue: 650, uploadVersion: 2 });

    const v3 = { ...sampleDataset, shipmentTable: [shipmentRow({ qty: 650 }), shipmentRow({ destination: "Destination 2", qty: 150 })] };
    recordUpload(v3, []);

    const history = loadShipmentHistory();
    expect(history).toHaveLength(2); // v1->v2 modification, plus v2->v3 addition, never cleared
    expect(history[0].uploadVersion).toBe(2);
    expect(history[1]).toMatchObject({ changeType: "added", destination: "Destination 2", uploadVersion: 3 });
  });

  it("still persists the new upload as the latest even when there's nothing to diff", () => {
    const ds = { ...sampleDataset, shipmentTable: [shipmentRow({})] };
    recordUpload(ds, []);
    expect(loadUpload()!.dataset).toEqual(ds);
  });
});
