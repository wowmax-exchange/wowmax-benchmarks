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

export interface TransferTimeRow {
  bridge: string;
  pair: string;
  amountUsd: number | null;
  seconds: number;
  date: string; // YYYY-MM-DD of the live run
  note?: string | null;
}

export interface BenchReport {
  generatedAt: string;
  gitSha: string | null;
  totals: { quotes: number; ok: number };
  pairs: PairSummary[];
  /** Observed end-to-end deliveries from live runs; absent until seeded. */
  transferTimes?: TransferTimeRow[];
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

// Human labels for the mode column. Internal values (and latest.json) keep
// the stable machine ids; only the rendered page uses these.
const MODE_LABELS: Record<string, string> = {
  fast: "instant",
  full: "all bridges",
  stellar: "DEX router",
};

function fmtDelivery(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

// Observed end-to-end deliveries from live runs. Rendered only when seeded -
// the quote benchmark itself is dry and never moves funds, so these rows can
// only come from recorded real transfers (see data/transfer-times.json).
function renderTransferTimes(rows: TransferTimeRow[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) => `<tr>
<td>${esc(r.bridge)}</td><td>${esc(r.pair)}</td>
<td>${r.amountUsd === null || r.amountUsd === undefined ? "-" : "$" + r.amountUsd}</td>
<td>${fmtDelivery(r.seconds)}</td>
<td>${esc(r.date)}</td>
<td>${esc(r.note ?? "") || "-"}</td>
</tr>`,
    )
    .join("\n");
  return `<h2>Observed bridge transfer times</h2>
<table>
<tr>
<th title="bridge that carried the transfer">bridge</th>
<th title="source -> destination of the live transfer">pair</th>
<th title="transfer size in USD at the time of the run">amount</th>
<th title="submission on the source chain to funds delivered on the destination">delivery</th>
<th title="date of the live run">run date</th>
<th>note</th>
</tr>
${body}
</table>
<div class="note">
<p>End-to-end delivery of real transfers observed during live runs (seeded from the D5 report runs). The quote
benchmarks above are dry and never move funds; this table only grows when a real delivery is observed and
recorded.</p>
</div>`;
}

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
<td>${esc(p.pair)}</td><td>${esc(MODE_LABELS[p.mode] ?? p.mode)}</td>
<td>${p.ok}/${p.samples}</td>
<td>${p.p50ms ?? "-"}</td><td>${p.p95ms ?? "-"}</td>
<td>${p.meanRoutes ?? "-"}</td>
<td>${p.improvementBps ?? "-"}</td>
<td>${capacity}</td>
<td>${bridges || "-"}</td><td>${kinds || "-"}</td>
</tr>`;
    })
    .join("\n");
  const transferSection = renderTransferTimes(report.transferTimes ?? []);
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
.note p{margin:.55rem 0}
h2{font-size:1.05rem;margin-top:1.8rem}
</style></head><body>
<h1>WOWMAX Aggregation Benchmarks</h1>
<div class="meta">generated ${esc(report.generatedAt)} &middot; commit ${esc(report.gitSha ?? "n/a")} &middot; quotes ${report.totals.ok}/${report.totals.quotes} OK</div>
<table>
<tr>
<th title="source -> destination (chain-token pairs on bridge rows, DEX pair on stellar rows)">pair</th>
<th title="instant = the UI's first price (Near only); all bridges = every bridge quoted in parallel; DEX router = on-chain Stellar swap via the production route">mode</th>
<th title="successful quotes / attempts in this run">ok</th>
<th title="median end-to-end HTTP latency: half of the quotes in the run answered at least this fast">p50 ms</th>
<th title="tail latency: 19 of 20 quotes were faster (on 5 samples per row this is simply the slowest observed quote)">p95 ms</th>
<th title="bridge rows: routes returned per quote; DEX-router rows: hops in the winning route">routes | hops</th>
<th title="how much more the best aggregated route delivers vs the best single alternative in the same response; 1 bp = 0.01%">aggregation gain, bps</th>
<th title="share of routes that arrived with a max-amount depth badge (maxAmountInUsd); n/a for on-chain DEX rows">capacity badge coverage</th>
<th title="which bridges (or Stellar DEX venues) supplied routes across the run; a route split across pools counts once per pool">liquidity sources</th>
<th title="direct = the bridge carries the transfer itself; single-pool / multi-hop (+split when one hop spans several pools) on DEX-router rows">route types</th>
</tr>
${rows}
</table>
<div class="note">
<p>Method: black-box dry quotes against public production endpoints, ${"BENCH_REPS"} repetitions per pair per
mode. Latency is end-to-end HTTP. Raw samples for every run live in report/history/.</p>
<p>Reading the latency columns: p50 is the median - half of the quotes in the run answered at least this fast.
p95 is the tail: 19 of 20 quotes were faster; with the default 5 repetitions per row, p95 is simply the slowest
observed quote of the run.</p>
<p>Bridge rows: "instant" is the UI's first price (Near only); "all bridges" quotes every bridge in parallel,
so its latency is the slowest parallel answer - instant exists to show a price immediately, not to win on
latency. Aggregation gain compares the best aggregated route with the best single alternative in the same
response (0 when only one bridge quotes the pair); more competing bridges usually shrinks this number, which is
aggregation working, not failing. Route types count returned routes per run: "direct" means the bridge carries
the transfer itself; composite routes (bridge + a WOWMAX Stellar swap) will appear here once composite execution
ships in the client. Liquidity-source counts are per fill: a route split across pools contributes one per pool.</p>
<p>Capacity badge coverage is the share of routes that arrived with a max-amount depth badge (maxAmountInUsd -
the figure the UI shows as a route's capacity). Allbridge exposes pool depth directly; Near and Squid publish no
limits, so their badge comes from WOWMAX's own asynchronous capacity probe - coverage below 100% means the probe
cache had not warmed for that route yet, not a routing defect. One unmeasured warm-up quote precedes each pair's
samples so connection setup never lands in the columns.</p>
<p>DEX-router rows measure the production adapter route the web app calls (/chains/100000148/quote, answered from
the router's warm graph snapshot): hops, venue distribution (SDEX / AMMs) and route type - single-pool or multi-hop,
"+split" when a hop is split across pools - come from the returned route. The gain figure there is the router's own
"vs best single pool" figure, taken from one probe per pair of the rich documented /quote endpoint; by the D1
contract that endpoint rebuilds the graph with live reserves on every request, so its latency is deliberately
excluded from the latency columns. Capacity badge coverage does not apply to on-chain DEX routes and is shown
as n/a.</p>
</div>
${transferSection}
</body></html>`;
}
