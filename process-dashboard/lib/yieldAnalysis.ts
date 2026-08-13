import type { ProcessStatusEntry } from "./types";

export type YieldStatus = "risk" | "warning" | "normal";

export interface Thresholds {
  riskAbsolutePct: number; // e.g. 90 => below 90% is risk
  warningAbsolutePct: number; // e.g. 97
  riskGapPp: number; // e.g. 10 percentage points below baseline => risk
  warningGapPp: number; // e.g. 5
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  riskAbsolutePct: 90,
  warningAbsolutePct: 97,
  riskGapPp: 10,
  warningGapPp: 5,
};

export interface YieldCell {
  config: string;
  process: string;
  input: number;
  output: number;
  yieldFrac: number; // 0..1
}

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Picks the most recent snapshot entry for each Config (by date, then AM<PM). */
export function latestEntryPerConfig(entries: ProcessStatusEntry[]): Map<string, ProcessStatusEntry> {
  const byConfig = new Map<string, ProcessStatusEntry>();
  for (const e of entries) {
    const cur = byConfig.get(e.config);
    if (!cur) {
      byConfig.set(e.config, e);
      continue;
    }
    const curRank = cur.snapshotDate + (cur.snapshotTime.includes("P.M") ? "-2" : "-1");
    const newRank = e.snapshotDate + (e.snapshotTime.includes("P.M") ? "-2" : "-1");
    if (newRank > curRank) byConfig.set(e.config, e);
  }
  return byConfig;
}

/** Output/Input yield per (Config, Process), using each Config's latest snapshot. */
export function computeYieldCells(entries: ProcessStatusEntry[]): YieldCell[] {
  const latest = latestEntryPerConfig(entries);
  const cells: YieldCell[] = [];
  for (const [config, entry] of latest) {
    for (const [process, v] of Object.entries(entry.processValues)) {
      if (v.input !== null && v.output !== null && v.input > 0) {
        cells.push({ config, process, input: v.input, output: v.output, yieldFrac: v.output / v.input });
      }
    }
  }
  return cells.sort((a, b) => processNum(a.process) - processNum(b.process) || a.config.localeCompare(b.config));
}

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Baseline yield for a process, as a fraction (0..1). Uses the user-entered
 * target yield (`overridePct`, 0..100) when present; otherwise the median
 * yield across all Configs for that process.
 */
export function computeBaseline(cells: YieldCell[], process: string, overridePct?: number): number {
  if (overridePct !== undefined) return overridePct / 100;
  const yields = cells.filter((c) => c.process === process).map((c) => c.yieldFrac);
  return median(yields);
}

export function classifyYield(yieldFrac: number, baselineFrac: number, thresholds: Thresholds): YieldStatus {
  const riskAbs = thresholds.riskAbsolutePct / 100;
  const warnAbs = thresholds.warningAbsolutePct / 100;
  const riskGap = thresholds.riskGapPp / 100;
  const warnGap = thresholds.warningGapPp / 100;

  if (yieldFrac < riskAbs || baselineFrac - yieldFrac >= riskGap) return "risk";
  if (yieldFrac < warnAbs || baselineFrac - yieldFrac >= warnGap) return "warning";
  return "normal";
}

export interface TargetYieldValidation {
  valid: boolean;
  value?: number; // 0..100, undefined means "cleared / use auto baseline"
  error?: string;
}

/** Validates a target-yield input: must be blank (=unset) or a number in [0,100]. */
export function validateTargetYieldInput(raw: string): TargetYieldValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: true, value: undefined };
  const n = Number(trimmed);
  if (isNaN(n)) return { valid: false, error: "숫자가 아닙니다" };
  if (n < 0 || n > 100) return { valid: false, error: "0~100 범위를 벗어났습니다" };
  return { valid: true, value: n };
}
