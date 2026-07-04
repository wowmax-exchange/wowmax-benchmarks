# WOWMAX Benchmarks

[![ci](https://github.com/wowswap-io/wowmax-benchmarks/actions/workflows/ci.yml/badge.svg)](https://github.com/wowswap-io/wowmax-benchmarks/actions/workflows/ci.yml)
[![bench](https://github.com/wowswap-io/wowmax-benchmarks/actions/workflows/bench.yml/badge.svg)](https://github.com/wowswap-io/wowmax-benchmarks/actions/workflows/bench.yml)

Public, black-box test suite and nightly performance benchmarks for the
WOWMAX aggregation stack: the Stellar DEX router and the multi-bridge
aggregator (Allbridge, Squid/Coral over Axelar GMP, Near Intents).

**Live report:** published to GitHub Pages by the nightly `bench` workflow.

## What this repository is

- End-to-end scenarios that exercise the **same public HTTP surface the web
  app uses** - dry quotes only, nothing is signed or broadcast.
- A benchmark runner measuring, per pair and mode:
  - **quote latency** (p50 / p95; bridge pairs in the fast vs full
    aggregation pass, stellar pairs on the production adapter route the web
    app calls - `/chains/100000148/quote`, answered from the router's warm
    graph snapshot);
  - **route quality improvement** - best aggregated route vs the best single
    alternative, in bps; on stellar rows this is the router's own "vs best
    single pool" figure from one probe per pair of the rich documented
    `/quote` endpoint, which by the D1 contract rebuilds the graph with live
    reserves per request - deliberately slow, so its latency never enters the
    latency columns;
  - **bridge distribution** and **route types** (direct vs composite);
  - **liquidity-bound coverage** - the share of routes carrying a
    `maxAmountInUsd` capacity estimate;
  - **bridge transfer times** - end-to-end delivery of real transfers
    observed during live runs, seeded from `data/transfer-times.json`
    (the quote suite itself is dry and never moves funds; the section is
    absent until seeded).
- Unit tests for the statistics and report pipeline itself.

## What it deliberately is not

No routing algorithms, no server code, no credentials. The suite treats
production as a black box; a fresh clone anywhere on the internet reproduces
the same numbers.

## Running

```bash
npm ci
npm run test:unit    # offline: stats + report pipeline
npm run test:e2e     # live scenarios against production endpoints
npm run bench        # full benchmark -> report/index.html + report/latest.json
BENCH_FIXTURE=1 npm run bench   # offline pipeline smoke from a captured response
```

`BENCH_REPS` (default 5) controls repetitions per pair; the runner paces
requests to stay polite to production. The fast mode (Near-only instant
quote) is benchmarked only on pairs Near actually quotes: on other pairs a
fast 404 is by-design behaviour - the UI falls back to the full pass - and
measuring it would count design as failure.

## Report anatomy

`report/latest.json` is the machine-readable summary, `report/index.html` the
human one; every raw run is archived under `report/history/`. Latency is
end-to-end HTTP: "p50" is the median - half of the quotes in the run answered
at least this fast; "p95" is the tail - 19 of 20 quotes were faster, and with
the default 5 repetitions per row it is simply the slowest observed quote.
"Improvement bps" is 0 when only one bridge quotes a pair -
the honest reading is "aggregation premium over the runner-up", not marketing.
