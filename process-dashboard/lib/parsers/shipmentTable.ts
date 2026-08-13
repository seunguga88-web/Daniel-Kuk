import type { AOA, ShipmentTableRecord } from "../types";
import { cell, cellStr, toISODate, toNumber } from "../excelIO";

const EXPECTED_HEADERS = ["Config", "Destination", "Date", "Qty", "Label", "Waiver Status", "Cause"];

/**
 * Config 출하 테이블 is a flat table, but its header row repeats every time
 * the Config changes — those repeated header rows must be filtered out
 * rather than parsed as data.
 */
export function parseShipmentTable(aoa: AOA): ShipmentTableRecord[] {
  let headerRow = -1;
  const cols: Record<string, number> = {};

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const found: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (EXPECTED_HEADERS.includes(v) && !(v in found)) found[v] = c;
    }
    if (EXPECTED_HEADERS.every((h) => h in found)) {
      headerRow = r;
      Object.assign(cols, found);
      break;
    }
  }
  if (headerRow === -1) return [];

  const records: ShipmentTableRecord[] = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const configVal = cellStr(aoa, r, cols["Config"]);
    if (!configVal) continue;
    if (configVal === "Config") continue; // repeated header row

    records.push({
      config: configVal,
      destination: cellStr(aoa, r, cols["Destination"]),
      date: toISODate(cell(aoa, r, cols["Date"])),
      qty: toNumber(cell(aoa, r, cols["Qty"])) ?? 0,
      label: cellStr(aoa, r, cols["Label"]),
      waiverStatus: cellStr(aoa, r, cols["Waiver Status"]),
      cause: cellStr(aoa, r, cols["Cause"]),
    });
  }

  return records;
}
