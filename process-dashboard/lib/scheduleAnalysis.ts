export interface ScheduleThresholds {
  warningDays: number; // e.g. 2
  riskDays: number; // e.g. 3
}

export const DEFAULT_SCHEDULE_THRESHOLDS: ScheduleThresholds = {
  warningDays: 2,
  riskDays: 3,
};
