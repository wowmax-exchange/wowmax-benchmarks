// Public production endpoints, exactly as the WOWMAX web app uses them.
// This suite is strictly black-box: it exercises the same HTTP surface a
// browser does and contains no server-side code or credentials.

export const BRIDGE_API =
  process.env.BENCH_BRIDGE_API ?? "https://api-gateway.wowmax.exchange/crosschain";

export const STELLAR_ROUTER =
  process.env.BENCH_STELLAR_ROUTER ?? "https://stellar-router.wowmax.exchange";

export const HTTP_TIMEOUT_MS = 30_000;

// Dry-quote sender/recipient placeholders. Quotes are price-only and commit
// nothing on-chain; these addresses never sign or receive anything. The
// Stellar one is a deterministic, checksum-valid strkey (sha256 of a fixed
// seed phrase) - bridges validate the FORMAT of quote parties, not existence,
// and a malformed placeholder was exactly what produced refusals in run #1.
export const EVM_ADDR = "0x7431F9AD0119109e03f8AcF8E9F0271DF0Cd1a56";
export const STELLAR_ADDR = "GANBQBXTG4IPQAZ7ZSBLL3OL5U4FD7L25QKBIVY3HN2UWPHO7J645KQE";

// Sender must match the SOURCE chain's address family; an EVM sender on a
// Stellar-source pair is rejected by every adapter before pricing.
export const senderFor = (fromChain: string): string =>
  fromChain === "stellar" ? STELLAR_ADDR : EVM_ADDR;

export interface BridgePair {
  name: string;
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
  amount: string;
  sender: string;
  recipient: string;
  /**
   * The fast pass is Near-only by design; on pairs Near does not quote it
   * 404s BY DESIGN and the UI transparently falls back to the full pass.
   * Benchmarking fast where it cannot apply measures nothing - skip it.
   * (Near currently quotes no stellar-USDC pairs via the aggregator; XLM
   * pairs it does. Tracked separately as a near-assetmap follow-up.)
   */
  fastCapable: boolean;
}

// Benchmark basket: stable-denominated, small notionals, both directions
// relative to Stellar. Kept short so a full run stays polite to production.
export const BRIDGE_PAIRS: BridgePair[] = [
  {
    name: "bsc-usdt->eth-usdt",
    fromChain: "bsc",
    fromToken: "USDT",
    toChain: "eth",
    toToken: "USDT",
    amount: "100",
    sender: EVM_ADDR,
    recipient: EVM_ADDR,
    fastCapable: true,
  },
  {
    name: "eth-usdt->stellar-usdc",
    fromChain: "eth",
    fromToken: "USDT",
    toChain: "stellar",
    toToken: "USDC",
    amount: "100",
    sender: EVM_ADDR,
    recipient: STELLAR_ADDR,
    fastCapable: false,
  },
  {
    name: "bsc-usdt->stellar-usdc",
    fromChain: "bsc",
    fromToken: "USDT",
    toChain: "stellar",
    toToken: "USDC",
    amount: "50",
    sender: EVM_ADDR,
    recipient: STELLAR_ADDR,
    fastCapable: false,
  },
  {
    name: "stellar-usdc->eth-usdt",
    fromChain: "stellar",
    fromToken: "USDC",
    toChain: "eth",
    toToken: "USDT",
    amount: "50",
    sender: STELLAR_ADDR,
    recipient: EVM_ADDR,
    fastCapable: false,
  },
];

export interface StellarPair {
  name: string;
  from: string;
  to: string;
  amount: string;
}

export const STELLAR_PAIRS: StellarPair[] = [
  { name: "xlm->usdc", from: "XLM", to: "USDC", amount: "100" },
  { name: "usdc->xlm", from: "USDC", to: "XLM", amount: "20" },
];

// Repetitions per pair per benchmark run. p95 needs samples; production needs
// mercy. 5 x 4 bridge pairs x 2 modes + 5 x 2 stellar pairs = 50 quotes/run.
export const BENCH_REPS = Number(process.env.BENCH_REPS ?? 5);
