import { describe, it, expect } from "vitest";
import { stellarQuote } from "../../src/client.js";
import { STELLAR_ROUTER } from "../../src/config.js";

describe("stellar router /quote (live)", () => {
  it("quotes the flagship XLM -> USDC pair", async () => {
    const r = await stellarQuote({ name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" });
    expect(r.status).toBe(200);
    expect(r.body).not.toBeNull();
  }, 30_000);

  it("quotes the reverse USDC -> XLM pair", async () => {
    const r = await stellarQuote({ name: "usdc->xlm", from: "USDC", to: "XLM", amount: "20" });
    expect(r.status).toBe(200);
  }, 30_000);

  it("rejects a missing amount with 400 and a helpful message", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/quote?from=XLM&to=USDC`);
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects identical from/to assets", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/quote?from=XLM&to=XLM&amount=10`);
    expect(res.status).toBe(400);
  }, 20_000);

  it("rejects an invalid network parameter explicitly", async () => {
    const res = await fetch(`${STELLAR_ROUTER}/quote?from=XLM&to=USDC&amount=10&network=devnet`);
    expect(res.status).toBe(400);
  }, 20_000);
});
