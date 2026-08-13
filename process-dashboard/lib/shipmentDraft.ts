import type { DailyPlanData, ProcessStatusEntry, ShipmentPlanRecord } from "./types";
import { computeExpectedFinalGood } from "./shipmentRisk";
import type { YieldCell } from "./yieldAnalysis";
import type { Snapshot } from "./currentStatus";

export interface DestinationAllocation {
  destination: string;
  planQty: number;
  okQty: number;
  waiverQty: number;
  totalQty: number;
}

export interface ShipmentDraftRow {
  config: string;
  shipDate: string; // D-day (referenceDate + 1)
  currentGoodQty: number;
  okAvailable: number; // min(expectedFinalGood, totalShipment)
  waiverNeeded: number; // max(0, totalShipment - expectedFinalGood)
  totalShipment: number;
  allocations: DestinationAllocation[];
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Allocates `amount` across destinations' remaining gaps, in priority order, mutating `gaps` downward. */
function allocateByPriority(amount: number, gaps: Map<string, number>, priorityOrder: string[]): Map<string, number> {
  const result = new Map<string, number>();
  let remaining = amount;
  for (const dest of priorityOrder) {
    const gap = gaps.get(dest) ?? 0;
    const take = Math.min(remaining, gap);
    result.set(dest, take);
    gaps.set(dest, gap - take);
    remaining -= take;
  }
  return result;
}

/**
 * D-1 출하 초안: referenceSnapshot 날짜의 다음 날 출하 예정인 Config들에 대해,
 * Destination별 OK/Waiver 배정 초안을 만든다. 원본 문서는 "출하일 전날 오전
 * 9시" 실행을 권장하지만, 그 시점엔 아직 진행 중인 마지막 Process가 있을 수도
 * 있어(예상치가 실제 최종값과 다를 수 있음) 어느 스냅샷을 기준으로 볼지 직접
 * 고를 수 있게 date+time을 그대로 받는다.
 */
export function computeShipmentDraft(
  referenceSnapshot: Snapshot,
  dailyPlan: DailyPlanData,
  shipmentPlan: ShipmentPlanRecord[],
  processStatus: ProcessStatusEntry[],
  yieldCells: YieldCell[],
  targetYields: Record<string, number>,
  destinationPriority: string[]
): ShipmentDraftRow[] {
  const targetShipDate = addOneDay(referenceSnapshot.date);
  const shippingConfigs = new Set(
    dailyPlan.shipments.filter((s) => s.shipDate === targetShipDate).map((s) => s.config)
  );

  const shipmentPlanByConfig = new Map(shipmentPlan.map((s) => [s.config, s]));

  const rows: ShipmentDraftRow[] = [];
  for (const config of shippingConfigs) {
    const entry = processStatus.find(
      (e) => e.config === config && e.snapshotDate === referenceSnapshot.date && e.snapshotTime === referenceSnapshot.time
    );
    const plan = shipmentPlanByConfig.get(config);
    if (!entry || !plan) continue;

    const currentGoodQty = entry.goodQty ?? 0;
    const expectedFinalGood = computeExpectedFinalGood(entry, yieldCells, targetYields);
    const totalShipment = plan.totalShipment;
    const okAvailable = Math.min(expectedFinalGood, totalShipment);
    const waiverNeeded = Math.max(0, totalShipment - expectedFinalGood);

    const gaps = new Map(plan.destinations.map((d) => [d.destination, d.qty]));
    const okAlloc = allocateByPriority(okAvailable, gaps, destinationPriority);
    const waiverAlloc = allocateByPriority(waiverNeeded, gaps, destinationPriority);

    const allocations: DestinationAllocation[] = plan.destinations.map((d) => {
      const okQty = okAlloc.get(d.destination) ?? 0;
      const waiverQty = waiverAlloc.get(d.destination) ?? 0;
      return { destination: d.destination, planQty: d.qty, okQty, waiverQty, totalQty: okQty + waiverQty };
    });

    rows.push({ config, shipDate: targetShipDate, currentGoodQty, okAvailable, waiverNeeded, totalShipment, allocations });
  }

  return rows.sort((a, b) => a.config.localeCompare(b.config));
}
