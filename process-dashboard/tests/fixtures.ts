import { readFileSync } from "fs";
import path from "path";
import type { InputFile } from "../lib/parseAll";

const DATA_DIR = path.resolve(__dirname, "..", "..");

const FILE_NAMES = [
  "Kuk_가상데이터_Config 정보.xlsx",
  "Kuk_가상데이터_Config 별 출하 plan.xlsx",
  "Kuk_가상데이터_Daily plan.xlsx",
  "Kuk_가상데이터_공정 status.xlsx",
  "Kuk_가상데이터_Config 출하 테이블.xlsx",
];

export function loadVirtualDataInputs(): InputFile[] {
  return FILE_NAMES.map((fileName) => ({
    fileName,
    data: readFileSync(path.join(DATA_DIR, fileName)),
  }));
}
