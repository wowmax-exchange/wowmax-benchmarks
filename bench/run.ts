import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { BRIDGE_PAIRS, STELLAR_PAIRS, BENCH_REPS } from "../src/config.js";
import { bridgeQuote, stellarQuote } from "../src/client.js";
import { summarize, renderHtml, QuoteSample } from "../src/report.js";

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
    for (let i = 0; i < BENCH_REPS; i++) {
      const r = await stellarQuote(pair);
      const w = r.body?.wowmax;
      const advRaw = r.body?.wowmax_advantage?.vs_best_single_pool_bps;
      const stellar =
        r.status === 200 && w && !w.error
          ? {
              hops: Number(w.hops ?? 0),
              routeType: String(w.routeType ?? "unknown"),
              venues: (w.path ?? [])
                .flatMap((g) => g.fills ?? [])
                .reduce<Record<string, number>>((m, f) => {
                  const v = String(f.venue ?? "unknown");
                  m[v] = (m[v] ?? 0) + 1;
                  return m;
                }, {}),
              advantageBps: typeof advRaw === "number" ? advRaw : null,
            }
          : null;
      samples.push({
        pair: pair.name,
        mode: "stellar",
        ms: r.ms,
        status: r.status,
        routes: null,
        stellar,
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
  ];
}

async function main() {
  const fixture = process.env.BENCH_FIXTURE === "1";
  const samples = fixture ? collectFixture() : await collectLive();
  const report = summarize(samples, gitSha());
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
