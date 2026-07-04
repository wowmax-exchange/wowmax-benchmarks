import { describe, it, expect, beforeAll } from "vitest";
import {
  stellarQuote,
  stellarRichQuote,
  STELLAR_CHAIN_ID,
  TimedResponse,
  StellarRichQuote,
} from "../../src/client.js";
import { STELLAR_ROUTER } from "../../src/config.js";

describe("stellar router production adapter /chains/:id/quote (live)", () => {
  it("quotes the flagship XLM -> USDC pair with a concrete route", async () => {
    const r = await stellarQuote({ name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" });
    expect(r.status).toBe(200);
    expect(r.body).not.toBeNull();
    expect(typeof r.body?.amountOut).toBe("string");
    expect((r.body?.routes ?? []).length).toBeGreaterThan(0);
  }, 25_000);

  it("quotes the reverse USDC -> XLM pair", async () => {
    const r = await stellarQuote({ name: "usdc->xlm", from: "USDC", to: "XLM", amount: "20" });
    expect(r.status).toBe(200);
    expect((r.body?.routes ?? []).length).toBeGreaterThan(0);
  }, 25_000);

  it("reports which pricing world won the quote (classic or soroban)", async () => {
    const r = await stellarQuote({ name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" });
    expect(r.status).toBe(200);
    expect(["classic", "soroban"]).toContain(String(r.body?.meta?.mode));
  }, 25_000);

  it("404s an unknown chain id explicitly", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/chains/1/quote?from=XLM&to=USDC&amount=10`);
    expect(res.status).toBe(404);
  }, 20_000);

  it("rejects a missing amount with 400 and a helpful message", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/quote?from=XLM&to=USDC`);
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects identical from/to assets", async () => {
    const res = await fetch(
      `${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/quote?from=XLM&to=XLM&amount=10`,
    );
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects an invalid network parameter explicitly", async () => {
    const res = await fetch(
      `${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/quote?from=XLM&to=USDC&amount=10&network=devnet`,
    );
    expect(res.status).toBe(400);
  }, 20_000);
});

describe("stellar router /chains/:id/swap - wallet-flow failure scenarios (live)", () => {
  it("404s an unknown chain id", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/chains/1/swap?from=XLM&to=USDC&amount=10`);
    expect(res.status).toBe(404);
  }, 20_000);

  it("rejects a missing amount", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/swap?from=XLM&to=USDC`);
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects identical from/to assets", async () => {
    const res = await fetch(
      `${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/swap?from=XLM&to=XLM&amount=10`,
    );
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects an invalid network parameter", async () => {
    const res = await fetch(
      `${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/swap?from=XLM&to=USDC&amount=10&network=devnet`,
    );
    expect(res.status).toBe(400);
  }, 20_000);
});

describe("stellar router rich /quote - the documented D1 dialect (live)", () => {
  // One live call, several contract scenarios on it: the endpoint rebuilds
  // the graph with live reserves per request (~10-18s by design), so probing
  // it once keeps the suite polite to production.
  let r: TimedResponse<StellarRichQuote>;

  beforeAll(async () => {
    r = await stellarRichQuote({ name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" });
  }, 40_000);

  it("still serves the routing-quality figure the improvement column uses", () => {
    expect(r.status).toBe(200);
    const adv = r.body?.wowmax_advantage?.vs_best_single_pool_bps;
    expect(adv === undefined ? "" : String(adv)).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it("soroban simulation: AMM edges enter the graph without loader errors", () => {
    expect(r.status).toBe(200);
    expect(Number(r.body?.graph?.sorobanEdges ?? 0)).toBeGreaterThan(0);
    expect(r.body?.errors?.soroban ?? null).toBeNull();
  });

  it("classic SDEX orderbooks enter the graph alongside soroban pools", () => {
    expect(r.status).toBe(200);
    expect(Number(r.body?.graph?.classicEdges ?? 0)).toBeGreaterThan(0);
    expect(r.body?.errors?.classic ?? null).toBeNull();
  });
});
