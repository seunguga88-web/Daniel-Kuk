import type { ProcessStatusEntry, ShipmentPlanRecord, ShipmentTableRecord } from "./types";
import { latestEntryPerConfig, computeBaseline, type YieldCell } from "./yieldAnalysis";

export type RiskStatus = "OK" | "Risk" | "Waiver Dependent" | "Shortage";

export interface ShipmentRiskRow {
  config: string;
  currentGoodQty: number;
  expectedFinalGood: number;
  totalShipment: number;
  approvedWaiverQty: number;
  shortfall: number; // max(0, totalShipment - expectedFinalGood)
  status: RiskStatus;
}

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * 예상 최종 양품 = 현재 양품 × 남은 Process들의 기준 수율.
 * "남은 Process"는 최신 스냅샷 기준 아직 Output이 없는 Process들이다
 * (진행 중인 Process 포함, 이미 완료된 Process는 이미 currentGoodQty에 반영됨).
 */
function computeExpectedFinalGood(entry: ProcessStatusEntry, yieldCells: YieldCell[], targetYields: Record<string, number>): number {
  const currentGoodQty = entry.goodQty ?? 0;
  const remaining = Object.keys(entry.processValues)
    .filter((p) => entry.processValues[p].output === null)
    .sort((a, b) => processNum(a) - processNum(b));

  let expected = currentGoodQty;
  for (const p of remaining) {
    expected *= computeBaseline(yieldCells, p, targetYields[p]);
  }
  return expected;
}

/**
 * 출하 부족 Risk 판정.
 * - OK: 예상 최종 양품이 출하 계획(Total Shipment) 이상
 * - Risk: 부족하지만 아직 승인된 Waiver NG가 없음 (조사 필요)
 * - Waiver Dependent: 부족하지만 승인된 Waiver NG를 더하면 충족
 * - Shortage: 승인된 Waiver NG를 더해도 부족
 */
export function computeShipmentRisk(
  processStatus: ProcessStatusEntry[],
  shipmentPlan: ShipmentPlanRecord[],
  shipmentTable: ShipmentTableRecord[],
  yieldCells: YieldCell[],
  targetYields: Record<string, number> = {}
): ShipmentRiskRow[] {
  const latest = latestEntryPerConfig(processStatus);
  const totalShipmentByConfig = new Map(shipmentPlan.map((s) => [s.config, s.totalShipment]));

  const approvedWaiverByConfig = new Map<string, number>();
  for (const row of shipmentTable) {
    if (row.label === "Waiver NG" && row.waiverStatus === "Approved") {
      approvedWaiverByConfig.set(row.config, (approvedWaiverByConfig.get(row.config) ?? 0) + row.qty);
    }
  }

  const rows: ShipmentRiskRow[] = [];
  for (const [config, entry] of latest) {
    const totalShipment = totalShipmentByConfig.get(config) ?? 0;
    const currentGoodQty = entry.goodQty ?? 0;
    const expectedFinalGood = computeExpectedFinalGood(entry, yieldCells, targetYields);
    const approvedWaiverQty = approvedWaiverByConfig.get(config) ?? 0;
    const shortfall = Math.max(0, totalShipment - expectedFinalGood);

    let status: RiskStatus;
    if (shortfall === 0) {
      status = "OK";
    } else if (approvedWaiverQty === 0) {
      status = "Risk";
    } else if (expectedFinalGood + approvedWaiverQty >= totalShipment) {
      status = "Waiver Dependent";
    } else {
      status = "Shortage";
    }

    rows.push({ config, currentGoodQty, expectedFinalGood, totalShipment, approvedWaiverQty, shortfall, status });
  }

  return rows.sort((a, b) => a.config.localeCompare(b.config));
}
