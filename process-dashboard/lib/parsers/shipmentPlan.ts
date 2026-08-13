import type { AOA, ShipmentPlanRecord } from "../types";
import { parsePivotTable } from "../parsePivotTable";
import { toNumber } from "../excelIO";

export function parseShipmentPlan(aoa: AOA): ShipmentPlanRecord[] {
  const table = parsePivotTable(aoa);

  return table.configs.map(({ name, col }) => {
    let totalShipment = 0;
    const destinations: { destination: string; qty: number }[] = [];

    for (const row of table.rows) {
      const v = row.values.get(col);
      if (row.label === "Total Shipment") {
        totalShipment = toNumber(v) ?? 0;
      } else if (row.label.startsWith("Destination")) {
        destinations.push({ destination: row.label, qty: toNumber(v) ?? 0 });
      }
    }

    return { config: name, totalShipment, destinations };
  });
}
