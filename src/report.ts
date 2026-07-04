import { percentile, mean, round1, improvementBps } from "./stats.js";
import type { RouteRow } from "./client.js";

export interface StellarSampleStats {
  hops: number;
  routeType: string;
  venues: Record<string, number>;
  advantageBps: number | null;
}

export interface QuoteSample {
  pair: string;
  mode: "fast" | "full" | "stellar";
  ms: number;
  status: number;
  routes: RouteRow[] | null;
  /** DEX-router samples carry their own native metrics instead of bridge routes. */
  stellar?: StellarSampleStats | null;
}

export interface PairSummary {
  pair: string;
  mode: string;
  samples: number;
  ok: number;
  p50ms: number | null;
  p95ms: number | null;
  meanRoutes: number | null;
  improvementBps: number | null;
  bridges: Record<string, number>;
  kinds: Record<string, number>;
  capacityCoverage: number | null; // share of routes carrying maxAmountInUsd
}

export interface BenchReport {
  generatedAt: string;
  gitSha: string | null;
  totals: { quotes: number; ok: number };
  pairs: PairSummary[];
}

export function summarize(samples: QuoteSample[], gitSha: string | null): BenchReport {
  const keys = [...new Set(samples.map((s) => `${s.pair}|${s.mode}`))];
  const pairs: PairSummary[] = keys.map((key) => {
    const [pair, mode] = key.split("|");
    const group = samples.filter((s) => s.pair === pair && s.mode === mode);
    const ok = group.filter((s) => s.status === 200);
    const lat = ok.map((s) => s.ms);
    const bridges: Record<string, number> = {};
    const kinds: Record<string, number> = {};
    const routeCounts: number[] = [];
    const improvements: number[] = [];
    let withCap = 0;
    let totalRoutes = 0;
    for (const s of ok) {
      if (s.stellar) {
        // DEX-router semantics: hops instead of route count, venue
        // distribution instead of bridges, route type from the router,
        // improvement vs the best single pool (the router's own metric).
        routeCounts.push(s.stellar.hops);
        kinds[s.stellar.routeType] = (kinds[s.stellar.routeType] ?? 0) + 1;
        for (const [v, n] of Object.entries(s.stellar.venues)) {
          bridges[v] = (bridges[v] ?? 0) + n;
        }
        if (s.stellar.advantageBps !== null) improvements.push(s.stellar.advantageBps);
        continue;
      }
      const routes = s.routes ?? [];
      routeCounts.push(routes.length);
      for (const r of routes) {
        bridges[r.bridge] = (bridges[r.bridge] ?? 0) + 1;
        const kind = r.kind ?? "direct";
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        totalRoutes += 1;
        if (r.maxAmountInUsd !== null && r.maxAmountInUsd !== undefined) withCap += 1;
      }
      const outs = routes
        .map((r) => r.netUsd ?? r.amountOutUsd)
        .filter((v): v is number => typeof v === "number");
      const imp = improvementBps(outs);
      if (imp !== null) improvements.push(imp);
    }
    return {
      pair,
      mode,
      samples: group.length,
      ok: ok.length,
      p50ms: round1(percentile(lat, 50)),
      p95ms: round1(percentile(lat, 95)),
      meanRoutes: round1(mean(routeCounts)),
      improvementBps: round1(mean(improvements)),
      bridges,
      kinds,
      capacityCoverage: totalRoutes > 0 ? round1((withCap / totalRoutes) * 100) : null,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    gitSha,
    totals: { quotes: samples.length, ok: samples.filter((s) => s.status === 200).length },
    pairs,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderHtml(report: BenchReport): string {
  const rows = report.pairs
    .map((p) => {
      const bridges = Object.entries(p.bridges)
        .map(([b, n]) => `${esc(b)}:${n}`)
        .join(" ");
      const kinds = Object.entries(p.kinds)
        .map(([k, n]) => `${esc(k)}:${n}`)
        .join(" ");
      // Capacity bounds are a bridge-aggregator concept (maxAmountInUsd per
      // route); on-chain DEX rows have no such notion, so render an explicit
      // n/a there instead of a dash that reads as missing data.
      const capacity =
        p.mode === "stellar" ? "n/a" : p.capacityCoverage === null ? "-" : p.capacityCoverage + "%";
      return `<tr>
<td>${esc(p.pair)}</td><td>${esc(p.mode)}</td>
<td>${p.ok}/${p.samples}</td>
<td>${p.p50ms ?? "-"}</td><td>${p.p95ms ?? "-"}</td>
<td>${p.meanRoutes ?? "-"}</td>
<td>${p.improvementBps ?? "-"}</td>
<td>${capacity}</td>
<td>${bridges || "-"}</td><td>${kinds || "-"}</td>
</tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WOWMAX Benchmarks</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:2rem;color:#1d2b3a;background:#fff}
h1{font-size:1.4rem} .meta{color:#68738a;margin-bottom:1.2rem}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{border:1px solid #d8deea;padding:.45rem .6rem;text-align:left;white-space:nowrap}
th{background:#f2f5fb} tr:nth-child(even){background:#fafbfe}
.note{margin-top:1.2rem;color:#68738a;font-size:.85rem;max-width:70rem;white-space:normal}
</style></head><body>
<h1>WOWMAX Aggregation Benchmarks</h1>
<div class="meta">generated ${esc(report.generatedAt)} &middot; commit ${esc(report.gitSha ?? "n/a")} &middot; quotes ${report.totals.ok}/${report.totals.quotes} OK</div>
<table>
<tr><th>pair</th><th>mode</th><th>ok</th><th>p50 ms</th><th>p95 ms</th><th>routes | hops</th><th>improvement bps</th><th>capacity coverage</th><th>bridge | venue distribution</th><th>route types</th></tr>
${rows}
</table>
<div class="note">
Method: black-box dry quotes against public production endpoints, ${"BENCH_REPS"} repetitions per pair per mode.
Stellar rows measure the production adapter route the web app calls (/chains/100000148/quote, answered from the
router's warm graph snapshot): hops, venue distribution (SDEX / AMMs) and route type - single or multi-hop,
"+split" when a hop is split across pools - come from the returned route. Improvement there is the router's own
"vs best single pool" figure, taken from one probe per pair of the rich documented /quote endpoint; by the D1
contract that endpoint rebuilds the graph with live reserves on every request, so its latency is deliberately
excluded from the latency columns. Capacity coverage does not apply to on-chain DEX routes and is shown as n/a.
Latency is end-to-end HTTP. Improvement bps compares the best aggregated route with the best single alternative
in the same response (0 when only one bridge quotes the pair). Capacity coverage is the share of returned routes
carrying a maxAmountInUsd liquidity bound. Raw samples for every run live in report/history/.
</div>
</body></html>`;
}
