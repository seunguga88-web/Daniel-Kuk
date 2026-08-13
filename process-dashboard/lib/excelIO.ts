import * as XLSX from "xlsx";
import type { AOA } from "./types";

/**
 * Reads the first sheet of a workbook into an array-of-arrays.
 * cellDates:true so date-formatted numeric cells arrive as JS Date objects
 * instead of raw Excel serial numbers.
 */
export function readFirstSheetAOA(data: ArrayBuffer | Uint8Array): AOA {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as AOA;
}

export function cell(aoa: AOA, row: number, col: number): unknown {
  const r = aoa[row];
  if (!r) return "";
  const v = r[col];
  return v === undefined || v === null ? "" : v;
}

/**
 * This workbook's date cells convert (via SheetJS cellDates) to JS Date
 * objects sitting a few hours before UTC midnight rather than exactly at
 * it (observed e.g. as "...T14:59:08.000Z" instead of "...T00:00:00.000Z"),
 * which floors to the wrong calendar day. Rounding to the nearest UTC day
 * boundary instead of truncating recovers the intended date.
 */
function dateToISODate(d: Date): string {
  const rounded = new Date(Math.round(d.getTime() / 86400000) * 86400000);
  return rounded.toISOString().slice(0, 10);
}

export function cellStr(aoa: AOA, row: number, col: number): string {
  const v = cell(aoa, row, col);
  if (v instanceof Date) return dateToISODate(v);
  return String(v).trim();
}

export function toISODate(v: unknown): string {
  if (v instanceof Date) return dateToISODate(v);
  if (typeof v === "number") {
    // Excel serial date fallback (epoch 1899-12-30, handles the 1900 leap bug)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return dateToISODate(new Date(ms));
  }
  const s = String(v).trim();
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return dateToISODate(parsed);
  return s;
}

export function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v === "number") return v > 40000 && v < 60000;
  return false;
}

export function toNumber(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return isNaN(n) ? null : n;
}
