import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { summarize, renderHtml, QuoteSample } from "../../src/report.js";
import type { RouteRow } from "../../src/client.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/quote-compat.json", "utf8")) as {
  _routes: RouteRow[];
};

const samples: QuoteSample[] = [
  { pair: "p", mode: "full", ms: 1000, status: 200, routes: fixture._routes },
  { pair: "p", mode: "full", ms: 1400, status: 200, routes: fixture._routes },
  { pair: "p", mode: "full", ms: 900, status: 500, routes: null },
];

describe("summarize", () => {
  const rep = summarize(samples, "abc1234");
  const p = rep.pairs.find((x) => x.pair === "p" && x.mode === "full")!;

  it("counts ok vs total", () => {
    expect(rep.totals).toEqual({ quotes: 3, ok: 2 });
    expect(p.ok).toBe(2);
    expect(p.samples).toBe(3);
  });
  it("latency percentiles come from OK samples only", () => {
    expect(p.p50ms).toBe(1000);
    expect(p.p95ms).toBe(1400);
  });
  it("bridge and kind distribution accumulate across samples", () => {
    expect(p.bridges).toEqual({ squid: 2, "near-intents": 2, allbridge: 2 });
    expect(p.kinds).toEqual({ direct: 6 });
  });
  it("capacity coverage reflects maxAmountInUsd presence", () => {
    expect(p.capacityCoverage).toBe(100);
  });
  it("improvement uses netUsd best vs second-best", () => {
    // 99.62 vs 99.55 ~ 7 bps
    expect(p.improvementBps).not.toBeNull();
    expect(p.improvementBps!).toBeGreaterThan(5);
    expect(p.improvementBps!).toBeLessThan(9);
  });
});

describe("summarize (stellar DEX-router rows)", () => {
  const stellarSamples: QuoteSample[] = [
    {
      pair: "xlm->usdc",
      mode: "stellar",
      ms: 9000,
      status: 200,
      routes: null,
      stellar: { hops: 1, routeType: "single", venues: { sdex: 1 }, advantageBps: 12.4 },
    },
    {
      pair: "xlm->usdc",
      mode: "stellar",
      ms: 11000,
      status: 200,
      routes: null,
      stellar: { hops: 2, routeType: "multi-hop", venues: { sdex: 2 }, advantageBps: 20.6 },
    },
  ];
  const rep = summarize(stellarSamples, null);
  const p = rep.pairs.find((x) => x.pair === "xlm->usdc" && x.mode === "stellar")!;

  it("maps the router's own advantage metric into the improvement column", () => {
    expect(p.improvementBps).toBe(16.5);
  });
  it("hops feed the routes column, venues feed the distribution column", () => {
    expect(p.meanRoutes).toBe(1.5);
    expect(p.bridges).toEqual({ sdex: 3 });
    expect(p.kinds).toEqual({ single: 1, "multi-hop": 1 });
  });
  it("keeps capacity coverage null - no maxAmountInUsd concept on-chain", () => {
    expect(p.capacityCoverage).toBeNull();
  });
});

describe("renderHtml", () => {
  it("produces a self-contained document with the data row", () => {
    const html = renderHtml(summarize(samples, null));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("squid:2");
    expect(html).toContain("direct:6");
    expect(html.toLowerCase()).not.toContain("<script");
  });
  it("explains the latency percentiles in plain words and annotates the headers", () => {
    const html = renderHtml(summarize(samples, null));
    expect(html).toContain("p50 is the median");
    expect(html).toContain("19 of 20 quotes were faster");
    expect(html).toContain('title="median end-to-end HTTP latency');
    expect(html).toContain('title="tail latency');
  });
  it("renders stellar capacity as explicit n/a, not a bare dash", () => {
    const stellarOnly: QuoteSample[] = [
      {
        pair: "xlm->usdc",
        mode: "stellar",
        ms: 9000,
        status: 200,
        routes: null,
        stellar: { hops: 1, routeType: "single", venues: { sdex: 1 }, advantageBps: 12.4 },
      },
    ];
    const html = renderHtml(summarize(stellarOnly, null));
    expect(html).toContain("<td>n/a</td>");
    expect(html).toContain("sdex:1");
    expect(html).toContain("<td>12.4</td>");
  });
});
