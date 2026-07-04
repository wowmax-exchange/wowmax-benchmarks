import { describe, it, expect } from "vitest";
import { percentile, mean, improvementBps, round1, toFiniteNumber } from "../../src/stats.js";

describe("percentile", () => {
  it("returns null on empty input", () => {
    expect(percentile([], 50)).toBeNull();
  });
  it("p50 of a known series", () => {
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
  });
  it("p95 rounds toward the higher observation on small samples", () => {
    expect(percentile([100, 200, 300, 400, 5000], 95)).toBe(5000);
  });
  it("is order-independent", () => {
    expect(percentile([300, 100, 400, 200], 50)).toBe(percentile([100, 200, 300, 400], 50));
  });
  it("p0 and p100 clamp to min/max", () => {
    expect(percentile([5, 1, 9], 0)).toBe(1);
    expect(percentile([5, 1, 9], 100)).toBe(9);
  });
});

describe("mean / round1", () => {
  it("mean of empty is null", () => {
    expect(mean([])).toBeNull();
  });
  it("round1 keeps one decimal", () => {
    expect(round1(1234.567)).toBe(1234.6);
    expect(round1(null)).toBeNull();
  });
});

describe("improvementBps", () => {
  it("null on empty, zero on a single route", () => {
    expect(improvementBps([])).toBeNull();
    expect(improvementBps([99.5])).toBe(0);
  });
  it("best vs second-best in bps", () => {
    // 100 vs 99: 1/99 ~ 101 bps
    const v = improvementBps([99, 100]);
    expect(v).not.toBeNull();
    expect(Math.round(v!)).toBe(101);
  });
  it("order-independent and ignores worse tails", () => {
    expect(improvementBps([98, 100, 99])).toBeCloseTo(improvementBps([100, 99, 98])!, 10);
  });
});

describe("toFiniteNumber", () => {
  it("passes finite numbers through", () => {
    expect(toFiniteNumber(83.4)).toBe(83.4);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-7.5)).toBe(-7.5);
  });
  it("coerces numeric strings - the stellar router serializes bps as strings", () => {
    expect(toFiniteNumber("83.4")).toBe(83.4);
    expect(toFiniteNumber(" 12 ")).toBe(12);
    expect(toFiniteNumber("1e2")).toBe(100);
    expect(toFiniteNumber("-3.25")).toBe(-3.25);
  });
  it("maps empty and non-numeric strings to null, never to zero", () => {
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("   ")).toBeNull();
    expect(toFiniteNumber("abc")).toBeNull();
    expect(toFiniteNumber("12,4")).toBeNull();
  });
  it("maps non-finite values and foreign types to null", () => {
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber({})).toBeNull();
    expect(toFiniteNumber([])).toBeNull();
  });
});
