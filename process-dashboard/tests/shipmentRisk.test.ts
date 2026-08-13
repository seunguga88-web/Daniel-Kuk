import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { computeYieldCells } from "../lib/yieldAnalysis";
import { computeShipmentRisk } from "../lib/shipmentRisk";
import type { ProcessStatusEntry, ShipmentPlanRecord, ShipmentTableRecord } from "../lib/types";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("computeShipmentRisk on the real virtual data", () => {
  it("Config 2 and Config 4 come out Waiver Dependent, matching the documented example", () => {
    const { processStatus, shipmentPlan, shipmentTable } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentRisk(processStatus, shipmentPlan, shipmentTable, yieldCells);

    const c2 = rows.find((r) => r.config === "Config 2")!;
    const c4 = rows.find((r) => r.config === "Config 4")!;

    expect(c2.status).toBe("Waiver Dependent");
    expect(c2.currentGoodQty).toBe(800);
    expect(c2.totalShipment).toBe(1000);
    expect(c2.approvedWaiverQty).toBe(200);
    expect(c2.shortfall).toBeCloseTo(200, 0);

    expect(c4.status).toBe("Waiver Dependent");
    expect(c4.currentGoodQty).toBe(900);
    expect(c4.totalShipment).toBe(1200);
    expect(c4.approvedWaiverQty).toBe(300);
    expect(c4.shortfall).toBeCloseTo(300, 0);
  });

  it("every other Config is OK", () => {
    const { processStatus, shipmentPlan, shipmentTable } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    const rows = computeShipmentRisk(processStatus, shipmentPlan, shipmentTable, yieldCells);

    const others = rows.filter((r) => r.config !== "Config 2" && r.config !== "Config 4");
    expect(others).toHaveLength(7);
    for (const r of others) {
      expect(r.status, r.config).toBe("OK");
      expect(r.shortfall).toBe(0);
    }
  });

  it("a Process 15 target-yield override still keeps Config 2 Waiver Dependent (sanity: expected good stays close to actual 800)", () => {
    const { processStatus, shipmentPlan, shipmentTable } = getDataset();
    const yieldCells = computeYieldCells(processStatus);
    // All processes for Config 2 are already complete by the last snapshot, so overriding a
    // target yield (which only affects *remaining* processes) should not change the result.
    const rows = computeShipmentRisk(processStatus, shipmentPlan, shipmentTable, yieldCells, { "process 15": 99 });
    const c2 = rows.find((r) => r.config === "Config 2")!;
    expect(c2.expectedFinalGood).toBe(800);
    expect(c2.status).toBe("Waiver Dependent");
  });
});

describe("computeShipmentRisk branch coverage (synthetic)", () => {
  function entry(goodQty: number, remainingProcesses: string[]): ProcessStatusEntry {
    const processValues: ProcessStatusEntry["processValues"] = {};
    processValues["process 1"] = { input: 100, output: 100, ng: 0 };
    for (const p of remainingProcesses) {
      processValues[p] = { input: null, output: null, ng: null };
    }
    return {
      snapshotDate: "2026-08-13",
      snapshotTime: "9:00 A.M",
      line: "Line 1",
      config: "Config Z",
      processValues,
      goodQty,
      defectQty: null,
      majorDefect: null,
    };
  }

  const yieldCells = [
    { config: "Config A", process: "process 2", input: 100, output: 90, yieldFrac: 0.9 },
    { config: "Config B", process: "process 2", input: 100, output: 90, yieldFrac: 0.9 },
  ];

  function plan(totalShipment: number): ShipmentPlanRecord[] {
    return [{ config: "Config Z", totalShipment, destinations: [] }];
  }

  it("OK: expected final good already meets the shipment plan", () => {
    const processStatus = [entry(100, [])]; // fully complete, no remaining loss
    const rows = computeShipmentRisk(processStatus, plan(100), [], yieldCells);
    expect(rows[0].status).toBe("OK");
    expect(rows[0].shortfall).toBe(0);
  });

  it("Risk: shortfall exists but no approved Waiver NG on file", () => {
    const processStatus = [entry(100, ["process 2"])]; // 100 * 0.9 = 90 expected
    const rows = computeShipmentRisk(processStatus, plan(100), [], yieldCells);
    expect(rows[0].status).toBe("Risk");
    expect(rows[0].expectedFinalGood).toBeCloseTo(90, 5);
    expect(rows[0].shortfall).toBeCloseTo(10, 5);
  });

  it("Waiver Dependent: approved Waiver NG covers the shortfall", () => {
    const processStatus = [entry(100, ["process 2"])]; // expected 90, shortfall 10
    const shipmentTable: ShipmentTableRecord[] = [
      { config: "Config Z", destination: "Destination 1", date: "2026-08-15", qty: 15, label: "Waiver NG", waiverStatus: "Approved", cause: "test" },
    ];
    const rows = computeShipmentRisk(processStatus, plan(100), shipmentTable, yieldCells);
    expect(rows[0].status).toBe("Waiver Dependent");
    expect(rows[0].approvedWaiverQty).toBe(15);
  });

  it("Shortage: even approved Waiver NG isn't enough", () => {
    const processStatus = [entry(100, ["process 2"])]; // expected 90, shortfall 10
    const shipmentTable: ShipmentTableRecord[] = [
      { config: "Config Z", destination: "Destination 1", date: "2026-08-15", qty: 3, label: "Waiver NG", waiverStatus: "Approved", cause: "test" },
    ];
    const rows = computeShipmentRisk(processStatus, plan(100), shipmentTable, yieldCells);
    expect(rows[0].status).toBe("Shortage");
  });

  it("unapproved Waiver NG rows do not count toward the covered amount", () => {
    const processStatus = [entry(100, ["process 2"])]; // expected 90, shortfall 10
    const shipmentTable: ShipmentTableRecord[] = [
      { config: "Config Z", destination: "Destination 1", date: "2026-08-15", qty: 50, label: "Waiver NG", waiverStatus: "Pending", cause: "test" },
    ];
    const rows = computeShipmentRisk(processStatus, plan(100), shipmentTable, yieldCells);
    expect(rows[0].approvedWaiverQty).toBe(0);
    expect(rows[0].status).toBe("Risk");
  });
});
