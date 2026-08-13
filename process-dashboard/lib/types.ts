export type FileKind =
  | "configInfo"
  | "shipmentPlan"
  | "dailyPlan"
  | "processStatus"
  | "shipmentTable";

export type AOA = unknown[][];

export interface ConfigInfoRecord {
  config: string;
  inputQty: number;
  shipmentQty: number;
  materials: { material: string; type: string }[];
}

export interface ShipmentPlanRecord {
  config: string;
  totalShipment: number;
  destinations: { destination: string; qty: number }[];
}

export interface DailyPlanScheduleEntry {
  line: string;
  process: string;
  config: string;
  planDate: string; // ISO yyyy-mm-dd
}

export interface DailyPlanShipmentEntry {
  config: string;
  shipDate: string; // ISO yyyy-mm-dd
}

export interface DailyPlanData {
  schedule: DailyPlanScheduleEntry[];
  shipments: DailyPlanShipmentEntry[];
}

export interface ProcessStatusEntry {
  snapshotDate: string; // ISO yyyy-mm-dd
  snapshotTime: string; // raw label, e.g. "9:00 A.M"
  line: string;
  config: string;
  processValues: Record<string, { input: number | null; output: number | null; ng: number | null }>;
  goodQty: number | null;
  defectQty: number | null;
  majorDefect: string | number | null;
}

export interface ShipmentTableRecord {
  config: string;
  destination: string;
  date: string; // ISO yyyy-mm-dd
  qty: number;
  label: string; // "OK" | "Waiver NG" | ...
  waiverStatus: string;
  cause: string;
}

export interface ParsedFile {
  fileName: string;
  kind: FileKind;
}

export interface ParsedDataset {
  configInfo: ConfigInfoRecord[];
  shipmentPlan: ShipmentPlanRecord[];
  dailyPlan: DailyPlanData;
  processStatus: ProcessStatusEntry[];
  shipmentTable: ShipmentTableRecord[];
  files: ParsedFile[];
}

export interface ValidationError {
  rule: string;
  message: string;
  location: string;
}
