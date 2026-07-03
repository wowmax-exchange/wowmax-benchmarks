# WOWMAX Benchmarks

Public, black-box test suite and nightly performance benchmarks for the
WOWMAX aggregation stack: the Stellar DEX router and the multi-bridge
aggregator (Allbridge, Squid/Coral over Axelar GMP, Near Intents).

**Live report:** published to GitHub Pages by the nightly `bench` workflow.

## What this repository is

- End-to-end scenarios that exercise the **same public HTTP surface the web
  app uses** - dry quotes only, nothing is signed or broadcast.
- A benchmark runner measuring, per pair and mode:
  - **quote latency** (p50 / p95, fast vs full aggregation pass);
  - **route quality improvement** - best aggregated route vs the best single
    alternative, in bps;
  - **bridge distribution** and **route types** (direct vs composite);
  - **liquidity-bound coverage** - the share of routes carrying a
    `maxAmountInUsd` capacity estimate.
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
requests to stay polite to production.

## Report anatomy

`report/latest.json` is the machine-readable summary, `report/index.html` the
human one; every raw run is archived under `report/history/`. Latency is
end-to-end HTTP. "Improvement bps" is 0 when only one bridge quotes a pair -
the honest reading is "aggregation premium over the runner-up", not marketing.
