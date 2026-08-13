"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { parseAllFiles } from "@/lib/parseAll";
import { validateDataset } from "@/lib/validate";
import {
  computeYieldCells,
  computeBaseline,
  classifyYield,
  validateTargetYieldInput,
  DEFAULT_THRESHOLDS,
  type Thresholds,
  type YieldStatus,
} from "@/lib/yieldAnalysis";
import { DEFAULT_SCHEDULE_THRESHOLDS, type ScheduleThresholds } from "@/lib/scheduleAnalysis";
import { listSnapshots, computeCurrentStatus, type Snapshot } from "@/lib/currentStatus";
import type { FileKind, ParsedDataset } from "@/lib/types";

const KIND_LABEL: Record<FileKind, string> = {
  configInfo: "Config 정보",
  shipmentPlan: "Config별 출하 Plan",
  dailyPlan: "Daily Plan",
  processStatus: "공정 status",
  shipmentTable: "Config 출하 테이블",
};

const STATUS_COLOR: Record<YieldStatus, string> = {
  risk: "#fecaca",
  warning: "#fef08a",
  normal: "transparent",
};

const STATUS_LABEL: Record<YieldStatus, string> = {
  risk: "위험",
  warning: "주의",
  normal: "정상",
};

function processNum(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export default function Home() {
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [unrecognizedFiles, setUnrecognizedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [targetYieldInputs, setTargetYieldInputs] = useState<Record<string, string>>({});
  const [targetYieldErrors, setTargetYieldErrors] = useState<Record<string, string>>({});
  const [targetYields, setTargetYields] = useState<Record<string, number>>({});

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
      const parsed = parseAllFiles(inputs);
      setDataset(parsed.dataset);
      setUnrecognizedFiles(parsed.unrecognizedFiles);
    } finally {
      setLoading(false);
    }
  }

  const errors = useMemo(() => (dataset ? validateDataset(dataset) : []), [dataset]);

  const yieldCells = useMemo(() => (dataset ? computeYieldCells(dataset.processStatus) : []), [dataset]);

  const processes = useMemo(() => {
    const set = new Set(yieldCells.map((c) => c.process));
    return Array.from(set).sort((a, b) => processNum(a) - processNum(b));
  }, [yieldCells]);

  const configs = useMemo(() => {
    const set = new Set(yieldCells.map((c) => c.config));
    return Array.from(set).sort();
  }, [yieldCells]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, (typeof yieldCells)[number]>();
    for (const c of yieldCells) m.set(`${c.config}|${c.process}`, c);
    return m;
  }, [yieldCells]);

  const baselineByProcess = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of processes) m.set(p, computeBaseline(yieldCells, p, targetYields[p]));
    return m;
  }, [processes, yieldCells, targetYields]);

  function handleTargetYieldChange(process: string, raw: string) {
    setTargetYieldInputs((prev) => ({ ...prev, [process]: raw }));
    const result = validateTargetYieldInput(raw);
    if (!result.valid) {
      setTargetYieldErrors((prev) => ({ ...prev, [process]: result.error! }));
      return; // reject: don't touch the applied targetYields
    }
    setTargetYieldErrors((prev) => {
      const next = { ...prev };
      delete next[process];
      return next;
    });
    setTargetYields((prev) => {
      const next = { ...prev };
      if (result.value === undefined) delete next[process];
      else next[process] = result.value;
      return next;
    });
  }

  function handleThresholdChange(key: keyof Thresholds, raw: string) {
    const n = Number(raw);
    if (raw.trim() === "" || isNaN(n)) return;
    setThresholds((prev) => ({ ...prev, [key]: n }));
  }

  const [scheduleThresholds, setScheduleThresholds] = useState<ScheduleThresholds>(DEFAULT_SCHEDULE_THRESHOLDS);

  function handleScheduleThresholdChange(key: keyof ScheduleThresholds, raw: string) {
    const n = Number(raw);
    if (raw.trim() === "" || isNaN(n)) return;
    setScheduleThresholds((prev) => ({ ...prev, [key]: n }));
  }

  const snapshots = useMemo(() => (dataset ? listSnapshots(dataset.processStatus) : []), [dataset]);
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState<string | null>(null);

  const selectedSnapshot: Snapshot | null = useMemo(() => {
    if (snapshots.length === 0) return null;
    if (selectedSnapshotKey) {
      const [date, time] = selectedSnapshotKey.split("|");
      const found = snapshots.find((s) => s.date === date && s.time === time);
      if (found) return found;
    }
    return snapshots[snapshots.length - 1]; // default: latest
  }, [snapshots, selectedSnapshotKey]);

  const currentStatusRows = useMemo(
    () =>
      dataset && selectedSnapshot
        ? computeCurrentStatus(dataset.dailyPlan, dataset.processStatus, selectedSnapshot, scheduleThresholds)
        : [],
    [dataset, selectedSnapshot, scheduleThresholds]
  );

  const currentStatusByLine = useMemo(() => {
    const m = new Map<string, typeof currentStatusRows>();
    for (const row of currentStatusRows) {
      const arr = m.get(row.line) ?? [];
      arr.push(row);
      m.set(row.line, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [currentStatusRows]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>공정·출하 검증 대시보드</h1>
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

      {dataset && (
        <>
          <section>
            <h2 style={sectionTitle}>Upload Center — 파일 인식 결과</h2>
            <ul>
              {dataset.files.map((f) => (
                <li key={f.fileName}>
                  {f.fileName} → <strong>{KIND_LABEL[f.kind]}</strong>
                </li>
              ))}
            </ul>
            {unrecognizedFiles.length > 0 && (
              <p style={{ color: "#b91c1c" }}>인식 실패: {unrecognizedFiles.join(", ")}</p>
            )}

            <h3 style={{ fontSize: "1rem", marginTop: "1rem" }}>
              정합성 검증 결과 {errors.length === 0 ? "— 이상 없음" : `— ${errors.length}건 위반`}
            </h3>
            {errors.length === 0 ? (
              <p style={{ color: "#15803d" }}>6개 검증 규칙 모두 통과했습니다.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={cellStyle}>규칙</th>
                    <th style={cellStyle}>위치</th>
                    <th style={cellStyle}>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
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

          <section>
            <h2 style={sectionTitle}>Yield / NG Analysis</h2>

            <h3 style={{ fontSize: "1rem" }}>위험·주의 임계값 (화면에서 조정 가능)</h3>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <label>
                위험(절대, %)
                <input
                  type="number"
                  defaultValue={thresholds.riskAbsolutePct}
                  onChange={(e) => handleThresholdChange("riskAbsolutePct", e.target.value)}
                  style={numInputStyle}
                />
              </label>
              <label>
                주의(절대, %)
                <input
                  type="number"
                  defaultValue={thresholds.warningAbsolutePct}
                  onChange={(e) => handleThresholdChange("warningAbsolutePct", e.target.value)}
                  style={numInputStyle}
                />
              </label>
              <label>
                위험(기준수율 대비, %p)
                <input
                  type="number"
                  defaultValue={thresholds.riskGapPp}
                  onChange={(e) => handleThresholdChange("riskGapPp", e.target.value)}
                  style={numInputStyle}
                />
              </label>
              <label>
                주의(기준수율 대비, %p)
                <input
                  type="number"
                  defaultValue={thresholds.warningGapPp}
                  onChange={(e) => handleThresholdChange("warningGapPp", e.target.value)}
                  style={numInputStyle}
                />
              </label>
            </div>

            <h3 style={{ fontSize: "1rem" }}>Process별 목표 수율 (비워두면 여러 Config 중간값 자동 계산)</h3>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {processes.map((p) => (
                <label key={p} style={{ fontSize: "0.85rem" }}>
                  {p}
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={`${(baselineByProcess.get(p)! * 100).toFixed(1)}(자동)`}
                    value={targetYieldInputs[p] ?? ""}
                    onChange={(e) => handleTargetYieldChange(p, e.target.value)}
                    style={{ ...numInputStyle, borderColor: targetYieldErrors[p] ? "#b91c1c" : "#ccc" }}
                  />
                  {targetYieldErrors[p] && <div style={{ color: "#b91c1c", fontSize: "0.75rem" }}>{targetYieldErrors[p]}</div>}
                </label>
              ))}
            </div>

            <h3 style={{ fontSize: "1rem" }}>Config × Process 수율 Heatmap</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={cellStyle}>Config</th>
                    {processes.map((p) => (
                      <th key={p} style={cellStyle}>
                        {p.replace("process ", "P")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {configs.map((config) => (
                    <tr key={config}>
                      <td style={cellStyle}>{config}</td>
                      {processes.map((p) => {
                        const cell = cellByKey.get(`${config}|${p}`);
                        if (!cell) return <td key={p} style={cellStyle}>-</td>;
                        const baseline = baselineByProcess.get(p)!;
                        const status = classifyYield(cell.yieldFrac, baseline, thresholds);
                        return (
                          <td key={p} style={{ ...cellStyle, background: STATUS_COLOR[status] }} title={STATUS_LABEL[status]}>
                            {(cell.yieldFrac * 100).toFixed(1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={sectionTitle}>Process Dashboard — 현재 위치 + Daily Plan 대비 지연</h2>
            <p style={{ color: "#555" }}>
              각 Config가 선택한 시점에 실제로 대기 중인 Process(Input은 있지만 Output이 아직 없는 가장 앞선 Process)와,
              그 Process가 Daily Plan상 며칠에 계획됐는지를 비교합니다.
            </p>

            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
              <label>
                기준 시점
                <select
                  value={selectedSnapshot ? `${selectedSnapshot.date}|${selectedSnapshot.time}` : ""}
                  onChange={(e) => setSelectedSnapshotKey(e.target.value)}
                  style={{ display: "block", marginTop: "0.2rem" }}
                >
                  {snapshots.map((s) => (
                    <option key={`${s.date}|${s.time}`} value={`${s.date}|${s.time}`}>
                      {s.date} {s.time}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                주의(지연일수 이상)
                <input
                  type="number"
                  defaultValue={scheduleThresholds.warningDays}
                  onChange={(e) => handleScheduleThresholdChange("warningDays", e.target.value)}
                  style={numInputStyle}
                />
              </label>
              <label>
                위험(지연일수 이상)
                <input
                  type="number"
                  defaultValue={scheduleThresholds.riskDays}
                  onChange={(e) => handleScheduleThresholdChange("riskDays", e.target.value)}
                  style={numInputStyle}
                />
              </label>
            </div>

            {currentStatusByLine.map(([line, rows]) => (
              <div key={line} style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>{line}</h3>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Config</th>
                      <th style={cellStyle}>현재 대기 Process</th>
                      <th style={cellStyle}>상태</th>
                      <th style={cellStyle}>Daily Plan 계획일</th>
                      <th style={cellStyle}>Daily Plan 대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const bg =
                        row.alarmLevel === "risk" ? STATUS_COLOR.risk : row.alarmLevel === "warning" ? STATUS_COLOR.warning : "transparent";
                      return (
                        <tr key={row.config} style={{ background: bg }}>
                          <td style={cellStyle}>{row.config}</td>
                          <td style={cellStyle}>{row.currentProcess ?? "-"}</td>
                          <td style={cellStyle}>
                            {row.processState === "completed" ? "완료" : row.processState === "not_started" ? "미착수" : "대기 중"}
                          </td>
                          <td style={cellStyle}>{row.planDate ?? "-"}</td>
                          <td style={cellStyle}>
                            {row.delayDays === null
                              ? "-"
                              : `${row.status} (${row.delayDays > 0 ? "+" : ""}${row.delayDays}일)`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

const sectionTitle: CSSProperties = { fontSize: "1.2rem", marginTop: "2rem", borderTop: "1px solid #ddd", paddingTop: "1rem" };
const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" };
const cellStyle: CSSProperties = { border: "1px solid #ddd", padding: "0.35rem 0.5rem", textAlign: "left", verticalAlign: "top" };
const numInputStyle: CSSProperties = { width: "5rem", marginLeft: "0.4rem", display: "block" };
