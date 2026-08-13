import type { AOA, DailyPlanData } from "../types";
import { cell, cellStr, isDateLike, toISODate } from "../excelIO";

/**
 * Daily Plan is laid out as a gantt chart: dates run across columns, each
 * row is a (Line, Process) pair, and a cell holds a Config name when that
 * Config is scheduled for that Process on that date. A "Shipment" row per
 * Line block holds the planned ship date the same way.
 */
export function parseDailyPlan(aoa: AOA): DailyPlanData {
  const schedule: DailyPlanData["schedule"] = [];
  const shipments: DailyPlanData["shipments"] = [];

  // Find the process/label column: first cell (anywhere) that starts with
  // "process" (case-insensitive) or equals "Shipment".
  let labelCol = -1;
  for (let r = 0; r < aoa.length && labelCol === -1; r++) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (/^process/i.test(v) || v === "Shipment") {
        labelCol = c;
        break;
      }
    }
  }
  if (labelCol === -1) return { schedule, shipments };

  const lineCol = labelCol - 1;
  const dataStartCol = labelCol + 1;

  // Build a column -> ISO date map once, from the first row that has >=2
  // date-like cells at/after dataStartCol (dates repeat identically for
  // every Line block, so one map covers the whole sheet).
  const dateCols = new Map<number, string>();
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const found = new Map<number, string>();
    for (let c = dataStartCol; c < row.length; c++) {
      if (isDateLike(row[c])) found.set(c, toISODate(row[c]));
    }
    if (found.size >= 2) {
      for (const [c, iso] of found) dateCols.set(c, iso);
      break;
    }
  }

  let currentLine = "";
  for (let r = 0; r < aoa.length; r++) {
    const label = cellStr(aoa, r, labelCol);
    if (!label) continue;
    if (isDateLike(cell(aoa, r, dataStartCol))) continue; // date header row, not data

    if (lineCol >= 0) {
      const l = cellStr(aoa, r, lineCol);
      if (l) currentLine = l;
    }

    for (const [c, isoDate] of dateCols) {
      const config = cellStr(aoa, r, c);
      if (!config) continue;
      if (label === "Shipment") {
        shipments.push({ config, shipDate: isoDate });
      } else {
        schedule.push({ line: currentLine, process: label, config, planDate: isoDate });
      }
    }
  }

  return { schedule, shipments };
}
