<div align="center">

<img src="images/logo.png" alt="Tereno" width="150" />

# plugin-tereno

### 🛡️ A pre-signature security layer for ElizaOS agents on Base

**Before your agent signs, it checks.** One paid call flags unlimited approvals,
suspicious contracts, unexpected balance changes and abnormal gas — and returns
a single, standardized verdict your agent can branch on.

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

## ⚡ Why this exists

Autonomous agents sign transactions with no instinct for danger. One malicious
approval, one drainer contract, one rug-after-audit, and the wallet is gone.

`plugin-tereno` gives an ElizaOS agent a **pre-signature check**: before it signs
a Base transaction, it buys a bounded verdict from [Tereno](https://www.tereno.xyz)
that simulates the call and flags the ways it could lose funds. **Failed calls are
never charged** — x402 settles only after a successful response.

- **No API key, no signup.** The agent's wallet *is* the identity; it pays a few
  cents per check in USDC over x402.
- **Budget-capped.** Per-call and rolling-daily USDC limits — a chatty agent can't
  drain its wallet.
- **Fail-closed by default.** If the check can't complete, a financial action is
  told to **abort**, not to sign blind.

## 🚦 The core check

```
TERENO_CHECK_TRANSACTION
{"from":"0x…","to":"0x…","data":"0x…","value":"0"}
      │
      ▼
  decision · riskLevel · reason · exposure · cost · recommendedAction
```

Every guard action returns the **same standardized verdict**:

```ts
interface TerenoVerdict {
  decision: "allow" | "review" | "block";
  riskLevel: "none" | "low" | "medium" | "high";
  reason: string;                       // human-readable summary + reason codes
  exposure: {                           // what the tx would change
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

## 🔍 What it checks

| Action | Price | The question it answers |
|---|---:|---|
| 🚦 `TERENO_CHECK_TRANSACTION` | $0.005 | **Is this safe to sign?** Simulation, gas, balance/allowance deltas, drainer & unlimited-approval flags |
| 🛡️ `TERENO_CHECK_CONTRACT` | $0.001–3 | Is this contract safe to interact with? (code, proxy, pause) |
| 🕵️ `TERENO_CONTRACT_CHANGED` | $0.001 | Did it change since last look? (rug-pull-after-audit detector) |
| 🪙 `TERENO_TOKEN_INFO` | $0.001 | What token is this, really? (name, symbol, decimals, supply) |
| 🧬 `TERENO_CONTRACT_INTERFACE` | $0.001 | ERC-20? NFT? Proxy? One bounded probe |
| ⛽ `TERENO_CHAIN_SNAPSHOT` | $0.001 | Latest Base block + gas, zero parameters |
| 🧾 `TERENO_PREVIEW` | free | What the checks cover, cost and current config |
| 📖 `TERENO_CATALOG` | free | Live catalog and prices |

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
//   is it safe to sign {"from":"0x…","to":"0x…","data":"0x…"}?
// → returns a TerenoVerdict with recommendedAction, no USDC spent.
```

A complete runnable agent lives in [`examples/eliza-base-agent`](./examples/eliza-base-agent).

### Going live

```bash
TERENO_DRY_RUN=false
TERENO_PRIVATE_KEY=0x…        # a dedicated hot wallet with a little USDC on Base
TERENO_MAX_PRICE_USD=0.005    # per-call cap
TERENO_DAILY_BUDGET_USD=0.05  # rolling daily cap
TERENO_FAIL_MODE=closed       # financial checks abort if the guard can't answer
```

> **Networks.** The hosted Tereno API (`www.tereno.xyz`) serves **Base mainnet**.
> To try it on **Base Sepolia**, point `TERENO_API_URL` at a Tereno instance
> configured with `X402_NETWORK=eip155:84532` (self-host) and set
> `TERENO_NETWORK=eip155:84532`. Dry-run works on any network with no wallet.

Then just talk to your agent:

> **you:** is it safe to sign this? `{"from":"0x…","to":"0x…","data":"0x095ea7b3…"}`
> **agent:** ⛔ BLOCK · risk high · → abort — UNLIMITED_ALLOWANCE: the spender gets max approval. Paid $0.005 · receipt attached.

## ⚙️ Configuration

| Env | Default | Purpose |
|---|---|---|
| `TERENO_PRIVATE_KEY` | — | Wallet that pays x402 (USDC on Base). Falls back to `EVM_PRIVATE_KEY`. |
| `TERENO_MAX_PRICE_USD` | `0.005` | Per-call USDC cap. |
| `TERENO_DAILY_BUDGET_USD` | `0.05` | Rolling daily USDC budget. |
| `TERENO_FAIL_MODE` | `closed` | `closed` → financial checks abort on failure; `open` → degrade to review. |
| `TERENO_DRY_RUN` | `false` | `true` → no payment, simulated verdict. |
| `TERENO_PRIVATE_ONLY` | `false` | `true` → refuse paid actions from public Discord/Telegram/Twitter. |
| `TERENO_NETWORK` | `eip155:8453` | `eip155:8453` (mainnet) or `eip155:84532` (Sepolia). |
| `TERENO_API_URL` | `https://www.tereno.xyz` | API origin. |
| `TERENO_RPC_URL` | `https://mainnet.base.org` | RPC for local fingerprint work. |
| `TERENO_TELEMETRY` | `on` | `off` → send no anonymous usage telemetry. |

### Fail-open vs fail-closed

- **`closed` (default, for financial actions):** if the guard errors, times out, or
  the daily budget is spent, `TERENO_CHECK_TRANSACTION` returns
  `recommendedAction: "abort"`. The agent does **not** sign what it couldn't verify.
- **`open`:** the same situations degrade to `recommendedAction: "review"`. Even
  open mode never returns `"sign"` on a failed check — a human or policy decides.
- Non-financial reads (token/chain/interface) always degrade to `review`.

## 🔐 Privacy & telemetry

The plugin **never transmits your private key, prompts, secrets or transaction
content** anywhere. The key is used locally to sign x402 payments and EIP-712
messages only.

Anonymous, opt-out telemetry (`TERENO_TELEMETRY=off` to disable) sends a strict
allowlist to help improve the network: plugin version, a **hashed** wallet
(`sha256`, never the address), network, check type, whether the call completed and
was paid, its USD cost, cache-hit, a repeat flag, and an integration-error flag.
Nothing else. See [`SECURITY.md`](./SECURITY.md).

---

## 🌱 How it stays cheap — the cooperative layer (advanced)

Tereno is a **shared-cache coordination layer**, not just an API. The first agent
to pay for a given piece of verified work *seeds* it for the whole network; every
later agent that reuses that answer pays less, and the seeder earns a small,
non-transferable credit that discounts its own future checks.

The game theory: safety is a public good with a private cost. By making the first
computation earn from every reuse, the network turns *"I paid to check this
contract"* into *"I lowered the price of checking it for everyone, and my own
checks got cheaper."* More agents ⇒ deeper cache ⇒ cheaper, faster verdicts ⇒
more agents.

Advanced actions expose this loop — you never need them to use the security
checks above:

| Action | Cost | What it does |
|---|---:|---|
| `TERENO_BOUNTIES` | free | See the work the network will pay to have seeded next |
| `TERENO_SEED` | free/$0.001 | Seed a bounty (publish a signed fingerprint, or be first payer) |
| `TERENO_STANDING` | free | The agent's audited track record and earned credits |
| `TERENO_REPORT_OUTCOME` | free | Attach a signed outcome to a settled verdict |

> The honest fine print: rewards are **non-transferable credits**, capped per
> artifact — they fund your agent's safety budget, they are not yield. Reputation
> is computed by the network from recomputation audits and settled economics,
> never from claims.

Discovery, scoring, reputation, pricing, the global cache and cooperation logic
live in the **closed Tereno backend**. This plugin and its SDK
([`tereno-client`](https://www.npmjs.com/package/tereno-client)) are the public,
open interface to it.

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

**[tereno.xyz](https://www.tereno.xyz)** · Verdicts before signatures, for agents on Base.

</div>
