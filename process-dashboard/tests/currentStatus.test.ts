import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { listSnapshots, computeCurrentStatus, trafficLight, type CurrentStatusRow } from "../lib/currentStatus";
import type { DailyPlanData, ProcessStatusEntry } from "../lib/types";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("listSnapshots", () => {
  it("lists all 34 snapshots in chronological (date, then AM<PM) order", () => {
    const snaps = listSnapshots(getDataset().processStatus);
    expect(snaps).toHaveLength(34);
    expect(snaps[0]).toEqual({ date: "2026-08-05", time: "9:00 A.M" });
    expect(snaps[1]).toEqual({ date: "2026-08-05", time: "6:00 P.M" });
    expect(snaps[snaps.length - 1]).toEqual({ date: "2026-08-21", time: "6:00 P.M" });
  });
});

describe("computeCurrentStatus on the real virtual data, 2026-08-14 9:00 A.M", () => {
  it("returns one row per Config, grouped so each Config carries its Line", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-14", time: "9:00 A.M" });
    expect(rows).toHaveLength(9);
    const line1Configs = rows.filter((r) => r.line === "Line 1").map((r) => r.config).sort();
    const line2Configs = rows.filter((r) => r.line === "Line 2").map((r) => r.config).sort();
    expect(line1Configs).toEqual(["Config 1", "Config 2", "Config 3", "Config 6", "Config 7"]);
    expect(line2Configs).toEqual(["Config 4", "Config 5", "Config 8", "Config 9"]);
  });

  it("Config 3 is sitting at process 11, exactly on the Daily Plan target date", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-14", time: "9:00 A.M" });
    const c3 = rows.find((r) => r.config === "Config 3")!;
    expect(c3.processState).toBe("in_progress");
    expect(c3.currentProcess).toBe("process 11");
    expect(c3.planDate).toBe("2026-08-14");
    expect(c3.delayDays).toBe(0);
    expect(c3.status).toBe("계획준수");
  });

  it("Config 1 has already finished all 15 processes by this snapshot", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-14", time: "9:00 A.M" });
    const c1 = rows.find((r) => r.config === "Config 1")!;
    expect(c1.processState).toBe("completed");
    expect(c1.status).toBe("완료");
    expect(c1.delayDays).toBeNull();
  });
});

describe("computeCurrentStatus branch coverage (synthetic)", () => {
  const dailyPlan: DailyPlanData = {
    schedule: [
      { line: "Line 1", process: "process 1", config: "Config Z", planDate: "2026-08-10" },
      { line: "Line 1", process: "process 2", config: "Config Z", planDate: "2026-08-12" },
    ],
    shipments: [],
  };

  function entry(processValues: ProcessStatusEntry["processValues"]): ProcessStatusEntry {
    return {
      snapshotDate: "2026-08-13",
      snapshotTime: "9:00 A.M",
      line: "Line 1",
      config: "Config Z",
      processValues,
      goodQty: null,
      defectQty: null,
      majorDefect: null,
    };
  }

  it("not_started: no process has Input yet", () => {
    const processStatus = [
      entry({
        "process 1": { input: null, output: null, ng: null },
        "process 2": { input: null, output: null, ng: null },
      }),
    ];
    const [row] = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
    expect(row.processState).toBe("not_started");
    expect(row.currentProcess).toBeNull();
    expect(row.planDate).toBeNull();
    expect(row.delayDays).toBeNull();
  });

  it("in_progress + late: Input present, no Output, past the plan date", () => {
    const processStatus = [
      entry({
        "process 1": { input: 100, output: 100, ng: 0 },
        "process 2": { input: 50, output: null, ng: null },
      }),
    ];
    const [row] = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
    expect(row.processState).toBe("in_progress");
    expect(row.currentProcess).toBe("process 2");
    expect(row.planDate).toBe("2026-08-12");
    expect(row.delayDays).toBe(1);
    expect(row.status).toBe("지연");
    expect(row.alarmLevel).toBeNull(); // below the default 2-day warning threshold
  });

  it("completed: every defined process has both Input and Output", () => {
    const processStatus = [
      entry({
        "process 1": { input: 100, output: 100, ng: 0 },
        "process 2": { input: 100, output: 100, ng: 0 },
      }),
    ];
    const [row] = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
    expect(row.processState).toBe("completed");
    expect(row.currentProcess).toBe("process 2");
    expect(row.status).toBe("완료");
    expect(row.delayDays).toBeNull();
  });
});

describe("trafficLight", () => {
  function row(overrides: Partial<CurrentStatusRow>): CurrentStatusRow {
    return {
      line: "Line 1",
      config: "Config Z",
      processState: "in_progress",
      currentProcess: "process 1",
      planDate: "2026-08-10",
      delayDays: 0,
      status: "계획준수",
      alarmLevel: null,
      ...overrides,
    };
  }

  it("on-time or ahead of plan is green", () => {
    expect(trafficLight(row({ delayDays: 0 }))).toBe("green");
    expect(trafficLight(row({ delayDays: -3 }))).toBe("green");
  });

  it("exactly 1 day late is yellow", () => {
    expect(trafficLight(row({ delayDays: 1 }))).toBe("yellow");
  });

  it("2 or more days late is red", () => {
    expect(trafficLight(row({ delayDays: 2 }))).toBe("red");
    expect(trafficLight(row({ delayDays: 9 }))).toBe("red");
  });

  it("completed rows are green even though delayDays is null", () => {
    expect(trafficLight(row({ processState: "completed", delayDays: null }))).toBe("green");
  });

  it("not-started rows have no light (blank)", () => {
    expect(trafficLight(row({ processState: "not_started", delayDays: null, currentProcess: null }))).toBeNull();
  });
});
