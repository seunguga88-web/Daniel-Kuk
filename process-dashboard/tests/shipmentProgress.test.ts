import { describe, it, expect } from "vitest";
import { computeShipmentProgress } from "../lib/shipmentProgress";
import type { ShipmentPlanRecord, ShipmentTableRecord } from "../lib/types";

const plan: ShipmentPlanRecord[] = [
  {
    config: "Config 1",
    totalShipment: 100,
    destinations: [
      { destination: "Destination 1", qty: 60 },
      { destination: "Destination 2", qty: 40 },
    ],
  },
];

function row(overrides: Partial<ShipmentTableRecord>): ShipmentTableRecord {
  return {
    config: "Config 1",
    destination: "Destination 1",
    date: "2026-08-10",
    qty: 20,
    label: "OK",
    waiverStatus: "N/A",
    cause: "-",
    ...overrides,
  };
}

describe("computeShipmentProgress", () => {
  it("shows full remaining qty when nothing has shipped yet", () => {
    const [c1] = computeShipmentProgress(plan, [], "2026-08-10");
    expect(c1.totalPlanQty).toBe(100);
    expect(c1.totalShippedQty).toBe(0);
    expect(c1.totalRemainingQty).toBe(100);
    expect(c1.destinations[0]).toMatchObject({ destination: "Destination 1", planQty: 60, shippedQty: 0, remainingQty: 60, entries: [] });
  });

  it("sums shipped qty per destination and computes remaining vs plan", () => {
    const table = [row({ date: "2026-08-10", qty: 20 }), row({ date: "2026-08-12", qty: 15 })];
    const [c1] = computeShipmentProgress(plan, table, "2026-08-15");
    const dest1 = c1.destinations.find((d) => d.destination === "Destination 1")!;
    expect(dest1.shippedQty).toBe(35);
    expect(dest1.remainingQty).toBe(25);
    expect(dest1.entries).toHaveLength(2);
  });

  it("computes a running cumulative qty per date entry, sorted ascending by date", () => {
    const table = [row({ date: "2026-08-12", qty: 15 }), row({ date: "2026-08-10", qty: 20 })];
    const [c1] = computeShipmentProgress(plan, table, "2026-08-15");
    const dest1 = c1.destinations.find((d) => d.destination === "Destination 1")!;
    expect(dest1.entries.map((e) => e.date)).toEqual(["2026-08-10", "2026-08-12"]);
    expect(dest1.entries.map((e) => e.cumulativeQty)).toEqual([20, 35]);
  });

  it("excludes shipment records after the as-of date", () => {
    const table = [row({ date: "2026-08-10", qty: 20 }), row({ date: "2026-08-20", qty: 999 })];
    const [c1] = computeShipmentProgress(plan, table, "2026-08-15");
    const dest1 = c1.destinations.find((d) => d.destination === "Destination 1")!;
    expect(dest1.shippedQty).toBe(20);
    expect(dest1.entries).toHaveLength(1);
  });

  it("keeps destinations separate even for the same config", () => {
    const table = [row({ destination: "Destination 1", qty: 60 }), row({ destination: "Destination 2", qty: 40 })];
    const [c1] = computeShipmentProgress(plan, table, "2026-08-15");
    expect(c1.destinations.find((d) => d.destination === "Destination 1")!.shippedQty).toBe(60);
    expect(c1.destinations.find((d) => d.destination === "Destination 2")!.shippedQty).toBe(40);
  });

  it("sorts configs alphabetically", () => {
    const twoConfigs: ShipmentPlanRecord[] = [
      { config: "Config 2", totalShipment: 10, destinations: [{ destination: "Destination 1", qty: 10 }] },
      { config: "Config 1", totalShipment: 10, destinations: [{ destination: "Destination 1", qty: 10 }] },
    ];
    const result = computeShipmentProgress(twoConfigs, [], "2026-08-15");
    expect(result.map((c) => c.config)).toEqual(["Config 1", "Config 2"]);
  });
});
