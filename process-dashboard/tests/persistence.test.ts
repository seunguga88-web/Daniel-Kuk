import { describe, it, expect, beforeEach } from "vitest";
import { saveUpload, loadUpload, clearUpload } from "../lib/persistence";
import type { ParsedDataset } from "../lib/types";

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
