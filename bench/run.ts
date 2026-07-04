import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { BRIDGE_PAIRS, STELLAR_PAIRS, BENCH_REPS } from "../src/config.js";
import { bridgeQuote, stellarQuote, stellarRichQuote, adapterRouteSummary } from "../src/client.js";
import { summarize, renderHtml, QuoteSample, TransferTimeRow } from "../src/report.js";
import { toFiniteNumber } from "../src/stats.js";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function gitSha(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function collectLive(): Promise<QuoteSample[]> {
  const samples: QuoteSample[] = [];
  for (const pair of BRIDGE_PAIRS) {
    for (const fast of pair.fastCapable ? [true, false] : [false]) {
      for (let i = 0; i < BENCH_REPS; i++) {
        const r = await bridgeQuote(pair, fast);
        samples.push({
          pair: pair.name,
          mode: fast ? "fast" : "full",
          ms: r.ms,
          status: r.status,
          routes: r.body?._routes ?? null,
        });
        await pause(400);
      }
    }
  }
  for (const pair of STELLAR_PAIRS) {
    // One rich /quote probe per pair: the documented D1 endpoint reports the
    // router's own routing-quality figure (vs best single pool). It is slow
    // by contract - live reserves, full graph rebuild per request - so it is
    // instrumentation only: its latency never enters the latency columns.
    // The figure arrives as a numeric string; coerce, never type-gate.
    const probe = await stellarRichQuote(pair);
    const probeAdv =
      probe.status === 200 && !probe.body?.wowmax?.error
        ? toFiniteNumber(probe.body?.wowmax_advantage?.vs_best_single_pool_bps)
        : null;
    await pause(300);
    // Latency and route shape come from the production adapter path the web
    // app actually calls - answered from the router's warm graph snapshot.
    for (let i = 0; i < BENCH_REPS; i++) {
      const r = await stellarQuote(pair);
      const summary =
        r.status === 200 && !r.body?.error ? adapterRouteSummary(r.body?.routes) : null;
      samples.push({
        pair: pair.name,
        mode: "stellar",
        ms: r.ms,
        status: r.status,
        routes: null,
        stellar: summary ? { ...summary, advantageBps: i === 0 ? probeAdv : null } : null,
      });
      await pause(300);
    }
  }
  return samples;
}

function collectFixture(): QuoteSample[] {
  // Offline mode for CI smoke and local development without network access:
  // builds the report pipeline from a captured production response.
  const fx = JSON.parse(readFileSync("tests/fixtures/quote-compat.json", "utf8"));
  const routes = fx._routes ?? [];
  return [
    { pair: "fixture", mode: "full", ms: 1234, status: 200, routes },
    { pair: "fixture", mode: "full", ms: 1180, status: 200, routes },
    { pair: "fixture", mode: "fast", ms: 610, status: 200, routes: routes.slice(0, 1) },
    // Synthetic DEX-router sample so the offline pipeline also exercises
    // stellar-row aggregation and rendering. The advantage figure goes through
    // the same string coercion production responses need, and the route shape
    // through the same adapter-dialect derivation.
    {
      pair: "fixture-stellar",
      mode: "stellar",
      ms: 480,
      status: 200,
      routes: null,
      stellar: (() => {
        const summary = adapterRouteSummary([
          {
            parts: 10000,
            from: "native",
            swaps: [
              { to: "eurc:issuer", part: 404, market: { id: "CB1", name: "phoenix" } },
              { to: "eurc:issuer", part: 9596, market: { id: "CA2", name: "soroswap" } },
            ],
          },
          {
            parts: 10000,
            from: "eurc:issuer",
            swaps: [{ to: "usdc:issuer", part: 10000, market: { id: "CD3", name: "aqua" } }],
          },
        ]);
        return summary ? { ...summary, advantageBps: toFiniteNumber("12.4") } : null;
      })(),
    },
  ];
}

// Observed end-to-end deliveries from live runs. The benchmark itself is dry
// and never moves funds, so rows come only from recorded real transfers; the
// section stays absent until data/transfer-times.json is seeded.
function loadTransferSeed(): TransferTimeRow[] {
  try {
    const rows = JSON.parse(readFileSync("data/transfer-times.json", "utf8"));
    return Array.isArray(rows) ? (rows as TransferTimeRow[]) : [];
  } catch {
    return [];
  }
}

const FIXTURE_TRANSFERS: TransferTimeRow[] = [
  {
    bridge: "fixture",
    pair: "fixture",
    amountUsd: 100,
    seconds: 187,
    date: "2026-07-04",
    note: "fixture-mode sample row",
  },
];

async function main() {
  const fixture = process.env.BENCH_FIXTURE === "1";
  const samples = fixture ? collectFixture() : await collectLive();
  const transferTimes = fixture ? FIXTURE_TRANSFERS : loadTransferSeed();
  const report = { ...summarize(samples, gitSha()), ...(transferTimes.length > 0 ? { transferTimes } : {}) };
  // Hard reset the output dir: a stale report must be impossible to publish,
  // whatever the runner's workspace contained before this line.
  rmSync("report", { recursive: true, force: true });
  mkdirSync("report/history", { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  writeFileSync(`report/history/${stamp}.json`, JSON.stringify({ report, samples }, null, 2));
  writeFileSync("report/latest.json", JSON.stringify(report, null, 2));
  writeFileSync("report/index.html", renderHtml(report));
  // Branch-served Pages run Jekyll by default; opt out to serve files as-is.
  writeFileSync("report/.nojekyll", "");
  console.log(
    `bench: ${report.totals.ok}/${report.totals.quotes} quotes ok, ${report.pairs.length} pair-modes -> report/index.html`,
  );
  console.log(`bench: generatedAt=${report.generatedAt} commit=${report.gitSha ?? "n/a"}`);
  if (!fixture && report.totals.ok === 0) {
    console.error("bench: zero successful quotes - refusing to publish an empty report");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
