import type { AOA, ProcessStatusEntry } from "../types";
import { cell, cellStr, isDateLike, toISODate, toNumber } from "../excelIO";

/**
 * 공정 status repeats a block per snapshot (date + 9AM/6PM):
 *   col D (dateCol)    -> date serial on the header row, Line name on data rows
 *   col D+1 (configCol)-> time label ("9:00 A.M") on header row, Config name on data rows
 *   col D+2 (subCol)   -> "Input" / "Output" / "NG" sub-row marker
 *   following cols     -> process 1..15 values, then Good Qty / Defect Qty / Major Defect
 * Each Config occupies 3 consecutive rows (Input, Output, NG) within a block.
 */
export function parseProcessStatus(aoa: AOA): ProcessStatusEntry[] {
  const entries = new Map<string, ProcessStatusEntry>();

  // Locate the reference geometry from the first header row we find: a row
  // with a date-like value followed by a text label, then "process N" cells.
  let dateCol = -1;
  for (let r = 0; r < aoa.length && dateCol === -1; r++) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (isDateLike(row[c]) && typeof row[c + 1] === "string" && String(row[c + 1]).trim() !== "") {
        dateCol = c;
        break;
      }
    }
  }
  if (dateCol === -1) return [];

  const configCol = dateCol + 1;
  const subCol = dateCol + 2;
  const processStartCol = dateCol + 3;

  let currentDate = "";
  let currentTime = "";
  let currentLine = "";
  let currentConfig = "";
  let processCols: { col: number; name: string }[] = [];
  let goodCol = -1;
  let defectCol = -1;
  let majorCol = -1;

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const dateVal = cell(aoa, r, dateCol);

    if (isDateLike(dateVal)) {
      // New snapshot header row.
      currentDate = toISODate(dateVal);
      currentTime = cellStr(aoa, r, configCol);
      processCols = [];
      goodCol = -1;
      defectCol = -1;
      majorCol = -1;
      for (let c = processStartCol; c < row.length; c++) {
        const v = String(row[c] ?? "").trim();
        if (/^process/i.test(v)) processCols.push({ col: c, name: v });
        else if (v === "Good Qty") goodCol = c;
        else if (v === "Defect Qty") defectCol = c;
        else if (v === "Major Defect") majorCol = c;
      }
      continue;
    }

    const lineVal = cellStr(aoa, r, dateCol);
    if (lineVal) currentLine = lineVal;
    const configVal = cellStr(aoa, r, configCol);
    if (configVal) currentConfig = configVal;
    const subType = cellStr(aoa, r, subCol);
    if (!subType || !currentDate || !currentConfig) continue;

    const key = `${currentDate}|${currentTime}|${currentLine}|${currentConfig}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        snapshotDate: currentDate,
        snapshotTime: currentTime,
        line: currentLine,
        config: currentConfig,
        processValues: {},
        goodQty: null,
        defectQty: null,
        majorDefect: null,
      };
      entries.set(key, entry);
    }

    for (const { col, name } of processCols) {
      const val = toNumber(cell(aoa, r, col));
      if (!entry.processValues[name]) {
        entry.processValues[name] = { input: null, output: null, ng: null };
      }
      if (subType === "Input") entry.processValues[name].input = val;
      else if (subType === "Output") entry.processValues[name].output = val;
      else if (subType === "NG") entry.processValues[name].ng = val;
    }

    if (subType === "Output" && goodCol >= 0) {
      const v = toNumber(cell(aoa, r, goodCol));
      if (v !== null) entry.goodQty = v;
    }
    if (subType === "NG") {
      if (defectCol >= 0) {
        const v = toNumber(cell(aoa, r, defectCol));
        if (v !== null) entry.defectQty = v;
      }
      if (majorCol >= 0) {
        const v = cell(aoa, r, majorCol);
        if (v !== "" && v !== null && v !== undefined) {
          entry.majorDefect = v as string | number;
        }
      }
    }
  }

  return Array.from(entries.values());
}
