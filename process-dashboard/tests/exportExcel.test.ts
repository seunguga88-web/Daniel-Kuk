import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { computeYieldCells, DEFAULT_THRESHOLDS } from "../lib/yieldAnalysis";
import { listSnapshots, computeCurrentStatus } from "../lib/currentStatus";
import { DEFAULT_SCHEDULE_THRESHOLDS } from "../lib/scheduleAnalysis";
import { buildYieldAnalysisWorkbook, buildProcessDashboardWorkbook } from "../lib/exportExcel";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

async function loadWorkbook(buffer: ExcelJS.Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe("buildYieldAnalysisWorkbook — cell-by-cell round trip", () => {
  it("puts every Config's yield in its own numeric cell, matching the heatmap values", async () => {
    const dataset = getDataset();
    const yieldCells = computeYieldCells(dataset.processStatus);
    const processes = Array.from(new Set(yieldCells.map((c) => c.process))).sort(
      (a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0])
    );
    const configs = Array.from(new Set(yieldCells.map((c) => c.config))).sort();

    const buffer = await buildYieldAnalysisWorkbook(yieldCells, processes, configs, DEFAULT_THRESHOLDS, {});
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet("Yield Heatmap")!;

    // Header row: A1="Config", B1="Process 1", ... one process name per cell.
    expect(sheet.getCell("A1").value).toBe("Config");
    expect(sheet.getCell("B1").value).toBe("Process 1");

    // Row for Config 2 is the 3rd row (header + Config 1).
    const config2RowIdx = 1 + configs.indexOf("Config 2") + 1;
    const p7ColIdx = 1 + processes.indexOf("process 7") + 1;
    const p11ColIdx = 1 + processes.indexOf("process 11") + 1;

    expect(sheet.getCell(config2RowIdx, 1).value).toBe("Config 2");
    expect(sheet.getCell(config2RowIdx, p7ColIdx).value).toBeCloseTo(79.5, 1);
    expect(sheet.getCell(config2RowIdx, p11ColIdx).value).toBeCloseTo(74.1, 1);

    // Risk cells are individually filled red; a normal cell (Config 1, process 1) is not.
    const riskFill = sheet.getCell(config2RowIdx, p7ColIdx).fill as ExcelJS.FillPattern;
    expect(riskFill.fgColor?.argb).toBe("FFFECACA");

    const config1RowIdx = 1 + configs.indexOf("Config 1") + 1;
    const p1ColIdx = 1 + processes.indexOf("process 1") + 1;
    const normalFill = sheet.getCell(config1RowIdx, p1ColIdx).fill as ExcelJS.FillPattern;
    expect(normalFill?.fgColor).toBeUndefined();
  });

  it("also writes the baseline table and threshold settings as their own cells", async () => {
    const dataset = getDataset();
    const yieldCells = computeYieldCells(dataset.processStatus);
    const processes = ["process 1", "process 7"];
    const configs = ["Config 1"];

    const buffer = await buildYieldAnalysisWorkbook(yieldCells, processes, configs, DEFAULT_THRESHOLDS, { "process 1": 95 });
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet("Yield Heatmap")!;

    // Baseline table starts a few rows below the heatmap (row 5 here: header + 1 config row + blank).
    let found = false;
    for (let r = 1; r <= 20; r++) {
      if (sheet.getCell(r, 1).value === "Process 1") {
        expect(sheet.getCell(r, 2).value).toBe(95);
        expect(sheet.getCell(r, 3).value).toBe("사용자 입력");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("buildProcessDashboardWorkbook — cell-by-cell round trip", () => {
  it("writes one row per Config with the snapshot header and per-cell delay info", async () => {
    const dataset = getDataset();
    const snapshot = { date: "2026-08-13", time: "9:00 A.M" };
    const rows = computeCurrentStatus(dataset.dailyPlan, dataset.processStatus, snapshot, DEFAULT_SCHEDULE_THRESHOLDS);

    const buffer = await buildProcessDashboardWorkbook(rows, snapshot, DEFAULT_SCHEDULE_THRESHOLDS);
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet("Process Dashboard")!;

    expect(sheet.getCell("A1").value).toBe("기준 시점");
    expect(sheet.getCell("B1").value).toBe("2026-08-13 9:00 A.M");

    // Find Config 3's row and check each column individually.
    let config3Row = -1;
    for (let r = 6; r <= 6 + rows.length; r++) {
      if (sheet.getCell(r, 2).value === "Config 3") {
        config3Row = r;
        break;
      }
    }
    expect(config3Row).toBeGreaterThan(0);
    expect(sheet.getCell(config3Row, 1).value).toBe("Line 1");
    expect(sheet.getCell(config3Row, 3).value).toBe("Green"); // on-time -> green traffic light
    expect(sheet.getCell(config3Row, 4).value).toBe("Process 11");
    expect(sheet.getCell(config3Row, 5).value).toBe("대기 중");
    expect(sheet.getCell(config3Row, 6).value).toBe("2026-08-13");
    expect(sheet.getCell(config3Row, 7).value).toBe(0);

    const lightFill = sheet.getCell(config3Row, 3).fill as ExcelJS.FillPattern;
    expect(lightFill.fgColor?.argb).toBe("FF22C55E");
  });

  it("leaves not-started Configs' cells blank rather than filling in placeholder text", async () => {
    const dataset = getDataset();
    const snapshot = { date: "2026-08-04", time: "9:00 A.M" };
    const rows = computeCurrentStatus(dataset.dailyPlan, dataset.processStatus, snapshot, DEFAULT_SCHEDULE_THRESHOLDS);

    const buffer = await buildProcessDashboardWorkbook(rows, snapshot, DEFAULT_SCHEDULE_THRESHOLDS);
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet("Process Dashboard")!;

    let config2Row = -1;
    for (let r = 6; r <= 6 + rows.length; r++) {
      if (sheet.getCell(r, 2).value === "Config 2") {
        config2Row = r;
        break;
      }
    }
    expect(config2Row).toBeGreaterThan(0);
    expect(sheet.getCell(config2Row, 3).value).toBeFalsy(); // no traffic light either
    expect(sheet.getCell(config2Row, 4).value).toBeFalsy();
    expect(sheet.getCell(config2Row, 6).value).toBeFalsy();
    expect(sheet.getCell(config2Row, 7).value).toBeFalsy();
  });
});

describe("listSnapshots sanity (used to pick the export snapshot)", () => {
  it("still returns 34 entries", () => {
    expect(listSnapshots(getDataset().processStatus)).toHaveLength(34);
  });
});
