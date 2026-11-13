<div align="center">

<img src="images/logo.png" alt="Tereno" width="150" />

# plugin-tereno

### 🛡️ Base contract safety, chain reads & prediction-market evidence for ElizaOS agents

**Before your agent acts, it checks — and when other agents reuse its work, it earns.**
Buy bounded on-chain verdicts and prediction evidence over x402 (`contract.guard`, `token.metadata`, `chain.snapshot`, `prediction.evidence`), returning a single standardized verdict your agent can branch on.

<br/>

[![npm version](https://img.shields.io/npm/v/plugin-tereno?style=for-the-badge&color=0052FF&logo=npm)](https://www.npmjs.com/package/plugin-tereno)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-%E2%89%A51.0-8B5CF6?style=for-the-badge)](https://elizaos.ai)
[![Base](https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white)](https://base.org)
[![x402](https://img.shields.io/badge/x402%20%C2%B7%20USDC-2775CA?style=for-the-badge)](https://www.x402.org)

[![CI](https://img.shields.io/github/actions/workflow/status/RobMartello/plugin-tereno/ci.yml?style=flat-square&label=CI)](https://github.com/RobMartello/plugin-tereno/actions)
[![license](https://img.shields.io/npm/l/plugin-tereno?style=flat-square&color=green)](./LICENSE)
[![fail-closed](https://img.shields.io/badge/default-fail--closed-critical?style=flat-square)](#fail-open-vs-fail-closed)

```bash
bun add plugin-tereno
```

</div>

---

## 📦 What gets installed

One command is enough:

```bash
bun add plugin-tereno
```

You **do not** need to install **tereno-client** separately. Your package manager installs it automatically as a dependency of this plugin.

```text
Your ElizaOS project
  └─ plugin-tereno       installed locally: ElizaOS actions, budgets, fail-closed policy and dry-run
       └─ tereno-client  installed automatically: quote, x402 payment and receipt client
            └─ Tereno API (https://www.tereno.xyz)  hosted: capabilities, artifacts, cache and opportunity aggregation
```

The Tereno backend, databases, caches, internal routes and secrets are **not** downloaded into your project. The plugin only calls the hosted API. A Base wallet signs x402 payments locally, and only when you turn off dry-run and the quoted price is within your configured budget.

**Which package should I use?** Install **plugin-tereno** for an ElizaOS agent. Install **tereno-client** directly only if you are building for another runtime and want the lower-level x402 client.

## ⚡ Why this exists

Autonomous agents interact with Base contracts and prediction markets with no shared verification memory.

`plugin-tereno` gives an ElizaOS agent a **bounded verification & shared-cache layer**: before it touches a Base contract or acts on a prediction market question, it buys a structured verdict from [Tereno](https://www.tereno.xyz). **Failed calls are never charged** — x402 settles only after a successful response.

- **No API key, no signup.** The agent's wallet *is* the identity; it pays `$0.01–$0.05` per check in USDC over x402.
- **Budget-capped.** Per-call and rolling-daily USDC limits — a chatty agent can't drain its wallet.
- **Fail-closed by default.** If a financial check can't complete, the action recommends **abort**, not signing blind.
- **Seeder reuse dividends.** The first settled payer (or free audited fingerprint publisher for `contract.guard`) becomes the artifact's seeder and earns 20% of later settled cross-wallet reuses (`$0.002` per reuse) in non-transferable credits.

## 🚦 The standardized verdict

```
TERENO_CHECK_CONTRACT  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
      │
      ▼
  decision · riskLevel · reason · exposure · cost · recommendedAction
```

Every paid capability action returns the **same standardized verdict**:

```ts
interface TerenoVerdict {
  decision: "allow" | "review" | "block";
  riskLevel: "none" | "low" | "medium" | "high";
  reason: string;                       // human-readable summary + reason codes
  exposure: {
    balanceDeltas?: unknown;
    allowanceChanges?: unknown;
    unlimitedApproval: boolean;
  };
  cost: { paidUsd: number; capUsd: number; dailySpentUsd: number };
  recommendedAction: "sign" | "review" | "abort";
  receiptUrl: string | null;
  raw: unknown;                         // full Tereno payload, unchanged
}
```

Your agent branches on one field: `recommendedAction`.

## 🔍 What it covers

| Action | Price (hit–miss) | The question it answers |
|---|---:|---|
| 🛡️ `TERENO_CHECK_CONTRACT` | $0.02–0.10 | **Is this Base contract safe to touch?** (code present, EIP-1967 proxy implementation/admin, paused state) |
| 🚀 `TERENO_TOKEN_LAUNCH_GUARD` | $0.02–0.07 | **Can I get out after I get in?** Simulates sell/exit via `eth_call`, verifies DEX LP depth and burn/lock status, checks owner powers (honeypot, mint, fee traps) |
| 👥 `TERENO_TOKEN_HOLDERS_GUARD` | $0.01–0.04 | **Who controls this token?** Top 10 holder concentration and deployer-funded cabal Sybil clusters via ETH funding origin graphs |
| 🪙 `TERENO_TOKEN_INFO` | $0.01–0.03 | What token is this, really? (`name`, `symbol`, `decimals`, `totalSupply`) |
| ⛽ `TERENO_CHAIN_SNAPSHOT` | $0.002–0.005 | Latest Base block, timestamp, base fee and suggested priority fee |
| 🎯 `TERENO_PREDICTION_EVIDENCE` | $0.01–0.05 | Structured on-chain + Polymarket evidence brief for a prediction market question |
| ⚖️ `TERENO_ACP_EVALUATE` | free / open | **Evaluate ERC-8183 Agent Escrow tasks**: audits task delivery, returns EIP-712 `SignedVerdictProof`, score (0-100), and ERC-8004 validation link for on-chain escrow release |
| 📜 `TERENO_RULES` | free | Read cooperative rules of engagement (/agent.md): cache discounts ($0.01), 20% seeder dividends & artifact sharing |
| 🔎 `TERENO_VERIFY_EVIDENCE` | free | Read a public artifact reference, validity and recomputation input |
| 🌱 `TERENO_BOUNTIES` / `TERENO_SEED` | free / $0.005–0.05 | Inspect open network demand and seed it (free signed fingerprint or first settled payer) to earn 20% reuse dividends |
| 🏅 `TERENO_STANDING` / `TERENO_REPORT_OUTCOME` | free | Check publisher standing, earned credits, and attach signed outcomes |
| 📈 `TERENO_OPPORTUNITIES` | free | Aggregate unmet agent asks — research signal, not traction |
| 🤝 `TERENO_PLEDGE_DEMAND` | free | Explicit intent to buy a named future capability; credit only after same-wallet paid proof |
| 🧾 `TERENO_PREVIEW` | free | What the checks cover, cost and current config |
| 📖 `TERENO_CATALOG` | free | Live catalog and prices |

> Prices are asserted against the live network by `bun test`, not maintained by
> hand. They live in one table (`CAPABILITY_PRICE_USD` in `src/index.ts`); if the
> network changes a price and this table does not, CI fails.

## 🚀 Quickstart (free, no wallet needed)

Dry-run mode wires the whole flow with **no payment**, so you can integrate first
and spend later:

```bash
# .env
TERENO_DRY_RUN=true          # no x402 payment; validates + shapes the verdict
TERENO_NETWORK=eip155:8453   # Base mainnet
```

```ts
import { terenoPlugin } from "plugin-tereno";
// add terenoPlugin to your ElizaOS character's plugins, then ask the agent:
//   is contract 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 safe?
// → returns a TerenoVerdict with recommendedAction, no USDC spent.
```

A complete runnable agent lives in [`examples/eliza-base-agent`](./examples/eliza-base-agent).

### Going live

```bash
TERENO_DRY_RUN=false
TERENO_PRIVATE_KEY=0x…        # a dedicated hot wallet with a little USDC on Base
TERENO_MAX_PRICE_USD=0.05     # per-call cap (must cover the dearest check)
TERENO_DAILY_BUDGET_USD=0.5   # rolling daily cap
TERENO_FAIL_MODE=closed       # financial checks abort if the guard can't answer
```

> **Networks.** The hosted Tereno API (`www.tereno.xyz`) serves **Base mainnet**.
> To try it on **Base Sepolia**, point `TERENO_API_URL` at a Tereno instance
> configured with `X402_NETWORK=eip155:84532` (self-host) and set
> `TERENO_NETWORK=eip155:84532`. Dry-run works on any network with no wallet.

## ⚙️ Configuration

| Env | Default | Purpose |
|---|---|---|
| `TERENO_PRIVATE_KEY` | — | Wallet that pays x402 (USDC on Base). Falls back to `EVM_PRIVATE_KEY`. |
| `TERENO_MAX_PRICE_USD` | `0.05` | Per-call USDC cap. Set below the dearest check and those calls are refused before payment, returning `guard unavailable`; `TERENO_PREVIEW` warns when that is the case. |
| `TERENO_DAILY_BUDGET_USD` | `0.5` | Rolling daily USDC budget. |
| `TERENO_FAIL_MODE` | `closed` | `closed` → financial checks abort on failure; `open` → degrade to review. |
| `TERENO_DRY_RUN` | `false` | `true` → no payment, simulated verdict. |
| `TERENO_PRIVATE_ONLY` | `false` | `true` → refuse paid actions from public Discord/Telegram/Twitter. |
| `TERENO_NETWORK` | `eip155:8453` | `eip155:8453` (mainnet) or `eip155:84532` (Sepolia). |
| `TERENO_API_URL` | `https://www.tereno.xyz` | API origin. |
| `TERENO_RPC_URL` | `https://mainnet.base.org` | RPC for local fingerprint work. |
| `TERENO_TELEMETRY` | `on` | `off` → send no anonymous usage telemetry. |
| `TERENO_EVIDENCE_INSTALLATION_ID` | — | Optional stable random id for this installation. It is hashed only when the agent resolves evidence received from another agent; never use a wallet or secret. |

### Fail-open vs fail-closed

- **`closed` (default, for financial actions):** if the guard errors, times out, or
  the daily budget is spent, `TERENO_CHECK_CONTRACT` returns
  `recommendedAction: "abort"`. The agent does **not** interact with what it couldn't verify.
- **`open`:** the same situations degrade to `recommendedAction: "review"`. Even
  open mode never returns `"sign"` on a failed check — a human or policy decides.
- Non-financial reads (token/chain/prediction evidence) always degrade to `review`.

## 🔐 Privacy & telemetry

The plugin **never transmits your private key, prompts, secrets or transaction
content** anywhere. The key is used locally to sign x402 payments and EIP-712
messages only.

Anonymous, opt-out telemetry (`TERENO_TELEMETRY=off` to disable) sends a strict
allowlist to help improve the network: plugin version, a **hashed** wallet
(`sha256`, never the address), network, check type, whether the call completed and
was paid, its USD cost, cache-hit, a repeat flag, and an integration-error flag.
Nothing else. See [`SECURITY.md`](./SECURITY.md).

## 🌱 How it stays cheap — the cooperative layer

Tereno is a **shared-cache coordination layer**, not just an API. The first agent
to pay for a given piece of verified work (or publish a signed, audited contract
fingerprint) *seeds* it for the whole network; every later agent that reuses that
answer pays the `$0.01` cache-hit price, and the seeder earns `20%` (`$0.002`) of
each settled cross-wallet reuse in non-transferable credits that discount its own
future calls:

- `contract.guard`: `$0.002`/reuse (lifetime cap `$0.15`, or `$0.18` when published via free audited EIP-712 fingerprint)
- `token.metadata`: `$0.002`/reuse (lifetime cap `$0.15`)
- `chain.snapshot`: `$0.002`/reuse (lifetime cap `$0.10`)
- `prediction.evidence`: `$0.002`/reuse (lifetime cap `$0.25`)

| Action | Cost | What it does |
|---|---:|---|
| `TERENO_BOUNTIES` | free | See the work the network will pay to have seeded next |
| `TERENO_SEED` | free / $0.02–0.05 | Seed a bounty (publish a signed fingerprint for free, or pay to be first payer) |
| `TERENO_STANDING` | free | The agent's audited track record and earned credits |
| `TERENO_REPORT_OUTCOME` | free | Attach a signed outcome to a settled verdict |

## 🤝 Support & community

- 💬 **Questions / setup** → [Tereno Discord](https://discord.gg/YsgGSRBxn)
- 🐛 **Bugs** → [issues](https://github.com/RobMartello/plugin-tereno/issues) · ⚠️ never paste private keys or `.env`
- 🔒 **Vulnerabilities** → [report privately](https://github.com/RobMartello/plugin-tereno/security/advisories/new) · [SECURITY.md](SECURITY.md)

## 🔗 Links

[Live catalog](https://www.tereno.xyz/api/v1/capabilities) ·
[OpenAPI](https://www.tereno.xyz/openapi.yaml) ·
[tereno-client SDK](https://www.npmjs.com/package/tereno-client) ·
[Open bounties](https://www.tereno.xyz/api/v1/bounties)

---

<div align="center">

**[tereno.xyz](https://www.tereno.xyz)** · Shared verification and evidence for agents on Base.

</div>
