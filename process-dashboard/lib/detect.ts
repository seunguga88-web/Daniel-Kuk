import type { AOA, FileKind } from "./types";

function flatten(aoa: AOA, maxRows = 12): string[] {
  const out: string[] = [];
  for (let r = 0; r < Math.min(aoa.length, maxRows); r++) {
    const row = aoa[r] || [];
    for (const v of row) {
      if (typeof v === "string" && v.trim() !== "") out.push(v.trim());
    }
  }
  return out;
}

/**
 * Identifies which of the 5 known file kinds a workbook is, based on
 * header/label text found anywhere in the first several rows — never on
 * the file name, since file names can change.
 */
export function detectFileKind(aoa: AOA): FileKind | null {
  const texts = flatten(aoa, 12);
  const has = (s: string) => texts.includes(s);
  const hasPrefix = (p: string) => texts.some((t) => t.startsWith(p));

  if (has("WIP by Process")) return "processStatus";

  if (
    has("Config") &&
    has("Destination") &&
    has("Date") &&
    has("Qty") &&
    has("Label") &&
    has("Waiver Status")
  ) {
    return "shipmentTable";
  }

  const hasConfigColumns = hasPrefix("Config 1") && hasPrefix("Config 2");
  if (hasConfigColumns && (has("Material 1") || texts.some((t) => t.startsWith("Type")))) {
    return "configInfo";
  }
  if (hasConfigColumns && (hasPrefix("Destination") || has("Total Shipment"))) {
    return "shipmentPlan";
  }

  if (texts.some((t) => t.toLowerCase().startsWith("process"))) {
    return "dailyPlan";
  }

  return null;
}
