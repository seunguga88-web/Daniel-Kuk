"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { listSnapshots, computeCurrentStatus, trafficLight, type Snapshot, type TrafficLight } from "@/lib/currentStatus";
import { computeShipmentRisk, type RiskStatus } from "@/lib/shipmentRisk";
import { computeShipmentDraft } from "@/lib/shipmentDraft";
import { buildYieldAnalysisWorkbook, buildProcessDashboardWorkbook } from "@/lib/exportExcel";
import { saveUpload, loadUpload } from "@/lib/persistence";
import type { FileKind, ParsedDataset } from "@/lib/types";

function SnapshotPicker({
  availableDates,
  effectiveDate,
  onDateChange,
  availableTimesForDate,
  effectiveTime,
  onTimeChange,
}: {
  availableDates: string[];
  effectiveDate: string | undefined;
  onDateChange: (v: string) => void;
  availableTimesForDate: string[];
  effectiveTime: string | undefined;
  onTimeChange: (v: string) => void;
}) {
  return (
    <>
      <label>
        날짜
        <select value={effectiveDate ?? ""} onChange={(e) => onDateChange(e.target.value)} style={{ display: "block", marginTop: "0.2rem" }}>
          {availableDates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label>
        시간
        <select value={effectiveTime ?? ""} onChange={(e) => onTimeChange(e.target.value)} style={{ display: "block", marginTop: "0.2rem" }}>
          {availableTimesForDate.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

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

const TRAFFIC_LIGHT_COLOR: Record<NonNullable<TrafficLight>, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

const RISK_STATUS_COLOR: Record<RiskStatus, string> = {
  OK: "transparent",
  Risk: "#fef08a",
  "Waiver Dependent": "#fed7aa",
  Shortage: "#fecaca",
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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [targetYieldInputs, setTargetYieldInputs] = useState<Record<string, string>>({});
  const [targetYieldErrors, setTargetYieldErrors] = useState<Record<string, string>>({});
  const [targetYields, setTargetYields] = useState<Record<string, number>>({});

  // 새로고침 후에도 최근 업로드 결과를 유지: 마운트 시 로컬 저장된 결과를 복원한다.
  // localStorage는 서버에 없으므로 SSR 하이드레이션과 어긋나지 않으려면 반드시
  // 마운트 이후(useEffect)에 읽어야 한다 — lazy useState initializer로는 서버/
  // 클라이언트 첫 렌더 결과가 달라져 하이드레이션 에러가 난다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadUpload();
    if (stored) {
      setDataset(stored.dataset);
      setUnrecognizedFiles(stored.unrecognizedFiles);
      setLastSavedAt(stored.savedAt);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      saveUpload(parsed.dataset, parsed.unrecognizedFiles);
      setLastSavedAt(new Date().toISOString());
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

  const availableDates = useMemo(() => {
    const set = new Set(snapshots.map((s) => s.date));
    return Array.from(set).sort();
  }, [snapshots]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const effectiveDate = selectedDate && availableDates.includes(selectedDate) ? selectedDate : availableDates[availableDates.length - 1];

  const availableTimesForDate = useMemo(
    () => snapshots.filter((s) => s.date === effectiveDate).map((s) => s.time),
    [snapshots, effectiveDate]
  );

  const effectiveTime =
    selectedTime && availableTimesForDate.includes(selectedTime)
      ? selectedTime
      : availableTimesForDate[availableTimesForDate.length - 1];

  const selectedSnapshot: Snapshot | null = useMemo(
    () => (effectiveDate && effectiveTime ? { date: effectiveDate, time: effectiveTime } : null),
    [effectiveDate, effectiveTime]
  );

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

  const shipmentRiskRows = useMemo(
    () =>
      dataset && selectedSnapshot
        ? computeShipmentRisk(dataset.processStatus, dataset.shipmentPlan, dataset.shipmentTable, yieldCells, targetYields, selectedSnapshot)
        : [],
    [dataset, yieldCells, targetYields, selectedSnapshot]
  );

  const [destinationPriority, setDestinationPriority] = useState<string[]>([
    "Destination 1",
    "Destination 2",
    "Destination 3",
    "Destination 4",
  ]);

  function moveDestination(index: number, direction: -1 | 1) {
    setDestinationPriority((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const shipmentDraftRows = useMemo(
    () =>
      dataset && selectedSnapshot
        ? computeShipmentDraft(
            selectedSnapshot,
            dataset.dailyPlan,
            dataset.shipmentPlan,
            dataset.processStatus,
            yieldCells,
            targetYields,
            destinationPriority
          )
        : [],
    [dataset, selectedSnapshot, yieldCells, targetYields, destinationPriority]
  );

  async function handleDownloadYieldExcel() {
    try {
      const buffer = await buildYieldAnalysisWorkbook(yieldCells, processes, configs, thresholds, targetYields);
      downloadWorkbook(buffer, "yield_analysis.xlsx");
    } catch (err) {
      console.error("Yield 분석 Excel 다운로드 실패:", err);
    }
  }

  async function handleDownloadProcessDashboardExcel() {
    if (!selectedSnapshot) return;
    try {
      const buffer = await buildProcessDashboardWorkbook(currentStatusRows, selectedSnapshot, scheduleThresholds);
      downloadWorkbook(buffer, `process_dashboard_${selectedSnapshot.date}_${selectedSnapshot.time.replace(/[: ]/g, "")}.xlsx`);
    } catch (err) {
      console.error("Process Dashboard Excel 다운로드 실패:", err);
    }
  }

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
          <nav style={navStyle}>
            <a href="#upload">Upload Center</a>
            <a href="#yield">Yield / NG Analysis</a>
            <a href="#process">Process Dashboard</a>
            <a href="#risk">Shipment Risk</a>
            <a href="#draft">Shipment Draft</a>
            {lastSavedAt && (
              <span style={{ marginLeft: "auto", color: "#888", fontSize: "0.8rem" }}>
                마지막 업로드 저장: {new Date(lastSavedAt).toLocaleString("ko-KR")} (새로고침해도 유지됩니다)
              </span>
            )}
          </nav>

          <section id="upload">
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

          <section id="yield">
            <h2 style={sectionTitle}>
              Yield / NG Analysis{" "}
              <button onClick={handleDownloadYieldExcel} style={downloadButtonStyle}>
                Excel 다운로드
              </button>
            </h2>

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

          <section id="process">
            <h2 style={sectionTitle}>
              Process Dashboard — 현재 위치 + Daily Plan 대비 지연{" "}
              <button onClick={handleDownloadProcessDashboardExcel} style={downloadButtonStyle}>
                Excel 다운로드
              </button>
            </h2>
            <p style={{ color: "#555" }}>
              각 Config가 선택한 시점에 실제로 대기 중인 Process(Input은 있지만 Output이 아직 없는 가장 앞선 Process)와,
              그 Process가 Daily Plan상 며칠에 계획됐는지를 비교합니다.
            </p>

            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
              <SnapshotPicker
                availableDates={availableDates}
                effectiveDate={effectiveDate}
                onDateChange={setSelectedDate}
                availableTimesForDate={availableTimesForDate}
                effectiveTime={effectiveTime}
                onTimeChange={setSelectedTime}
              />
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
                      <th style={cellStyle}>신호등</th>
                      <th style={cellStyle}>현재 대기 Process</th>
                      <th style={cellStyle}>상태</th>
                      <th style={cellStyle}>Daily Plan 계획일</th>
                      <th style={cellStyle}>Daily Plan 대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      if (row.processState === "not_started") {
                        return (
                          <tr key={row.config}>
                            <td style={cellStyle}>{row.config}</td>
                            <td style={cellStyle}></td>
                            <td style={cellStyle}></td>
                            <td style={cellStyle}></td>
                            <td style={cellStyle}></td>
                            <td style={cellStyle}></td>
                          </tr>
                        );
                      }
                      const bg =
                        row.alarmLevel === "risk" ? STATUS_COLOR.risk : row.alarmLevel === "warning" ? STATUS_COLOR.warning : "transparent";
                      const light = trafficLight(row);
                      return (
                        <tr key={row.config} style={{ background: bg }}>
                          <td style={cellStyle}>{row.config}</td>
                          <td style={cellStyle}>
                            {light && (
                              <span
                                title={light}
                                style={{
                                  display: "inline-block",
                                  width: "0.8rem",
                                  height: "0.8rem",
                                  borderRadius: "50%",
                                  background: TRAFFIC_LIGHT_COLOR[light],
                                }}
                              />
                            )}
                          </td>
                          <td style={cellStyle}>{row.currentProcess}</td>
                          <td style={cellStyle}>{row.processState === "completed" ? "완료" : "대기 중"}</td>
                          <td style={cellStyle}>{row.planDate}</td>
                          <td style={cellStyle}>
                            {row.delayDays === null ? "" : `${row.status} (${row.delayDays > 0 ? "+" : ""}${row.delayDays}일)`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <section id="risk">
            <h2 style={sectionTitle}>Shipment Risk — 출하 부족 Risk 판정</h2>
            <p style={{ color: "#555" }}>
              예상 최종 양품 = 현재 양품 × 남은 Process들의 기준 수율. 부족분을 승인된 Waiver NG로 채울 수 있는지에 따라 판정합니다.
            </p>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
              <SnapshotPicker
                availableDates={availableDates}
                effectiveDate={effectiveDate}
                onDateChange={setSelectedDate}
                availableTimesForDate={availableTimesForDate}
                effectiveTime={effectiveTime}
                onTimeChange={setSelectedTime}
              />
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellStyle}>Config</th>
                  <th style={cellStyle}>현재 양품</th>
                  <th style={cellStyle}>예상 최종 양품</th>
                  <th style={cellStyle}>출하 계획</th>
                  <th style={cellStyle}>승인 Waiver NG</th>
                  <th style={cellStyle}>부족분</th>
                  <th style={cellStyle}>판정</th>
                </tr>
              </thead>
              <tbody>
                {shipmentRiskRows.map((row) => (
                  <tr key={row.config} style={{ background: RISK_STATUS_COLOR[row.status] }}>
                    <td style={cellStyle}>{row.config}</td>
                    <td style={cellStyle}>{row.currentGoodQty}</td>
                    <td style={cellStyle}>{Math.round(row.expectedFinalGood)}</td>
                    <td style={cellStyle}>{row.totalShipment}</td>
                    <td style={cellStyle}>{row.approvedWaiverQty}</td>
                    <td style={cellStyle}>{Math.round(row.shortfall)}</td>
                    <td style={cellStyle}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section id="draft">
            <h2 style={sectionTitle}>Shipment Draft — 출하 D-1 초안</h2>
            <p style={{ color: "#555" }}>기준 시점의 다음 날 출하 예정인 Config에 대해 Destination별 OK/Waiver 배정 초안을 만듭니다.</p>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
              <SnapshotPicker
                availableDates={availableDates}
                effectiveDate={effectiveDate}
                onDateChange={setSelectedDate}
                availableTimesForDate={availableTimesForDate}
                effectiveTime={effectiveTime}
                onTimeChange={setSelectedTime}
              />
            </div>

            <h3 style={{ fontSize: "1rem" }}>Destination 우선순위 (화면에서 순서 변경 가능)</h3>
            <ol style={{ paddingLeft: "1.2rem", marginBottom: "1rem" }}>
              {destinationPriority.map((dest, i) => (
                <li key={dest} style={{ marginBottom: "0.2rem" }}>
                  {dest}
                  <button onClick={() => moveDestination(i, -1)} disabled={i === 0} style={priorityButtonStyle}>
                    ▲
                  </button>
                  <button onClick={() => moveDestination(i, 1)} disabled={i === destinationPriority.length - 1} style={priorityButtonStyle}>
                    ▼
                  </button>
                </li>
              ))}
            </ol>

            {shipmentDraftRows.length === 0 ? (
              <p style={{ color: "#555" }}>이 기준 시점 기준으로 다음 날 출하 예정인 Config가 없습니다.</p>
            ) : (
              shipmentDraftRows.map((row) => (
                <div key={row.config} style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem" }}>
                    {row.config} — 출하일 {row.shipDate} (OK 가능 {Math.round(row.okAvailable)} / Waiver 필요 {Math.round(row.waiverNeeded)} / 계획{" "}
                    {row.totalShipment})
                  </h3>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={cellStyle}>Destination</th>
                        <th style={cellStyle}>계획 수량</th>
                        <th style={cellStyle}>OK 배정</th>
                        <th style={cellStyle}>Waiver 배정</th>
                        <th style={cellStyle}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.allocations.map((a) => (
                        <tr key={a.destination}>
                          <td style={cellStyle}>{a.destination}</td>
                          <td style={cellStyle}>{a.planQty}</td>
                          <td style={cellStyle}>{Math.round(a.okQty)}</td>
                          <td style={cellStyle}>{Math.round(a.waiverQty)}</td>
                          <td style={cellStyle}>{Math.round(a.totalQty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
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
const downloadButtonStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: "normal",
  padding: "0.2rem 0.6rem",
  cursor: "pointer",
};
const priorityButtonStyle: CSSProperties = {
  marginLeft: "0.5rem",
  padding: "0.05rem 0.4rem",
  cursor: "pointer",
};
const navStyle: CSSProperties = {
  display: "flex",
  gap: "1.2rem",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "0.6rem 0",
  marginBottom: "0.5rem",
  borderBottom: "1px solid #ddd",
  position: "sticky",
  top: 0,
  background: "#fff",
  zIndex: 1,
};
