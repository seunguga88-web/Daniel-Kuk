import ExcelJS from "exceljs";
import type { YieldCell, Thresholds, YieldStatus } from "./yieldAnalysis";
import { computeBaseline, classifyYield } from "./yieldAnalysis";
import type { CurrentStatusRow, Snapshot, TrafficLight } from "./currentStatus";
import { trafficLight } from "./currentStatus";
import type { ScheduleThresholds } from "./scheduleAnalysis";

const TRAFFIC_LIGHT_FILL: Record<NonNullable<TrafficLight>, string> = {
  green: "FF22C55E",
  yellow: "FFEAB308",
  red: "FFEF4444",
};

const TRAFFIC_LIGHT_LABEL: Record<NonNullable<TrafficLight>, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
};

const FILL: Record<YieldStatus, string | null> = {
  risk: "FFFECACA",
  warning: "FFFEF08A",
  normal: null,
};

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function buildYieldAnalysisWorkbook(
  yieldCells: YieldCell[],
  processes: string[],
  configs: string[],
  thresholds: Thresholds,
  targetYields: Record<string, number>
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Yield Heatmap");

  const header = ["Config", ...processes.map((p) => p.replace("process ", "Process "))];
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };

  const cellByKey = new Map(yieldCells.map((c) => [`${c.config}|${c.process}`, c]));
  const baselineByProcess = new Map(processes.map((p) => [p, computeBaseline(yieldCells, p, targetYields[p])]));

  for (const config of configs) {
    const row = [config as string | number];
    for (const p of processes) {
      const cell = cellByKey.get(`${config}|${p}`);
      row.push(cell ? Math.round(cell.yieldFrac * 1000) / 10 : "");
    }
    const excelRow = sheet.addRow(row);
    processes.forEach((p, i) => {
      const cell = cellByKey.get(`${config}|${p}`);
      const excelCell = excelRow.getCell(i + 2);
      excelCell.numFmt = "0.0";
      if (cell) {
        const baseline = baselineByProcess.get(p)!;
        const status = classifyYield(cell.yieldFrac, baseline, thresholds);
        const fill = FILL[status];
        if (fill) excelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }
    });
  }

  sheet.getColumn(1).width = 12;
  for (let i = 2; i <= header.length; i++) sheet.getColumn(i).width = 11;

  let r = configs.length + 3;
  sheet.getCell(`A${r}`).value = "Process별 기준 수율 (%)";
  sheet.getCell(`A${r}`).font = { bold: true };
  r++;
  sheet.addRow([]);
  const baselineHeaderRow = sheet.getRow(r);
  baselineHeaderRow.getCell(1).value = "Process";
  baselineHeaderRow.getCell(2).value = "기준 수율(%)";
  baselineHeaderRow.getCell(3).value = "출처";
  baselineHeaderRow.font = { bold: true };
  r++;
  for (const p of processes) {
    const row = sheet.getRow(r);
    row.getCell(1).value = p.replace("process ", "Process ");
    row.getCell(2).value = Math.round(baselineByProcess.get(p)! * 1000) / 10;
    row.getCell(3).value = targetYields[p] !== undefined ? "사용자 입력" : "자동 계산(중간값)";
    r++;
  }

  r++;
  sheet.getCell(`A${r}`).value = "임계값 설정";
  sheet.getCell(`A${r}`).font = { bold: true };
  r++;
  sheet.getCell(`A${r}`).value = "위험(절대, %)";
  sheet.getCell(`B${r}`).value = thresholds.riskAbsolutePct;
  r++;
  sheet.getCell(`A${r}`).value = "주의(절대, %)";
  sheet.getCell(`B${r}`).value = thresholds.warningAbsolutePct;
  r++;
  sheet.getCell(`A${r}`).value = "위험(기준수율 대비, %p)";
  sheet.getCell(`B${r}`).value = thresholds.riskGapPp;
  r++;
  sheet.getCell(`A${r}`).value = "주의(기준수율 대비, %p)";
  sheet.getCell(`B${r}`).value = thresholds.warningGapPp;

  return wb.xlsx.writeBuffer();
}

export async function buildProcessDashboardWorkbook(
  rows: CurrentStatusRow[],
  snapshot: Snapshot,
  thresholds: ScheduleThresholds
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Process Dashboard");

  sheet.getCell("A1").value = "기준 시점";
  sheet.getCell("B1").value = `${snapshot.date} ${snapshot.time}`;
  sheet.getCell("A1").font = { bold: true };

  sheet.getCell("A2").value = "주의(지연일수 이상)";
  sheet.getCell("B2").value = thresholds.warningDays;
  sheet.getCell("A3").value = "위험(지연일수 이상)";
  sheet.getCell("B3").value = thresholds.riskDays;

  const headerRowIdx = 5;
  const header = ["Line", "Config", "신호등", "현재 대기 Process", "상태", "Daily Plan 계획일", "지연일수", "알람"];
  const headerRow = sheet.getRow(headerRowIdx);
  header.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  headerRow.font = { bold: true };

  const sorted = [...rows].sort(
    (a, b) => a.line.localeCompare(b.line) || a.config.localeCompare(b.config) || processNum(a.currentProcess ?? "") - processNum(b.currentProcess ?? "")
  );

  let r = headerRowIdx + 1;
  for (const row of sorted) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = row.line;
    excelRow.getCell(2).value = row.config;
    const light = trafficLight(row);
    excelRow.getCell(3).value = light ? TRAFFIC_LIGHT_LABEL[light] : "";
    if (light) {
      excelRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TRAFFIC_LIGHT_FILL[light] } };
    }
    excelRow.getCell(4).value = row.currentProcess ? row.currentProcess.replace("process ", "Process ") : "";
    excelRow.getCell(5).value =
      row.processState === "completed" ? "완료" : row.processState === "not_started" ? "" : "대기 중";
    excelRow.getCell(6).value = row.planDate ?? "";
    excelRow.getCell(7).value = row.delayDays ?? "";
    excelRow.getCell(8).value = row.alarmLevel === "risk" ? "위험" : row.alarmLevel === "warning" ? "주의" : "";

    const fill = row.alarmLevel ? FILL[row.alarmLevel] : null;
    if (fill) {
      for (let c = 1; c <= 8; c++) {
        if (c === 3) continue; // keep the traffic-light cell's own color
        excelRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }
    }
    r++;
  }

  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 9;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 10;
  sheet.getColumn(6).width = 16;
  sheet.getColumn(7).width = 10;
  sheet.getColumn(8).width = 8;

  return wb.xlsx.writeBuffer();
}
