import { BRIDGE_API, STELLAR_ROUTER, HTTP_TIMEOUT_MS, BridgePair, StellarPair } from "./config.js";

export interface TimedResponse<T> {
  ms: number;
  status: number;
  body: T | null;
}

async function timedFetch<T>(url: string, init?: RequestInit): Promise<TimedResponse<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const ms = performance.now() - t0;
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { ms, status: res.status, body };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

// --- Bridge aggregator (quote-compat: what the UI's route picker consumes) ---

export interface RouteRow {
  bridge: string;
  kind?: string;
  via?: string | null;
  amountOut: string;
  amountOutUsd: number | null;
  netUsd: number | null;
  etaSeconds: number | null;
  maxAmountInUsd?: number | null;
}

export interface CompatQuote {
  _routes?: RouteRow[];
  quote?: Record<string, unknown>;
}

export function bridgeQuote(pair: BridgePair, fast: boolean): Promise<TimedResponse<CompatQuote>> {
  return timedFetch<CompatQuote>(`${BRIDGE_API}/v0/bridge/quote-compat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromChain: pair.fromChain,
      fromToken: pair.fromToken,
      toChain: pair.toChain,
      toToken: pair.toToken,
      amount: pair.amount,
      sender: pair.sender,
      recipient: pair.recipient,
      dry: true,
      fast,
    }),
  });
}

// --- Stellar DEX router ---

export interface StellarQuote {
  amountOut?: string;
  path?: unknown[];
  hops?: number;
  [k: string]: unknown;
}

export function stellarQuote(pair: StellarPair): Promise<TimedResponse<StellarQuote>> {
  const q = new URLSearchParams({ from: pair.from, to: pair.to, amount: pair.amount });
  return timedFetch<StellarQuote>(`${STELLAR_ROUTER}/quote?${q.toString()}`);
}
