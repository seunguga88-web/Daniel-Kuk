import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { computeScheduleCells, DEFAULT_SCHEDULE_THRESHOLDS } from "../lib/scheduleAnalysis";
import type { DailyPlanData, ProcessStatusEntry } from "../lib/types";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("computeScheduleCells against the real virtual data", () => {
  it("produces exactly one cell per Daily Plan schedule row, all with a valid status", () => {
    const { dailyPlan, processStatus } = getDataset();
    const cells = computeScheduleCells(dailyPlan, processStatus);
    expect(cells).toHaveLength(dailyPlan.schedule.length);
    for (const c of cells) {
      expect(["계획준수", "지연", "선행", "진행중", "예정"]).toContain(c.status);
    }
  });

  it("Config 1 / process 1 is judged against an actual Output date pulled from 공정 status", () => {
    const { dailyPlan, processStatus } = getDataset();
    const cells = computeScheduleCells(dailyPlan, processStatus);
    const cell = cells.find((c) => c.config === "Config 1" && c.process === "process 1")!;
    expect(cell.planDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Process 1 starts immediately in the virtual data (Input present from the first snapshot),
    // so it should already have a recorded actual date rather than being merely "진행중"/"예정".
    expect(cell.actualDate).not.toBeNull();
  });
});

describe("day-diff classification (synthetic)", () => {
  const dailyPlan: DailyPlanData = {
    schedule: [
      { line: "Line 1", process: "process 1", config: "Config A", planDate: "2026-08-10" },
      { line: "Line 1", process: "process 2", config: "Config A", planDate: "2026-08-10" },
      { line: "Line 1", process: "process 3", config: "Config A", planDate: "2026-08-10" },
      { line: "Line 1", process: "process 4", config: "Config A", planDate: "2026-08-20" },
      { line: "Line 1", process: "process 5", config: "Config A", planDate: "2026-08-05" },
    ],
    shipments: [],
  };

  function statusEntry(process: string, date: string, output: number | null): ProcessStatusEntry {
    return {
      snapshotDate: date,
      snapshotTime: "9:00 A.M",
      line: "Line 1",
      config: "Config A",
      processValues: { [process]: { input: 100, output, ng: output === null ? null : 0 } },
      goodQty: null,
      defectQty: null,
      majorDefect: null,
    };
  }

  it("0-day diff => 계획준수, no alarm", () => {
    const processStatus = [statusEntry("process 1", "2026-08-10", 100)];
    const cells = computeScheduleCells(dailyPlan, processStatus);
    const c = cells.find((c) => c.process === "process 1")!;
    expect(c.status).toBe("계획준수");
    expect(c.delayDays).toBe(0);
    expect(c.alarmLevel).toBeNull();
  });

  it("2-day late => 지연 + warning alarm; 3-day late => risk alarm", () => {
    const processStatus = [
      statusEntry("process 2", "2026-08-12", 100), // 2 days late
      statusEntry("process 3", "2026-08-13", 100), // 3 days late
    ];
    const cells = computeScheduleCells(dailyPlan, processStatus);
    const c2 = cells.find((c) => c.process === "process 2")!;
    const c3 = cells.find((c) => c.process === "process 3")!;
    expect(c2.status).toBe("지연");
    expect(c2.delayDays).toBe(2);
    expect(c2.alarmLevel).toBe("warning");
    expect(c3.delayDays).toBe(3);
    expect(c3.alarmLevel).toBe("risk");
  });

  it("earlier-than-plan actual date => 선행, no alarm", () => {
    const processStatus = [statusEntry("process 5", "2026-08-03", 100)]; // plan 08-05, 2 days early
    const cells = computeScheduleCells(dailyPlan, processStatus);
    const c = cells.find((c) => c.process === "process 5")!;
    expect(c.status).toBe("선행");
    expect(c.delayDays).toBe(-2);
    expect(c.alarmLevel).toBeNull();
  });

  it("no Output yet, plan date not reached, Input present => 진행중", () => {
    const processStatus = [statusEntry("process 4", "2026-08-15", null)]; // plan 08-20, "today" is 08-15
    const cells = computeScheduleCells(dailyPlan, processStatus);
    const c = cells.find((c) => c.process === "process 4")!;
    expect(c.status).toBe("진행중");
    expect(c.alarmLevel).toBeNull();
  });

  it("no Output yet, plan date already passed => 지연, alarmed once past the threshold", () => {
    // "Today" (latest snapshot) is 08-23, well past process 4's 08-20 plan date.
    const processStatus = [statusEntry("process 4", "2026-08-23", null)];
    const cells = computeScheduleCells(dailyPlan, processStatus, DEFAULT_SCHEDULE_THRESHOLDS);
    const c = cells.find((c) => c.process === "process 4")!;
    expect(c.status).toBe("지연");
    expect(c.delayDays).toBe(3);
    expect(c.alarmLevel).toBe("risk");
  });
});
