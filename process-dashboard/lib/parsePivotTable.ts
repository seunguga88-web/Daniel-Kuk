import type { AOA } from "./types";
import { cell, cellStr } from "./excelIO";

export interface PivotRow {
  group?: string;
  label: string;
  values: Map<number, unknown>; // column index -> value
}

export interface PivotTable {
  configs: { name: string; col: number }[];
  rows: PivotRow[];
}

const CONFIG_RE = /^Config \d+$/;

/**
 * Parses the "Config as column, attribute as row" cross-tab layout shared by
 * the Config 정보 and Config별 출하 Plan files. Values are looked up by
 * config NAME (not column position) so column order can vary.
 */
export function parsePivotTable(aoa: AOA): PivotTable {
  let headerRow = -1;
  let configs: { name: string; col: number }[] = [];

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const found: { name: string; col: number }[] = [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (CONFIG_RE.test(v)) found.push({ name: v, col: c });
    }
    if (found.length >= 2) {
      headerRow = r;
      configs = found;
      break;
    }
  }

  if (headerRow === -1) {
    return { configs: [], rows: [] };
  }

  const configStartCol = Math.min(...configs.map((c) => c.col));
  const labelCol = configStartCol - 1;
  const groupCol = configStartCol - 2;

  const rows: PivotRow[] = [];
  let currentGroup = "";

  for (let r = headerRow + 1; r < aoa.length; r++) {
    if (groupCol >= 0) {
      const g = cellStr(aoa, r, groupCol);
      if (g) currentGroup = g;
    }
    const label = labelCol >= 0 ? cellStr(aoa, r, labelCol) : "";
    if (!label) continue;

    const values = new Map<number, unknown>();
    for (const { col } of configs) {
      values.set(col, cell(aoa, r, col));
    }
    rows.push({ group: groupCol >= 0 ? currentGroup : undefined, label, values });
  }

  return { configs, rows };
}
