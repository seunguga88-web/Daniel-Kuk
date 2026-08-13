import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { computeYieldCells } from "../lib/yieldAnalysis";
import { computeShipmentDraft } from "../lib/shipmentDraft";
import type { DailyPlanData, ProcessStatusEntry, ShipmentPlanRecord } from "../lib/types";

const DEFAULT_PRIORITY = ["Destination 1", "Destination 2", "Destination 3", "Destination 4"];

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("computeShipmentDraft on the real virtual data", () => {
  it("Config 2 ships 2026-08-15; once its last process is actually done (D-1 6PM), OK/Waiver matches the documented shortfall exactly", () => {
    const { dailyPlan, shipmentPlan, processStatus } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentDraft(
      { date: "2026-08-14", time: "6:00 P.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      DEFAULT_PRIORITY
    );

    const c2 = rows.find((r) => r.config === "Config 2")!;
    expect(c2).toBeDefined();
    expect(c2.shipDate).toBe("2026-08-15");
    expect(c2.okAvailable).toBe(800);
    expect(c2.waiverNeeded).toBe(200);

    const byDest = Object.fromEntries(c2.allocations.map((a) => [a.destination, a]));
    expect(byDest["Destination 1"]).toMatchObject({ planQty: 600, okQty: 600, waiverQty: 0, totalQty: 600 });
    expect(byDest["Destination 2"]).toMatchObject({ planQty: 150, okQty: 150, waiverQty: 0, totalQty: 150 });
    expect(byDest["Destination 3"]).toMatchObject({ planQty: 100, okQty: 50, waiverQty: 50, totalQty: 100 });
    expect(byDest["Destination 4"]).toMatchObject({ planQty: 150, okQty: 0, waiverQty: 150, totalQty: 150 });

    // Every destination's plan is fully covered (OK + Waiver together match Total Shipment).
    for (const a of c2.allocations) expect(a.totalQty).toBe(a.planQty);
  });

  it("at the doc-recommended D-1 9AM, Config 2's last process (15) is still running -- the draft is a genuine projection, not yet the final 800", () => {
    const { dailyPlan, shipmentPlan, processStatus } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentDraft(
      { date: "2026-08-14", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      DEFAULT_PRIORITY
    );
    const c2 = rows.find((r) => r.config === "Config 2")!;
    // currentGoodQty(860) x auto-baseline for process 15 (~98.9%, still running for
    // Config 2 itself at this point) -- optimistic vs. Config 2's own eventual 93%.
    expect(c2.okAvailable + c2.waiverNeeded).toBe(1000);
    expect(c2.okAvailable).toBeGreaterThan(800);
    expect(c2.okAvailable).toBeCloseTo(850.5, 0);
  });

  it("Config 4 ships 2026-08-17 (found from 2026-08-16 D-1 9AM) and its OK/Waiver split matches the documented shortfall exactly", () => {
    const { dailyPlan, shipmentPlan, processStatus } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentDraft(
      { date: "2026-08-16", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      DEFAULT_PRIORITY
    );

    const c4 = rows.find((r) => r.config === "Config 4")!;
    expect(c4).toBeDefined();
    expect(c4.shipDate).toBe("2026-08-17");
    expect(c4.okAvailable).toBe(900);
    expect(c4.waiverNeeded).toBe(300);

    const byDest = Object.fromEntries(c4.allocations.map((a) => [a.destination, a]));
    expect(byDest["Destination 1"]).toMatchObject({ planQty: 720, okQty: 720, waiverQty: 0, totalQty: 720 });
    expect(byDest["Destination 2"]).toMatchObject({ planQty: 180, okQty: 180, waiverQty: 0, totalQty: 180 });
    expect(byDest["Destination 3"]).toMatchObject({ planQty: 120, okQty: 0, waiverQty: 120, totalQty: 120 });
    expect(byDest["Destination 4"]).toMatchObject({ planQty: 180, okQty: 0, waiverQty: 180, totalQty: 180 });
  });

  it("a Config with no yield shortfall gets a pure-OK draft matching its destination plan exactly", () => {
    const { dailyPlan, shipmentPlan, processStatus } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    // Config 1 ships 2026-08-13 -> D-1 reference is 2026-08-12.
    const rows = computeShipmentDraft(
      { date: "2026-08-12", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      DEFAULT_PRIORITY
    );
    const c1 = rows.find((r) => r.config === "Config 1")!;
    expect(c1.waiverNeeded).toBe(0);
    for (const a of c1.allocations) {
      expect(a.waiverQty).toBe(0);
      expect(a.okQty).toBe(a.planQty);
    }
  });

  it("returns nothing for a reference date with no Config shipping the next day", () => {
    const { dailyPlan, shipmentPlan, processStatus } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentDraft(
      { date: "2026-08-05", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      DEFAULT_PRIORITY
    );
    expect(rows).toEqual([]);
  });
});

describe("computeShipmentDraft: destination priority changes the allocation (synthetic)", () => {
  const dailyPlan: DailyPlanData = {
    schedule: [],
    shipments: [{ config: "Config Z", shipDate: "2026-08-15" }],
  };
  const shipmentPlan: ShipmentPlanRecord[] = [
    {
      config: "Config Z",
      totalShipment: 100,
      destinations: [
        { destination: "Destination 1", qty: 60 },
        { destination: "Destination 2", qty: 40 },
      ],
    },
  ];
  const processStatus: ProcessStatusEntry[] = [
    {
      snapshotDate: "2026-08-14",
      snapshotTime: "9:00 A.M",
      line: "Line 1",
      config: "Config Z",
      processValues: { "process 1": { input: 100, output: 100, ng: 0 } },
      goodQty: 70, // less than totalShipment(100) -> shortfall of 30
      defectQty: 0,
      majorDefect: null,
    },
  ];
  const yieldCells: ReturnType<typeof computeYieldCells> = [];

  it("Destination 1 first: OK fills D1 fully, D2 gets the rest of OK then Waiver for its gap", () => {
    const rows = computeShipmentDraft(
      { date: "2026-08-14", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      ["Destination 1", "Destination 2"]
    );
    const byDest = Object.fromEntries(rows[0].allocations.map((a) => [a.destination, a]));
    expect(byDest["Destination 1"]).toMatchObject({ okQty: 60, waiverQty: 0 });
    expect(byDest["Destination 2"]).toMatchObject({ okQty: 10, waiverQty: 30 });
  });

  it("Destination 2 first: reversing priority reassigns which destination absorbs the OK shortfall", () => {
    const rows = computeShipmentDraft(
      { date: "2026-08-14", time: "9:00 A.M" },
      dailyPlan,
      shipmentPlan,
      processStatus,
      yieldCells,
      {},
      ["Destination 2", "Destination 1"]
    );
    const byDest = Object.fromEntries(rows[0].allocations.map((a) => [a.destination, a]));
    expect(byDest["Destination 2"]).toMatchObject({ okQty: 40, waiverQty: 0 });
    expect(byDest["Destination 1"]).toMatchObject({ okQty: 30, waiverQty: 30 });
  });
});
