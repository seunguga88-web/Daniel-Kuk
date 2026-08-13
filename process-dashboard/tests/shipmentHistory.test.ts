import { describe, it, expect } from "vitest";
import { diffShipmentTables } from "../lib/shipmentHistory";
import type { ShipmentTableRecord } from "../lib/types";

function row(overrides: Partial<ShipmentTableRecord>): ShipmentTableRecord {
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

describe("diffShipmentTables", () => {
  it("emits nothing when nothing changed", () => {
    const rows = [row({})];
    expect(diffShipmentTables(rows, rows, 2, "2026-08-16T00:00:00.000Z")).toEqual([]);
  });

  it("detects a brand new row as 'added'", () => {
    const prev = [row({})];
    const curr = [row({}), row({ destination: "Destination 2", qty: 150 })];
    const entries = diffShipmentTables(prev, curr, 2, "2026-08-16T00:00:00.000Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ changeType: "added", destination: "Destination 2", uploadVersion: 2 });
  });

  it("detects a disappeared row as 'removed'", () => {
    const prev = [row({}), row({ destination: "Destination 2", qty: 150 })];
    const curr = [row({})];
    const entries = diffShipmentTables(prev, curr, 3, "2026-08-16T00:00:00.000Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ changeType: "removed", destination: "Destination 2" });
  });

  it("emits one 'modified' entry per changed field, with old/new values", () => {
    const prev = [row({ qty: 600, date: "2026-08-15" })];
    const curr = [row({ qty: 650, date: "2026-08-16" })];
    const entries = diffShipmentTables(prev, curr, 4, "2026-08-17T00:00:00.000Z");
    expect(entries).toHaveLength(2);
    const byField = Object.fromEntries(entries.map((e) => [e.field, e]));
    expect(byField["qty"]).toMatchObject({ changeType: "modified", oldValue: 600, newValue: 650 });
    expect(byField["date"]).toMatchObject({ changeType: "modified", oldValue: "2026-08-15", newValue: "2026-08-16" });
  });

  it("treats a Config+Destination pair with both an OK and a Waiver NG row as two distinct identities", () => {
    const prev = [row({ label: "OK", qty: 50 }), row({ label: "Waiver NG", qty: 50, waiverStatus: "Approved" })];
    const curr = [row({ label: "OK", qty: 50 }), row({ label: "Waiver NG", qty: 80, waiverStatus: "Approved" })];
    const entries = diffShipmentTables(prev, curr, 2, "2026-08-16T00:00:00.000Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ changeType: "modified", field: "qty", oldValue: 50, newValue: 80 });
  });

  it("stamps every entry with the given uploadVersion and changedAt", () => {
    const entries = diffShipmentTables([], [row({})], 7, "2026-08-20T09:00:00.000Z");
    expect(entries[0].uploadVersion).toBe(7);
    expect(entries[0].changedAt).toBe("2026-08-20T09:00:00.000Z");
  });
});
