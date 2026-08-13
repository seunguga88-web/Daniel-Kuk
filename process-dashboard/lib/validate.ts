import type { ParsedDataset, ValidationError } from "./types";

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

/** Runs the 6 cross-file consistency rules from PLAN.md ⑤ against a parsed dataset. */
export function validateDataset(data: ParsedDataset): ValidationError[] {
  const errors: ValidationError[] = [];

  // Rule 1: Config list matches across files.
  const configInfoSet = new Set(data.configInfo.map((c) => c.config));
  const shipmentPlanSet = new Set(data.shipmentPlan.map((c) => c.config));
  const shipmentTableSet = new Set(data.shipmentTable.map((c) => c.config));
  const processStatusSet = new Set(data.processStatus.map((c) => c.config));

  const sets: [string, Set<string>][] = [
    ["Config별 출하 Plan", shipmentPlanSet],
    ["Config 출하 테이블", shipmentTableSet],
    ["공정 status", processStatusSet],
  ];
  for (const [fileLabel, set] of sets) {
    for (const c of configInfoSet) {
      if (!set.has(c)) {
        errors.push({
          rule: "Config 일치",
          message: `Config 정보에는 있는 ${c}가 ${fileLabel}에 없음`,
          location: fileLabel,
        });
      }
    }
    for (const c of set) {
      if (!configInfoSet.has(c)) {
        errors.push({
          rule: "Config 일치",
          message: `${fileLabel}에만 있는 Config: ${c} (Config 정보에 없음)`,
          location: fileLabel,
        });
      }
    }
  }

  // Rule 2: Shipment Qty = Total Shipment = OK Ship + Waiver NG
  const shipmentTableQtyByConfig = new Map<string, number>();
  for (const row of data.shipmentTable) {
    shipmentTableQtyByConfig.set(row.config, (shipmentTableQtyByConfig.get(row.config) ?? 0) + row.qty);
  }
  const shipmentPlanByConfig = new Map(data.shipmentPlan.map((s) => [s.config, s.totalShipment]));
  for (const info of data.configInfo) {
    const totalShipment = shipmentPlanByConfig.get(info.config);
    const okPlusWaiver = shipmentTableQtyByConfig.get(info.config);
    if (totalShipment !== undefined && info.shipmentQty !== totalShipment) {
      errors.push({
        rule: "Shipment Qty = Total Shipment = OK Ship + Waiver NG",
        message: `${info.config}: Config 정보 Shipment Qty(${info.shipmentQty}) != Config별 출하 Plan Total Shipment(${totalShipment})`,
        location: `Config ${info.config}`,
      });
    }
    if (okPlusWaiver !== undefined && info.shipmentQty !== okPlusWaiver) {
      errors.push({
        rule: "Shipment Qty = Total Shipment = OK Ship + Waiver NG",
        message: `${info.config}: Config 정보 Shipment Qty(${info.shipmentQty}) != Config 출하 테이블 OK+Waiver 합계(${okPlusWaiver})`,
        location: `Config ${info.config}`,
      });
    }
  }

  // Rule 3: Destination 합계 = Total Shipment
  for (const plan of data.shipmentPlan) {
    const sum = plan.destinations.reduce((a, d) => a + d.qty, 0);
    if (sum !== plan.totalShipment) {
      errors.push({
        rule: "Destination 합계 = Total Shipment",
        message: `${plan.config}: Destination 합계(${sum}) != Total Shipment(${plan.totalShipment})`,
        location: `Config ${plan.config}`,
      });
    }
  }

  // Rule 4 & 5: Input = Output + NG, and 이전 Process Output = 다음 Process Input
  for (const entry of data.processStatus) {
    const names = Object.keys(entry.processValues).sort((a, b) => processNum(a) - processNum(b));
    for (const name of names) {
      const v = entry.processValues[name];
      if (v.input !== null && v.output !== null && v.ng !== null) {
        if (v.input !== v.output + v.ng) {
          errors.push({
            rule: "Input = Output + NG",
            message: `${entry.config} ${name} (${entry.snapshotDate} ${entry.snapshotTime}): Input(${v.input}) != Output(${v.output}) + NG(${v.ng})`,
            location: `${entry.config} / ${name} / ${entry.snapshotDate} ${entry.snapshotTime}`,
          });
        }
      }
    }
    for (let i = 0; i < names.length - 1; i++) {
      const cur = entry.processValues[names[i]];
      const next = entry.processValues[names[i + 1]];
      if (cur.output !== null && next.input !== null && cur.output !== next.input) {
        errors.push({
          rule: "이전 Process Output = 다음 Process Input",
          message: `${entry.config} (${entry.snapshotDate} ${entry.snapshotTime}): ${names[i]} Output(${cur.output}) != ${names[i + 1]} Input(${next.input})`,
          location: `${entry.config} / ${names[i]}→${names[i + 1]} / ${entry.snapshotDate} ${entry.snapshotTime}`,
        });
      }
    }
  }

  // Rule 6: Waiver NG 출하 행은 Waiver Approved 상태인가
  for (const row of data.shipmentTable) {
    if (row.label === "Waiver NG" && row.waiverStatus !== "Approved") {
      errors.push({
        rule: "Waiver NG는 Approved 상태여야 함",
        message: `${row.config} / ${row.destination} (${row.date}): Waiver Status가 "${row.waiverStatus}"임`,
        location: `${row.config} / ${row.destination} / ${row.date}`,
      });
    }
  }

  return errors;
}
