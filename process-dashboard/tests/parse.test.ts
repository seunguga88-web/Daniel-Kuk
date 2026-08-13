import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { validateDataset } from "../lib/validate";
import { parseShipmentTable } from "../lib/parsers/shipmentTable";
import { loadVirtualDataInputs as loadInputs } from "./fixtures";
import type { ParsedDataset, ProcessStatusEntry } from "../lib/types";

function latestEntry(entries: ProcessStatusEntry[], config: string): ProcessStatusEntry {
  const forConfig = entries.filter((e) => e.config === config);
  forConfig.sort((a, b) => {
    if (a.snapshotDate !== b.snapshotDate) return a.snapshotDate < b.snapshotDate ? -1 : 1;
    const aPM = a.snapshotTime.includes("P.M") ? 1 : 0;
    const bPM = b.snapshotTime.includes("P.M") ? 1 : 0;
    return aPM - bPM;
  });
  return forConfig[forConfig.length - 1];
}

describe("parseAllFiles: file kind detection", () => {
  it("detects all 5 virtual data files by header/structure, not filename", () => {
    const { dataset, unrecognizedFiles } = parseAllFiles(loadInputs());
    expect(unrecognizedFiles).toEqual([]);
    const kinds = dataset.files.map((f) => f.kind).sort();
    expect(kinds).toEqual(
      ["configInfo", "dailyPlan", "processStatus", "shipmentPlan", "shipmentTable"].sort()
    );
  });
});

describe("parseConfigInfo (pivot layout)", () => {
  it("reads Input/Shipment Qty and materials per config", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const c2 = dataset.configInfo.find((c) => c.config === "Config 2")!;
    expect(c2.inputQty).toBe(1500);
    expect(c2.shipmentQty).toBe(1000);
    expect(c2.materials.length).toBeGreaterThan(0);
  });
});

describe("parseShipmentPlan (pivot layout)", () => {
  it("reads Total Shipment and Destination breakdown per config", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const c2 = dataset.shipmentPlan.find((c) => c.config === "Config 2")!;
    expect(c2.totalShipment).toBe(1000);
    const sum = c2.destinations.reduce((a, d) => a + d.qty, 0);
    expect(sum).toBe(1000);
  });
});

describe("parseDailyPlan (gantt layout)", () => {
  it("extracts a plan date per Line/Process/Config and a ship date per Config", () => {
    const { dataset } = parseAllFiles(loadInputs());
    expect(dataset.dailyPlan.schedule.length).toBeGreaterThan(0);
    expect(dataset.dailyPlan.shipments.length).toBeGreaterThan(0);
    const c2Ship = dataset.dailyPlan.shipments.find((s) => s.config === "Config 2");
    expect(c2Ship).toBeDefined();
  });
});

describe("parseProcessStatus (repeating snapshot blocks) — Config 2 / Config 4 known cases", () => {
  it("Config 2 최종 상태: Process 7 수율 약 79.5%, Process 11 수율 약 74.1%, 최종 양품 800", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const latest = latestEntry(dataset.processStatus, "Config 2");
    const p7 = latest.processValues["process 7"];
    const p11 = latest.processValues["process 11"];
    expect(p7.output! / p7.input!).toBeCloseTo(0.795, 2);
    expect(p11.output! / p11.input!).toBeCloseTo(0.741, 2);
    expect(latest.goodQty).toBe(800);
  });

  it("Config 4 최종 상태: Process 7 수율 80.0%, Process 11 수율 약 71.4%, 최종 양품 900", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const latest = latestEntry(dataset.processStatus, "Config 4");
    const p7 = latest.processValues["process 7"];
    const p11 = latest.processValues["process 11"];
    expect(p7.output! / p7.input!).toBeCloseTo(0.8, 2);
    expect(p11.output! / p11.input!).toBeCloseTo(0.714, 2);
    expect(latest.goodQty).toBe(900);
  });
});

describe("parseShipmentTable (repeated header rows filtered out)", () => {
  it("filters repeated header rows and finds Waiver NG rows for Config 2 / 4", () => {
    const { dataset } = parseAllFiles(loadInputs());
    expect(dataset.shipmentTable.every((r) => r.config !== "Config")).toBe(true);
    const c2Waiver = dataset.shipmentTable.filter((r) => r.config === "Config 2" && r.label === "Waiver NG");
    const c4Waiver = dataset.shipmentTable.filter((r) => r.config === "Config 4" && r.label === "Waiver NG");
    expect(c2Waiver.reduce((a, r) => a + r.qty, 0)).toBe(200);
    expect(c4Waiver.reduce((a, r) => a + r.qty, 0)).toBe(300);
    expect(c2Waiver.every((r) => r.waiverStatus === "Approved")).toBe(true);
  });
});

describe("column-order robustness (headers matched by name, not position)", () => {
  it("still parses correctly when the shipment table's columns are reordered", () => {
    const reorderedAOA = [
      ["Waiver Status", "Config", "Cause", "Destination", "Label", "Date", "Qty"],
      ["N/A", "Config 1", "-", "Destination 1", "OK", new Date("2026-08-15"), 600],
      ["Approved", "Config 2", "High NG", "Destination 3", "Waiver NG", new Date("2026-08-17"), 50],
    ];
    const records = parseShipmentTable(reorderedAOA);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ config: "Config 1", destination: "Destination 1", qty: 600, label: "OK" });
    expect(records[1]).toMatchObject({ config: "Config 2", qty: 50, label: "Waiver NG", waiverStatus: "Approved" });
  });
});

describe("validateDataset", () => {
  it("passes with zero errors on the untouched virtual data", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const errors = validateDataset(dataset);
    expect(errors).toEqual([]);
  });

  it("catches an injected Input != Output + NG violation", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const broken: ParsedDataset = JSON.parse(JSON.stringify(dataset));
    const entry = broken.processStatus.find(
      (e: ProcessStatusEntry) => e.config === "Config 1" && e.processValues["process 1"]?.output !== null
    )!;
    entry.processValues["process 1"].output! += 999;

    const errors = validateDataset(broken);
    expect(errors.some((e) => e.rule === "Input = Output + NG")).toBe(true);
  });

  it("catches an injected Destination-sum mismatch", () => {
    const { dataset } = parseAllFiles(loadInputs());
    const broken: ParsedDataset = JSON.parse(JSON.stringify(dataset));
    broken.shipmentPlan[0].destinations[0].qty += 50;

    const errors = validateDataset(broken);
    expect(errors.some((e) => e.rule === "Destination 합계 = Total Shipment")).toBe(true);
  });
});
