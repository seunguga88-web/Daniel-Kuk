import { describe, it, expect } from "vitest";
import { parseAllFiles } from "../lib/parseAll";
import { loadVirtualDataInputs } from "./fixtures";
import {
  computeYieldCells,
  computeBaseline,
  classifyYield,
  validateTargetYieldInput,
  DEFAULT_THRESHOLDS,
} from "../lib/yieldAnalysis";

function getDataset() {
  return parseAllFiles(loadVirtualDataInputs()).dataset;
}

describe("computeYieldCells", () => {
  it("Config 2 / Process 7 and 11 match the documented ~79.5% / ~74.1% yields", () => {
    const cells = computeYieldCells(getDataset().processStatus);
    const p7 = cells.find((c) => c.config === "Config 2" && c.process === "process 7")!;
    const p11 = cells.find((c) => c.config === "Config 2" && c.process === "process 11")!;
    expect(p7.yieldFrac).toBeCloseTo(0.795, 2);
    expect(p11.yieldFrac).toBeCloseTo(0.741, 2);
  });
});

describe("Config 2 / 4, Process 7 / 11 are auto-detected as anomalies", () => {
  it("flags Config 2 and Config 4 at Process 7 and 11 as risk, using the auto-computed median baseline", () => {
    const cells = computeYieldCells(getDataset().processStatus);

    for (const config of ["Config 2", "Config 4"]) {
      for (const process of ["process 7", "process 11"]) {
        const cell = cells.find((c) => c.config === config && c.process === process)!;
        const baseline = computeBaseline(cells, process);
        const status = classifyYield(cell.yieldFrac, baseline, DEFAULT_THRESHOLDS);
        expect(status, `${config} ${process}`).toBe("risk");
      }
    }
  });

  it("other configs at Process 7 stay normal (around the documented ~97~98%)", () => {
    const cells = computeYieldCells(getDataset().processStatus);
    const baseline = computeBaseline(cells, "process 7");
    const c1 = cells.find((c) => c.config === "Config 1" && c.process === "process 7")!;
    const status = classifyYield(c1.yieldFrac, baseline, DEFAULT_THRESHOLDS);
    expect(status).toBe("normal");
  });
});

describe("target yield input overrides the auto baseline", () => {
  it("computeBaseline uses the override percentage instead of the median when one is given", () => {
    const cells = [
      { config: "Config A", process: "process 1", input: 100, output: 90, yieldFrac: 0.9 },
      { config: "Config B", process: "process 1", input: 100, output: 90, yieldFrac: 0.9 },
    ];
    expect(computeBaseline(cells, "process 1")).toBeCloseTo(0.9, 5);
    expect(computeBaseline(cells, "process 1", 99)).toBeCloseTo(0.99, 5);
  });

  it("raising the target yield widens the gap to the cell's actual yield and can flip normal -> warning", () => {
    // Isolate the "gap below baseline" rule with permissive absolute
    // thresholds, since with the real-world defaults (90%/97%) a yield
    // capped at 100% rarely leaves enough room above 97% for the gap rule
    // to fire on its own.
    const gapOnlyThresholds = { riskAbsolutePct: 0, warningAbsolutePct: 0, riskGapPp: 10, warningGapPp: 5 };
    const yieldFrac = 0.9;

    expect(classifyYield(yieldFrac, /* baseline */ 0.9, gapOnlyThresholds)).toBe("normal");
    // User raises the target yield for this process to 96% -> 6pp gap.
    expect(classifyYield(yieldFrac, /* baseline */ 0.96, gapOnlyThresholds)).toBe("warning");
    // ...and to 100% against a slightly lower yield -> >=10pp gap.
    expect(classifyYield(0.89, /* baseline */ 1.0, gapOnlyThresholds)).toBe("risk");
  });
});

describe("adjustable absolute thresholds change classification", () => {
  it("loosening the risk threshold below Config 2's Process 7 yield clears the risk flag", () => {
    const cells = computeYieldCells(getDataset().processStatus);
    const c2p7 = cells.find((c) => c.config === "Config 2" && c.process === "process 7")!;
    const baseline = computeBaseline(cells, "process 7");

    const defaultStatus = classifyYield(c2p7.yieldFrac, baseline, DEFAULT_THRESHOLDS);
    expect(defaultStatus).toBe("risk");

    const loosened = { ...DEFAULT_THRESHOLDS, riskAbsolutePct: 50, riskGapPp: 90, warningAbsolutePct: 50, warningGapPp: 90 };
    const loosenedStatus = classifyYield(c2p7.yieldFrac, baseline, loosened);
    expect(loosenedStatus).toBe("normal");
  });
});

describe("validateTargetYieldInput", () => {
  it("accepts blank input as 'unset'", () => {
    expect(validateTargetYieldInput("")).toEqual({ valid: true, value: undefined });
    expect(validateTargetYieldInput("   ")).toEqual({ valid: true, value: undefined });
  });

  it("accepts numbers within 0..100", () => {
    expect(validateTargetYieldInput("95")).toEqual({ valid: true, value: 95 });
    expect(validateTargetYieldInput("0")).toEqual({ valid: true, value: 0 });
    expect(validateTargetYieldInput("100")).toEqual({ valid: true, value: 100 });
  });

  it("rejects negative numbers, values over 100, and non-numeric text", () => {
    expect(validateTargetYieldInput("-5").valid).toBe(false);
    expect(validateTargetYieldInput("150").valid).toBe(false);
    expect(validateTargetYieldInput("abc").valid).toBe(false);
  });
});
