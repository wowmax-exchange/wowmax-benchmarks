import { describe, it, expect } from "vitest";
import { stellarQuote, stellarRichQuote, STELLAR_CHAIN_ID } from "../../src/client.js";
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

describe("stellar router rich /quote - the documented D1 dialect (live)", () => {
  it("still serves the routing-quality figure the improvement column uses", async () => {
    const r = await stellarRichQuote({ name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" });
    expect(r.status).toBe(200);
    const adv = r.body?.wowmax_advantage?.vs_best_single_pool_bps;
    expect(adv === undefined ? "" : String(adv)).toMatch(/^-?\d+(\.\d+)?$/);
  }, 35_000);
});
