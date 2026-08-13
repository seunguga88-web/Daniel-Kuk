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
