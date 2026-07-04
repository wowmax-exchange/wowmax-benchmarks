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

// --- Stellar DEX router: the production adapter route the web app calls ---
// (SwapStore quotes `${STELLAR_ROUTER_URL}/chains/${chainId}/quote`; answers
// come from the router's warm graph snapshot, which is why this path is
// sub-second while the rich /quote below deliberately is not.)

export const STELLAR_CHAIN_ID = "100000148";

export interface StellarAdapterSwap {
  to?: string;
  part?: number;
  market?: { id?: string; name?: string };
}

export interface StellarAdapterRouteGroup {
  parts?: number;
  from?: string;
  swaps?: StellarAdapterSwap[];
}

export interface StellarAdapterQuote {
  amountIn?: string;
  amountOut?: string;
  routes?: StellarAdapterRouteGroup[];
  meta?: { mode?: string; network?: string };
  error?: string;
  [k: string]: unknown;
}

export interface StellarRouteSummary {
  hops: number;
  routeType: string;
  venues: Record<string, number>;
}

// Pure derivation from the adapter dialect, exported so unit tests can pin it
// to captured production responses. Null when there is no route - callers
// treat that as "no metrics", never as a zero-hop route.
export function adapterRouteSummary(
  routes: StellarAdapterRouteGroup[] | null | undefined,
): StellarRouteSummary | null {
  if (!routes || routes.length === 0) return null;
  const venues: Record<string, number> = {};
  let split = false;
  for (const group of routes) {
    const swaps = group.swaps ?? [];
    if (swaps.length > 1) split = true;
    for (const sw of swaps) {
      const v = String(sw.market?.name ?? "unknown");
      venues[v] = (venues[v] ?? 0) + 1;
    }
  }
  const routeType = (routes.length > 1 ? "multi-hop" : "single-pool") + (split ? "+split" : "");
  return { hops: routes.length, routeType, venues };
}

export function stellarQuote(pair: StellarPair): Promise<TimedResponse<StellarAdapterQuote>> {
  const q = new URLSearchParams({
    from: pair.from,
    to: pair.to,
    amount: pair.amount,
    network: "mainnet",
  });
  return timedFetch<StellarAdapterQuote>(
    `${STELLAR_ROUTER}/chains/${STELLAR_CHAIN_ID}/quote?${q.toString()}`,
  );
}

// --- Rich documented D1 endpoint. Kept as a once-per-pair quality probe: it
// reports the router's own "vs best single pool" advantage, and by the D1
// contract it rebuilds the graph with live reserves on every request - slow
// on purpose, so its latency never enters the benchmark latency columns. ---

export interface StellarRichQuote {
  wowmax?: { error?: string };
  wowmax_advantage?: { vs_best_single_pool_bps?: number | string };
  graph?: { classicEdges?: number; sorobanEdges?: number; buildMs?: number };
  errors?: { classic?: unknown; soroban?: unknown };
  [k: string]: unknown;
}

export function stellarRichQuote(pair: StellarPair): Promise<TimedResponse<StellarRichQuote>> {
  const q = new URLSearchParams({ from: pair.from, to: pair.to, amount: pair.amount });
  return timedFetch<StellarRichQuote>(`${STELLAR_ROUTER}/quote?${q.toString()}`);
}
