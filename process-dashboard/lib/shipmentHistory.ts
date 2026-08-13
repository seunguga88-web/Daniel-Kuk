import type { ShipmentTableRecord } from "./types";

export type ChangeType = "added" | "modified" | "removed";

export interface ShipmentHistoryEntry {
  changedAt: string; // ISO timestamp of when this diff was recorded
  config: string;
  destination: string;
  changeType: ChangeType;
  field?: string; // set only for "modified"
  oldValue?: string | number;
  newValue?: string | number;
  uploadVersion: number;
}

const FIELDS: (keyof ShipmentTableRecord)[] = ["date", "qty", "label", "waiverStatus", "cause"];

/**
 * Row identity in the source Excel isn't a real Shipment Row ID (the
 * column doesn't exist in this company's file) — Config + Destination +
 * Label is the closest stable proxy available, since a Config/Destination
 * pair can have separate OK and Waiver NG rows. A production version would
 * need a real Row ID column to be fully reliable.
 */
function rowKey(row: ShipmentTableRecord): string {
  return `${row.config}|${row.destination}|${row.label}`;
}

/**
 * Diffs two uploads of the Config 출하 테이블 and returns one history entry
 * per change: a whole new row is "added", a disappeared row is "removed",
 * and a row whose Date/Qty/Waiver Status/Cause changed gets one "modified"
 * entry per changed field (never overwritten -- the caller accumulates
 * these across uploads).
 */
export function diffShipmentTables(
  previous: ShipmentTableRecord[],
  current: ShipmentTableRecord[],
  uploadVersion: number,
  changedAt: string
): ShipmentHistoryEntry[] {
  const prevByKey = new Map(previous.map((r) => [rowKey(r), r]));
  const currByKey = new Map(current.map((r) => [rowKey(r), r]));
  const entries: ShipmentHistoryEntry[] = [];

  for (const [key, row] of currByKey) {
    if (!prevByKey.has(key)) {
      entries.push({ changedAt, config: row.config, destination: row.destination, changeType: "added", uploadVersion });
    }
  }

  for (const [key, row] of prevByKey) {
    if (!currByKey.has(key)) {
      entries.push({ changedAt, config: row.config, destination: row.destination, changeType: "removed", uploadVersion });
    }
  }

  for (const [key, prevRow] of prevByKey) {
    const currRow = currByKey.get(key);
    if (!currRow) continue;
    for (const field of FIELDS) {
      const oldValue = prevRow[field];
      const newValue = currRow[field];
      if (oldValue !== newValue) {
        entries.push({
          changedAt,
          config: currRow.config,
          destination: currRow.destination,
          changeType: "modified",
          field,
          oldValue,
          newValue,
          uploadVersion,
        });
      }
    }
  }

  return entries;
}
