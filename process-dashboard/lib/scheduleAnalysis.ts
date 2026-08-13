import type { DailyPlanData, ProcessStatusEntry } from "./types";
import { latestEntryPerConfig } from "./yieldAnalysis";

export type ScheduleStatus = "계획준수" | "지연" | "선행" | "진행중" | "예정";
export type AlarmLevel = "risk" | "warning" | null;

export interface ScheduleThresholds {
  warningDays: number; // e.g. 2
  riskDays: number; // e.g. 3
}

export const DEFAULT_SCHEDULE_THRESHOLDS: ScheduleThresholds = {
  warningDays: 2,
  riskDays: 3,
};

export interface ScheduleCell {
  config: string;
  process: string;
  planDate: string;
  actualDate: string | null;
  status: ScheduleStatus;
  delayDays: number | null; // positive = late, negative = ahead, null = not applicable yet
  alarmLevel: AlarmLevel;
}

function utcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** actual - plan, in whole days. */
function daysBetween(planISO: string, actualISO: string): number {
  return utcDays(actualISO) - utcDays(planISO);
}

/**
 * Daily Plan dates are treated as completion-target dates: Output for that
 * Config/Process must appear by that date. Delay/lead is measured against
 * the date Output was first observed in 공정 status; a process that hasn't
 * produced Output yet is judged relative to the most recent snapshot date
 * available (there is no other "today" inside this historical dataset).
 */
export function computeScheduleCells(
  dailyPlan: DailyPlanData,
  processStatus: ProcessStatusEntry[],
  thresholds: ScheduleThresholds = DEFAULT_SCHEDULE_THRESHOLDS
): ScheduleCell[] {
  // Earliest snapshot date where Output is non-null, per (config, process).
  const firstOutputDate = new Map<string, string>();
  for (const entry of processStatus) {
    for (const [process, v] of Object.entries(entry.processValues)) {
      if (v.output === null) continue;
      const key = `${entry.config}|${process}`;
      const existing = firstOutputDate.get(key);
      if (!existing || entry.snapshotDate < existing) firstOutputDate.set(key, entry.snapshotDate);
    }
  }

  const currentDate = processStatus.reduce(
    (max, e) => (e.snapshotDate > max ? e.snapshotDate : max),
    processStatus[0]?.snapshotDate ?? ""
  );

  const latestByConfig = latestEntryPerConfig(processStatus);

  const cells: ScheduleCell[] = [];
  for (const { config, process, planDate } of dailyPlan.schedule) {
    const actualDate = firstOutputDate.get(`${config}|${process}`) ?? null;

    let status: ScheduleStatus;
    let delayDays: number | null;

    if (actualDate) {
      delayDays = daysBetween(planDate, actualDate);
      status = delayDays === 0 ? "계획준수" : delayDays > 0 ? "지연" : "선행";
    } else if (currentDate > planDate) {
      delayDays = daysBetween(planDate, currentDate);
      status = "지연";
    } else {
      const inputPresent = latestByConfig.get(config)?.processValues[process]?.input !== null;
      status = inputPresent ? "진행중" : "예정";
      delayDays = null;
    }

    const alarmLevel: AlarmLevel =
      delayDays !== null && delayDays >= thresholds.riskDays
        ? "risk"
        : delayDays !== null && delayDays >= thresholds.warningDays
          ? "warning"
          : null;

    cells.push({ config, process, planDate, actualDate, status, delayDays, alarmLevel });
  }

  return cells;
}
