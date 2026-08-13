import type { ShipmentPlanRecord, ShipmentTableRecord } from "./types";

export interface ShipmentProgressDateEntry {
  date: string;
  qty: number;
  cumulativeQty: number;
  label: string;
  waiverStatus: string;
  cause: string;
}

export interface ShipmentProgressDestinationRow {
  destination: string;
  planQty: number;
  shippedQty: number;
  remainingQty: number;
  entries: ShipmentProgressDateEntry[];
}

export interface ShipmentProgressConfigRow {
  config: string;
  totalPlanQty: number;
  totalShippedQty: number;
  totalRemainingQty: number;
  destinations: ShipmentProgressDestinationRow[];
}

/**
 * Config x Destination별로 "계획 대비 지금까지 실제 출하 완료된 수량"과
 * "앞으로 더 보내야 할 수량"을 비교한다. `asOfDate`(기준 시점의 날짜, ISO
 * yyyy-mm-dd) 이하의 Config 출하 테이블 기록만 "완료된 출하"로 집계한다.
 */
export function computeShipmentProgress(
  shipmentPlan: ShipmentPlanRecord[],
  shipmentTable: ShipmentTableRecord[],
  asOfDate: string
): ShipmentProgressConfigRow[] {
  const recordsByConfigDest = new Map<string, ShipmentTableRecord[]>();
  for (const row of shipmentTable) {
    if (row.date > asOfDate) continue;
    const key = `${row.config}|${row.destination}`;
    const arr = recordsByConfigDest.get(key) ?? [];
    arr.push(row);
    recordsByConfigDest.set(key, arr);
  }

  return shipmentPlan
    .map((plan) => {
      const destinations: ShipmentProgressDestinationRow[] = plan.destinations.map((d) => {
        const records = [...(recordsByConfigDest.get(`${plan.config}|${d.destination}`) ?? [])].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );
        let cumulativeQty = 0;
        const entries: ShipmentProgressDateEntry[] = records.map((r) => {
          cumulativeQty += r.qty;
          return { date: r.date, qty: r.qty, cumulativeQty, label: r.label, waiverStatus: r.waiverStatus, cause: r.cause };
        });
        const shippedQty = cumulativeQty;
        return { destination: d.destination, planQty: d.qty, shippedQty, remainingQty: d.qty - shippedQty, entries };
      });

      const totalPlanQty = destinations.reduce((sum, d) => sum + d.planQty, 0);
      const totalShippedQty = destinations.reduce((sum, d) => sum + d.shippedQty, 0);
      return { config: plan.config, totalPlanQty, totalShippedQty, totalRemainingQty: totalPlanQty - totalShippedQty, destinations };
    })
    .sort((a, b) => a.config.localeCompare(b.config));
}

export interface ShipmentProgressFlatRow {
  config: string;
  destination: string;
  planQty: number;
  date: string | null;
  dayQty: number | null;
  cumulativeQty: number;
  remainingQty: number;
  sampleStatus: string | null;
  waiverStatus: string | null;
}

/** Config x Destination x 날짜별 출하 기록을 한 줄씩 펼친다(엑셀 필터 표처럼 화면에 한 표로 보여주기 위함). */
export function flattenShipmentProgress(rows: ShipmentProgressConfigRow[]): ShipmentProgressFlatRow[] {
  const flat: ShipmentProgressFlatRow[] = [];
  for (const c of rows) {
    for (const d of c.destinations) {
      if (d.entries.length === 0) {
        flat.push({
          config: c.config,
          destination: d.destination,
          planQty: d.planQty,
          date: null,
          dayQty: null,
          cumulativeQty: 0,
          remainingQty: d.remainingQty,
          sampleStatus: null,
          waiverStatus: null,
        });
        continue;
      }
      for (const e of d.entries) {
        flat.push({
          config: c.config,
          destination: d.destination,
          planQty: d.planQty,
          date: e.date,
          dayQty: e.qty,
          cumulativeQty: e.cumulativeQty,
          remainingQty: d.planQty - e.cumulativeQty,
          sampleStatus: e.label,
          waiverStatus: e.waiverStatus,
        });
      }
    }
  }
  return flat;
}

export type ShipmentProgressRowStatus = "complete" | "problem" | "normal";

/**
 * 화면에서 강조 표시할 행 상태를 판정한다.
 * - problem: 계획보다 더 많이 나간 초과 출하(잔여 수량 음수), 또는 승인되지 않은 Waiver NG 출하
 * - complete: 잔여 수량이 0 (계획 수량을 채움)
 * - normal: 그 외 (아직 출하 전이거나 진행 중)
 * problem 조건이 complete보다 우선한다 — 수량은 채워졌어도 미승인 Waiver가 있으면 여전히 확인이 필요하기 때문.
 */
export function classifyShipmentProgressRow(row: ShipmentProgressFlatRow): ShipmentProgressRowStatus {
  if (row.remainingQty < 0) return "problem";
  if (row.sampleStatus === "Waiver NG" && row.waiverStatus !== "Approved") return "problem";
  if (row.remainingQty === 0) return "complete";
  return "normal";
}
