// Public production endpoints, exactly as the WOWMAX web app uses them.
// This suite is strictly black-box: it exercises the same HTTP surface a
// browser does and contains no server-side code or credentials.

export const BRIDGE_API =
  process.env.BENCH_BRIDGE_API ?? "https://api-gateway.wowmax.exchange/crosschain";

export const STELLAR_ROUTER =
  process.env.BENCH_STELLAR_ROUTER ?? "https://stellar-router.wowmax.exchange";

export const HTTP_TIMEOUT_MS = 30_000;

// Dry-quote sender/recipient placeholders. Quotes are price-only and commit
// nothing on-chain; these addresses never sign or receive anything.
export const EVM_ADDR = "0x7431F9AD0119109e03f8AcF8E9F0271DF0Cd1a56";

export interface BridgePair {
  name: string;
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
  amount: string;
  recipient: string;
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
    recipient: EVM_ADDR,
  },
  {
    name: "eth-usdt->stellar-usdc",
    fromChain: "eth",
    fromToken: "USDT",
    toChain: "stellar",
    toToken: "USDC",
    amount: "100",
    recipient: "G_BENCH_PLACEHOLDER",
  },
  {
    name: "bsc-usdt->stellar-usdc",
    fromChain: "bsc",
    fromToken: "USDT",
    toChain: "stellar",
    toToken: "USDC",
    amount: "50",
    recipient: "G_BENCH_PLACEHOLDER",
  },
  {
    name: "stellar-usdc->eth-usdt",
    fromChain: "stellar",
    fromToken: "USDC",
    toChain: "eth",
    toToken: "USDT",
    amount: "50",
    recipient: EVM_ADDR,
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
