import type { DailyPlanData, ProcessStatusEntry } from "./types";
import type { ScheduleThresholds } from "./scheduleAnalysis";
import { DEFAULT_SCHEDULE_THRESHOLDS } from "./scheduleAnalysis";

export type ProcessState = "in_progress" | "not_started" | "completed";
export type CurrentStatus = "지연" | "선행" | "계획준수" | "완료";

export interface Snapshot {
  date: string;
  time: string;
}

export interface CurrentStatusRow {
  line: string;
  config: string;
  processState: ProcessState;
  currentProcess: string | null; // the process currently being worked / waited on
  planDate: string | null;
  delayDays: number | null; // snapshot date - plan date
  status: CurrentStatus;
  alarmLevel: "risk" | "warning" | null;
}

export type TrafficLight = "green" | "yellow" | "red" | null;

/**
 * Fixed-rule traffic light, independent of the adjustable warning/risk day
 * thresholds: on-time or ahead of schedule (or already 완료) is green,
 * exactly 1 day late is yellow, 2+ days late is red. Not-started rows have
 * no light (they're left blank, same as the rest of their row).
 */
export function trafficLight(row: CurrentStatusRow): TrafficLight {
  if (row.processState === "not_started") return null;
  if (row.processState === "completed") return "green";
  if (row.delayDays === null) return null;
  if (row.delayDays <= 0) return "green";
  if (row.delayDays === 1) return "yellow";
  return "red";
}

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function utcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** All distinct (date, time) snapshots present in 공정 status, chronologically sorted. */
export function listSnapshots(processStatus: ProcessStatusEntry[]): Snapshot[] {
  const seen = new Map<string, Snapshot>();
  for (const e of processStatus) {
    const key = `${e.snapshotDate}|${e.snapshotTime}`;
    if (!seen.has(key)) seen.set(key, { date: e.snapshotDate, time: e.snapshotTime });
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const aPM = a.time.includes("P.M") ? 1 : 0;
    const bPM = b.time.includes("P.M") ? 1 : 0;
    return aPM - bPM;
  });
}

/**
 * For a single snapshot, finds each Config's current process — the lowest
 * numbered process that has Input but no Output yet (i.e. the process it is
 * currently sitting at / waiting on) — and how many days that process's
 * actual position differs from its Daily Plan target date.
 */
export function computeCurrentStatus(
  dailyPlan: DailyPlanData,
  processStatus: ProcessStatusEntry[],
  snapshot: Snapshot,
  thresholds: ScheduleThresholds = DEFAULT_SCHEDULE_THRESHOLDS
): CurrentStatusRow[] {
  const entries = processStatus.filter((e) => e.snapshotDate === snapshot.date && e.snapshotTime === snapshot.time);

  const planDateByKey = new Map<string, string>();
  for (const s of dailyPlan.schedule) planDateByKey.set(`${s.config}|${s.process}`, s.planDate);

  const rows: CurrentStatusRow[] = [];

  for (const entry of entries) {
    const processesInOrder = Object.keys(entry.processValues).sort((a, b) => processNum(a) - processNum(b));

    let processState: ProcessState = "not_started";
    let currentProcess: string | null = null;
    let lastCompleted: string | null = null;

    for (const p of processesInOrder) {
      const v = entry.processValues[p];
      if (v.input === null) break; // this and every later process haven't started
      if (v.output === null) {
        currentProcess = p;
        processState = "in_progress";
        break;
      }
      lastCompleted = p;
    }

    if (!currentProcess && processState !== "in_progress") {
      if (lastCompleted) {
        processState = "completed";
        currentProcess = lastCompleted;
      } else {
        processState = "not_started";
        currentProcess = null;
      }
    }

    if (processState === "completed") {
      rows.push({
        line: entry.line,
        config: entry.config,
        processState,
        currentProcess,
        planDate: null,
        delayDays: null,
        status: "완료",
        alarmLevel: null,
      });
      continue;
    }

    if (processState === "not_started") {
      rows.push({
        line: entry.line,
        config: entry.config,
        processState,
        currentProcess: null,
        planDate: null,
        delayDays: null,
        status: "계획준수",
        alarmLevel: null,
      });
      continue;
    }

    const planDate = currentProcess ? (planDateByKey.get(`${entry.config}|${currentProcess}`) ?? null) : null;
    const delayDays = planDate ? utcDays(snapshot.date) - utcDays(planDate) : null;
    const status: CurrentStatus = delayDays === null ? "계획준수" : delayDays > 0 ? "지연" : delayDays < 0 ? "선행" : "계획준수";
    const alarmLevel =
      delayDays !== null && delayDays >= thresholds.riskDays
        ? "risk"
        : delayDays !== null && delayDays >= thresholds.warningDays
          ? "warning"
          : null;

    rows.push({ line: entry.line, config: entry.config, processState, currentProcess, planDate, delayDays, status, alarmLevel });
  }

  return rows.sort((a, b) => a.line.localeCompare(b.line) || a.config.localeCompare(b.config));
}
