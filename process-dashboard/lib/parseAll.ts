import type { ParsedDataset } from "./types";
import { readFirstSheetAOA } from "./excelIO";
import { detectFileKind } from "./detect";
import { parseConfigInfo } from "./parsers/configInfo";
import { parseShipmentPlan } from "./parsers/shipmentPlan";
import { parseDailyPlan } from "./parsers/dailyPlan";
import { parseProcessStatus } from "./parsers/processStatus";
import { parseShipmentTable } from "./parsers/shipmentTable";

export interface InputFile {
  fileName: string;
  data: ArrayBuffer | Uint8Array;
}

export interface ParseAllResult {
  dataset: ParsedDataset;
  unrecognizedFiles: string[];
}

export function parseAllFiles(inputs: InputFile[]): ParseAllResult {
  const dataset: ParsedDataset = {
    configInfo: [],
    shipmentPlan: [],
    dailyPlan: { schedule: [], shipments: [] },
    processStatus: [],
    shipmentTable: [],
    files: [],
  };
  const unrecognizedFiles: string[] = [];

  for (const input of inputs) {
    const aoa = readFirstSheetAOA(input.data);
    const kind = detectFileKind(aoa);
    if (!kind) {
      unrecognizedFiles.push(input.fileName);
      continue;
    }
    dataset.files.push({ fileName: input.fileName, kind });

    switch (kind) {
      case "configInfo":
        dataset.configInfo = parseConfigInfo(aoa);
        break;
      case "shipmentPlan":
        dataset.shipmentPlan = parseShipmentPlan(aoa);
        break;
      case "dailyPlan":
        dataset.dailyPlan = parseDailyPlan(aoa);
        break;
      case "processStatus":
        dataset.processStatus = parseProcessStatus(aoa);
        break;
      case "shipmentTable":
        dataset.shipmentTable = parseShipmentTable(aoa);
        break;
    }
  }

  return { dataset, unrecognizedFiles };
}
