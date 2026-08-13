import type { ParsedDataset } from "./types";

const STORAGE_KEY = "process-dashboard:last-upload";

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
