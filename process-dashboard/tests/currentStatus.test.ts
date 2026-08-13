import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import { listSnapshots, computeCurrentStatus } from "../lib/currentStatus";
import type { DailyPlanData, ProcessStatusEntry } from "../lib/types";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("listSnapshots", () => {
  it("lists all 34 snapshots in chronological (date, then AM<PM) order", () => {
    const snaps = listSnapshots(getDataset().processStatus);
    expect(snaps).toHaveLength(34);
    expect(snaps[0]).toEqual({ date: "2026-08-04", time: "9:00 A.M" });
    expect(snaps[1]).toEqual({ date: "2026-08-04", time: "6:00 P.M" });
    expect(snaps[snaps.length - 1]).toEqual({ date: "2026-08-20", time: "6:00 P.M" });
  });
});

describe("computeCurrentStatus on the real virtual data, 2026-08-13 9:00 A.M", () => {
  it("returns one row per Config, grouped so each Config carries its Line", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
    expect(rows).toHaveLength(9);
    const line1Configs = rows.filter((r) => r.line === "Line 1").map((r) => r.config).sort();
    const line2Configs = rows.filter((r) => r.line === "Line 2").map((r) => r.config).sort();
    expect(line1Configs).toEqual(["Config 1", "Config 2", "Config 3", "Config 6", "Config 7"]);
    expect(line2Configs).toEqual(["Config 4", "Config 5", "Config 8", "Config 9"]);
  });

  it("Config 3 is sitting at process 11, exactly on the Daily Plan target date", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
    const c3 = rows.find((r) => r.config === "Config 3")!;
    expect(c3.processState).toBe("in_progress");
    expect(c3.currentProcess).toBe("process 11");
    expect(c3.planDate).toBe("2026-08-13");
    expect(c3.delayDays).toBe(0);
    expect(c3.status).toBe("계획준수");
  });

  it("Config 1 has already finished all 15 processes by this snapshot", () => {
    const { dailyPlan, processStatus } = getDataset();
    const rows = computeCurrentStatus(dailyPlan, processStatus, { date: "2026-08-13", time: "9:00 A.M" });
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
    expect(row.currentProcess).toBe("process 1");
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
