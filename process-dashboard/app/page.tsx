"use client";

import { useState, type CSSProperties } from "react";
import { parseAllFiles } from "@/lib/parseAll";
import { validateDataset } from "@/lib/validate";
import type { FileKind, ParsedFile, ValidationError } from "@/lib/types";

const KIND_LABEL: Record<FileKind, string> = {
  configInfo: "Config 정보",
  shipmentPlan: "Config별 출하 Plan",
  dailyPlan: "Daily Plan",
  processStatus: "공정 status",
  shipmentTable: "Config 출하 테이블",
};

interface Result {
  files: ParsedFile[];
  unrecognizedFiles: string[];
  errors: ValidationError[];
  counts: { configInfo: number; shipmentPlan: number; scheduleRows: number; processStatus: number; shipmentTable: number };
}

export default function Home() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setLoading(true);
    try {
      const inputs = await Promise.all(
        Array.from(fileList).map(async (f) => ({
          fileName: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        }))
      );
      const { dataset, unrecognizedFiles } = parseAllFiles(inputs);
      const errors = validateDataset(dataset);
      setResult({
        files: dataset.files,
        unrecognizedFiles,
        errors,
        counts: {
          configInfo: dataset.configInfo.length,
          shipmentPlan: dataset.shipmentPlan.length,
          scheduleRows: dataset.dailyPlan.schedule.length,
          processStatus: dataset.processStatus.length,
          shipmentTable: dataset.shipmentTable.length,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>공정·출하 검증 대시보드 — Upload Center</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        5종 Excel 파일을 한꺼번에 선택해 업로드하세요. 파일명이 아니라 헤더·구조로 종류를 자동 판별합니다.
      </p>

      <input
        type="file"
        multiple
        accept=".xlsx"
        onChange={(e) => handleFiles(e.target.files)}
        style={{ marginBottom: "1.5rem" }}
      />

      {loading && <p>파싱 중...</p>}

      {result && (
        <section>
          <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>파일 인식 결과</h2>
          <ul>
            {result.files.map((f) => (
              <li key={f.fileName}>
                {f.fileName} → <strong>{KIND_LABEL[f.kind]}</strong>
              </li>
            ))}
          </ul>
          {result.unrecognizedFiles.length > 0 && (
            <p style={{ color: "#b91c1c" }}>
              인식 실패: {result.unrecognizedFiles.join(", ")} — 5종 파일 형식과 다릅니다.
            </p>
          )}

          <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>파싱된 데이터 건수</h2>
          <ul>
            <li>Config 정보: {result.counts.configInfo}개 Config</li>
            <li>Config별 출하 Plan: {result.counts.shipmentPlan}개 Config</li>
            <li>Daily Plan 일정 행: {result.counts.scheduleRows}건</li>
            <li>공정 status 스냅샷×Config 조합: {result.counts.processStatus}건</li>
            <li>Config 출하 테이블: {result.counts.shipmentTable}건</li>
          </ul>

          <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>
            정합성 검증 결과 {result.errors.length === 0 ? "— 이상 없음" : `— ${result.errors.length}건 위반`}
          </h2>
          {result.errors.length === 0 ? (
            <p style={{ color: "#15803d" }}>6개 검증 규칙 모두 통과했습니다.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>규칙</th>
                  <th style={cellStyle}>위치</th>
                  <th style={cellStyle}>내용</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i}>
                    <td style={cellStyle}>{e.rule}</td>
                    <td style={cellStyle}>{e.location}</td>
                    <td style={cellStyle}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

const cellStyle: CSSProperties = {
  border: "1px solid #ddd",
  padding: "0.4rem 0.6rem",
  textAlign: "left",
  verticalAlign: "top",
};
