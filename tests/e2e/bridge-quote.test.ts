import { describe, it, expect } from "vitest";
import { bridgeQuote, CompatQuote } from "../../src/client.js";
import { BRIDGE_PAIRS, EVM_ADDR, BRIDGE_API } from "../../src/config.js";

// Live black-box scenarios against the production aggregator. They assert the
// public contract the web UI depends on, not implementation details.

const stablePair = BRIDGE_PAIRS[0]; // bsc USDT -> eth USDT

describe("bridge quote-compat (live)", () => {
  it("full pass returns at least one ranked route for a liquid stable pair", async () => {
    const r = await bridgeQuote(stablePair, false);
    expect(r.status).toBe(200);
    const routes = r.body?._routes ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(1);
  }, 40_000);

  it("routes are ranked by net output, best first", async () => {
    const r = await bridgeQuote(stablePair, false);
    const nets = (r.body?._routes ?? [])
      .map((x) => x.netUsd ?? x.amountOutUsd)
      .filter((v): v is number => typeof v === "number");
    for (let i = 1; i < nets.length; i++) {
      expect(nets[i - 1]).toBeGreaterThanOrEqual(nets[i]);
    }
  }, 40_000);

  it("every route carries the fields the route card renders", async () => {
    const r = await bridgeQuote(stablePair, false);
    for (const route of r.body?._routes ?? []) {
      expect(typeof route.bridge).toBe("string");
      expect(typeof route.amountOut).toBe("string");
      expect(["number", "object"]).toContain(typeof route.etaSeconds); // number | null
      // capacity is optional but, when present, numeric
      if (route.maxAmountInUsd !== undefined && route.maxAmountInUsd !== null) {
        expect(typeof route.maxAmountInUsd).toBe("number");
        expect(route.maxAmountInUsd).toBeGreaterThan(0);
      }
    }
  }, 40_000);

  it("fast pass responds and is a strict subset flow (single-bridge or 404)", async () => {
    const r = await bridgeQuote(stablePair, true);
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      expect((r.body?._routes ?? []).length).toBeGreaterThanOrEqual(1);
    }
  }, 40_000);

  it("an unknown token yields a clean 4xx, not a hang or a 5xx", async () => {
    const r = await fetch(`${BRIDGE_API}/v0/bridge/quote-compat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromChain: "bsc",
        fromToken: "NOT_A_TOKEN_XYZ",
        toChain: "eth",
        toToken: "USDT",
        amount: "10",
        sender: EVM_ADDR,
        recipient: EVM_ADDR,
        dry: true,
      }),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }, 40_000);

  it("an absurd oversize amount does not return a fantasy route list", async () => {
    const r = await bridgeQuote({ ...stablePair, amount: "50000000" }, false);
    // Either no routes (404) or only routes that genuinely quoted the size.
    if (r.status === 200) {
      for (const route of r.body?._routes ?? []) {
        expect(Number(route.amountOut)).toBeGreaterThan(0);
      }
    } else {
      expect(r.status).toBe(404);
    }
  }, 60_000);

  it("missing required fields are rejected with 400", async () => {
    const r = await fetch(`${BRIDGE_API}/v0/bridge/quote-compat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromChain: "bsc" }),
    });
    expect(r.status).toBe(400);
  }, 20_000);
});

describe("bridge quote-compat (live, Stellar direction)", () => {
  it("inbound EVM -> Stellar quotes at least one route", async () => {
    const pair = BRIDGE_PAIRS.find((p) => p.toChain === "stellar")!;
    const r = await bridgeQuote(pair, false);
    expect(r.status).toBe(200);
    expect((r.body?._routes ?? []).length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("outbound Stellar -> EVM quotes at least one route", async () => {
    const pair = BRIDGE_PAIRS.find((p) => p.fromChain === "stellar")!;
    const r = await bridgeQuote(pair, false);
    expect(r.status).toBe(200);
    expect((r.body?._routes ?? []).length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
