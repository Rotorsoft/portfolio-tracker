import { describe, it, expect } from "vitest";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, glColor, fmtDate, fmtDateShort, fmtMonthYear } from "../src/client/fmt.js";

describe("fmtUsd", () => {
  it("formats positive", () => {
    expect(fmtUsd(1234.56)).toBe("$1,234.56");
  });

  it("formats negative with minus", () => {
    expect(fmtUsd(-500)).toBe("-$500.00");
  });

  it("formats zero", () => {
    expect(fmtUsd(0)).toBe("$0.00");
  });
});

describe("fmtUsdAbs", () => {
  it("formats absolute value", () => {
    expect(fmtUsdAbs(-1234.56)).toBe("$1,234.56");
    expect(fmtUsdAbs(1234.56)).toBe("$1,234.56");
  });
});

describe("fmtPctAbs", () => {
  it("formats with default decimals", () => {
    expect(fmtPctAbs(-12.345)).toBe("12.35%");
    expect(fmtPctAbs(12.345)).toBe("12.35%");
  });

  it("formats with custom decimals", () => {
    expect(fmtPctAbs(12.345, 1)).toBe("12.3%");
  });
});

describe("glColor", () => {
  it("returns emerald for positive", () => {
    expect(glColor(1)).toBe("text-emerald-400");
  });

  it("returns red for negative", () => {
    expect(glColor(-1)).toBe("text-red-400");
  });

  it("returns gray for zero", () => {
    expect(glColor(0)).toBe("text-gray-500");
  });
});

describe("fmtDate", () => {
  it("formats ISO to US", () => {
    expect(fmtDate("2024-03-15")).toBe("03/15/2024");
  });

  it("returns dash for empty", () => {
    expect(fmtDate("")).toBe("-");
  });

  it("returns input for invalid", () => {
    expect(fmtDate("bad")).toBe("bad");
  });
});

describe("fmtDateShort", () => {
  it("formats MM/DD", () => {
    expect(fmtDateShort("2024-03-15")).toBe("03/15");
  });

  it("returns empty for empty", () => {
    expect(fmtDateShort("")).toBe("");
  });
});

describe("fmtMonthYear", () => {
  it("formats month and year", () => {
    expect(fmtMonthYear("2025-01-15")).toBe("Jan'25");
    expect(fmtMonthYear("2024-12-01")).toBe("Dec'24");
  });

  it("returns empty for empty", () => {
    expect(fmtMonthYear("")).toBe("");
  });
});
