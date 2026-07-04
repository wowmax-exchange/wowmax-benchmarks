import { describe, it, expect } from "vitest";
import { adapterRouteSummary, StellarAdapterRouteGroup } from "../../src/client.js";

// Captured 1:1 from the production adapter on 2026-07-04 (XLM -> USDC, 100):
// two hop groups, the first split 404/9596 between phoenix and soroswap, the
// second fully on aqua. Issuer strings shortened - the derivation only reads
// structure and market names.
const capturedMultiHopSplit: StellarAdapterRouteGroup[] = [
  {
    parts: 10000,
    from: "native",
    swaps: [
      { to: "eurc:gdhu", part: 404, market: { id: "CBISULYO", name: "phoenix" } },
      { to: "eurc:gdhu", part: 9596, market: { id: "CATUJXDU", name: "soroswap" } },
    ],
  },
  {
    parts: 10000,
    from: "eurc:gdhu",
    swaps: [{ to: "usdc:ga5z", part: 10000, market: { id: "CDTSE6RL", name: "aqua" } }],
  },
];

describe("adapterRouteSummary", () => {
  it("derives hops, +split type and venue counts from a captured production route", () => {
    const s = adapterRouteSummary(capturedMultiHopSplit)!;
    expect(s.hops).toBe(2);
    expect(s.routeType).toBe("multi-hop+split");
    expect(s.venues).toEqual({ phoenix: 1, soroswap: 1, aqua: 1 });
  });
  it("labels a one-hop one-pool route as single", () => {
    const s = adapterRouteSummary([
      { parts: 10000, from: "native", swaps: [{ to: "usdc:ga5z", part: 10000, market: { id: "B1", name: "sdex" } }] },
    ])!;
    expect(s.hops).toBe(1);
    expect(s.routeType).toBe("single");
    expect(s.venues).toEqual({ sdex: 1 });
  });
  it("labels a one-hop multi-pool route as single+split", () => {
    const s = adapterRouteSummary([
      {
        parts: 10000,
        from: "native",
        swaps: [
          { to: "usdc:ga5z", part: 6000, market: { id: "B1", name: "sdex" } },
          { to: "usdc:ga5z", part: 4000, market: { id: "C2", name: "aqua" } },
        ],
      },
    ])!;
    expect(s.hops).toBe(1);
    expect(s.routeType).toBe("single+split");
    expect(s.venues).toEqual({ sdex: 1, aqua: 1 });
  });
  it("returns null on an empty or missing route - no metrics, not a zero-hop route", () => {
    expect(adapterRouteSummary([])).toBeNull();
    expect(adapterRouteSummary(undefined)).toBeNull();
    expect(adapterRouteSummary(null)).toBeNull();
  });
  it("counts unnamed markets as unknown instead of dropping them", () => {
    const s = adapterRouteSummary([
      { parts: 10000, from: "native", swaps: [{ to: "usdc:ga5z", part: 10000, market: { id: "X" } }] },
    ])!;
    expect(s.venues).toEqual({ unknown: 1 });
  });
});
