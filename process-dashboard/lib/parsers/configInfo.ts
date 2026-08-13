import type { AOA, ConfigInfoRecord } from "../types";
import { parsePivotTable } from "../parsePivotTable";
import { toNumber } from "../excelIO";

export function parseConfigInfo(aoa: AOA): ConfigInfoRecord[] {
  const table = parsePivotTable(aoa);

  return table.configs.map(({ name, col }) => {
    let inputQty = 0;
    let shipmentQty = 0;
    const materials: { material: string; type: string }[] = [];

    for (const row of table.rows) {
      const v = row.values.get(col);
      if (row.label === "Input Qty") {
        inputQty = toNumber(v) ?? 0;
      } else if (row.label === "Shipment Qty") {
        shipmentQty = toNumber(v) ?? 0;
      } else if (row.label.startsWith("Type") && row.group && String(v).trim() !== "") {
        materials.push({ material: row.group, type: row.label });
      }
    }

    return { config: name, inputQty, shipmentQty, materials };
  });
}
