import type { ParsedDataset } from "./types";
import { diffShipmentTables, type ShipmentHistoryEntry } from "./shipmentHistory";

const STORAGE_KEY = "process-dashboard:last-upload";
const HISTORY_KEY = "process-dashboard:shipment-history";
const VERSION_KEY = "process-dashboard:upload-version";

export interface StoredUpload {
  dataset: ParsedDataset;
  unrecognizedFiles: string[];
  savedAt: string;
}

/** Persists the parsed upload so it survives a page refresh. No-ops outside the browser or if storage is unavailable (e.g. private browsing, quota). */
export function saveUpload(dataset: ParsedDataset, unrecognizedFiles: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredUpload = { dataset, unrecognizedFiles, savedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full/unavailable -- the app still works, it just won't survive a refresh this time.
  }
}

export function loadUpload(): StoredUpload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUpload;
  } catch {
    return null;
  }
}

export function clearUpload(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadShipmentHistory(): ShipmentHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ShipmentHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function nextUploadVersion(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(VERSION_KEY);
    const next = (raw ? parseInt(raw, 10) : 0) + 1;
    window.localStorage.setItem(VERSION_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

/**
 * Saves a new upload and, if a previous upload exists, diffs its Config
 * 출하 테이블 against the new one and appends the changes (never
 * overwritten -- accumulated) to the shipment history log.
 */
export function recordUpload(dataset: ParsedDataset, unrecognizedFiles: string[]): ShipmentHistoryEntry[] {
  const previous = loadUpload();
  const version = nextUploadVersion();
  const changedAt = new Date().toISOString();

  let newEntries: ShipmentHistoryEntry[] = [];
  if (previous) {
    newEntries = diffShipmentTables(previous.dataset.shipmentTable, dataset.shipmentTable, version, changedAt);
    if (newEntries.length > 0 && typeof window !== "undefined") {
      try {
        const history = [...loadShipmentHistory(), ...newEntries];
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        // ignore -- history is a nice-to-have, upload persistence below still succeeds
      }
    }
  }

  saveUpload(dataset, unrecognizedFiles);
  return newEntries;
}
