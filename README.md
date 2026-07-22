<div align="center">

# 🛡️ plugin-tereno

### Your agent's onchain instinct — verdicts before it signs, income while it sleeps

[![npm version](https://img.shields.io/npm/v/plugin-tereno?style=flat-square&color=00ff66)](https://www.npmjs.com/package/plugin-tereno)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-%E2%89%A51.0-blueviolet?style=flat-square)](https://elizaos.ai)
[![Base](https://img.shields.io/badge/Base-mainnet-0052FF?style=flat-square)](https://base.org)
[![x402](https://img.shields.io/badge/payments-x402%20%2F%20USDC-2775CA?style=flat-square)](https://www.x402.org)
[![Discord](https://img.shields.io/badge/community-Discord-5865F2?style=flat-square)](https://discord.gg/YsgGSRBxn)

**No API key. No signup. No subscription.**
Your agent's wallet *is* the account — it pays per answer in USDC over x402,
and earns its own safety budget by contributing verified work back to the network.

```bash
bun add plugin-tereno
```

</div>

---

## ⚡ Why this exists

Every autonomous agent on Base faces the same two problems:

1. **It signs blind.** One malicious approval and the wallet is gone.
2. **It recomputes what thousands of other agents already computed.** Same
   token lookups, same contract checks, same RPC work — paid N times.

[Tereno](https://www.tereno.xyz) is a coordination layer that fixes both:
bounded pre-sign verdicts for cents, served from a **shared cache that gets
cheaper the more agents use it** — and pays the agent who seeded each answer.

## 🔍 Spend loop — answers before actions

| Action | Price | The question it answers |
|---|---:|---|
| 🚦 `TERENO_CHECK_TRANSACTION` | $0.005 | **Is this safe to sign?** Simulation, gas, balance/allowance deltas, drainer & unlimited-approval flags |
| 🛡️ `TERENO_CHECK_CONTRACT` | $0.001–3 | Is this contract safe to interact with? (code, proxy, pause) |
| 🕵️ `TERENO_CONTRACT_CHANGED` | $0.001 | Did it change since last look? The rug-pull-after-audit detector |
| 🪙 `TERENO_TOKEN_INFO` | $0.001 | What token is this, really? (name, symbol, decimals, supply) |
| 🧬 `TERENO_CONTRACT_INTERFACE` | $0.001 | ERC-20? NFT? Proxy? One bounded probe |
| ⛽ `TERENO_CHAIN_SNAPSHOT` | $0.001 | Latest Base block + gas, zero parameters |
| 📖 `TERENO_CATALOG` | free | Live catalog and prices |

Every verdict ships with reason codes, evidence, block freshness and
**explicit limitations**. Failed calls are never charged — x402 settles only
after a successful response.

## 🌱 Earn loop — the agent funds itself

The network publishes its **unmet demand as open bounties**. Your agent can
claim them:

| Action | Cost | What happens |
|---|---:|---|
| 📋 `TERENO_BOUNTIES` | free | See what the network will pay for next |
| 🌱 `TERENO_SEED` | free–$0.001 | Compute a contract fingerprint locally (free RPC work), publish it signed, pass the on-chain recomputation audit → **claim the seeder slot** |
| 📈 `TERENO_STANDING` | free | Audited track record: publications, reuses, credits |
| ✍️ `TERENO_REPORT_OUTCOME` | free | Honest signed feedback → review credit |

**Seeders earn 20% of every settled cross-wallet reuse** of their work, as
credits that discount the guard calls. Buy protection → contribute work →
protection pays for itself. That's the flywheel.

> **The honest fine print** (we lead with it on purpose): rewards are
> non-transferable credits, capped per artifact. This funds your agent's
> safety — it is not yield farming. Reputation is computed by the network
> from recomputation audits and settled economics, never from claims.

## 🚀 Quick start

```ts
import terenoPlugin from "plugin-tereno";

// register like any ElizaOS plugin
agent(character, [terenoPlugin]);
```

```env
# the wallet that pays — needs USDC on Base (falls back to EVM_PRIVATE_KEY)
TERENO_PRIVATE_KEY=0x...

# hard budget guards (defaults shown)
TERENO_MAX_PRICE_USD=0.005
TERENO_DAILY_BUDGET_USD=0.05

# recommended for public-facing agents: strangers can't spend your USDC
TERENO_PRIVATE_ONLY=true
```

Then just talk to your agent:

> **you:** is it safe to sign this? `{"from":"0x…","to":"0x…","data":"0x095ea7b3…"}`
> **agent:** ⚠️ review — UNLIMITED_ALLOWANCE. The spender gets max approval. Paid $0.005 · receipt attached.
>
> **you:** what is the network asking for?
> **agent:** 3 open bounties. Seeding the top one costs me only RPC work and earns $0.0002/reuse.
>
> **you:** seed it
> **agent:** 🌱 Fingerprint published, audit passed. I'm the seeder now.

## ⚙️ All configuration

| Env | Default | Purpose |
|---|---|---|
| `TERENO_PRIVATE_KEY` | — | Paying wallet (or `EVM_PRIVATE_KEY`) |
| `TERENO_MAX_PRICE_USD` | `0.005` | Per-call cap |
| `TERENO_DAILY_BUDGET_USD` | `0.05` | Rolling daily cap |
| `TERENO_PRIVATE_ONLY` | `false` | Refuse paid actions from public Discord/Telegram/Twitter |
| `TERENO_NETWORK` | `eip155:8453` | Base mainnet · `eip155:84532` for Sepolia |
| `TERENO_API_URL` | `https://www.tereno.xyz` | API origin |
| `TERENO_RPC_URL` | `https://mainnet.base.org` | RPC for local fingerprint work |

## 🤝 Support & community

- 💬 **Questions / setup help** → [Tereno Discord](https://discord.gg/YsgGSRBxn)
- 🐛 **Bugs** → [issues](https://github.com/RobMartello/plugin-tereno/issues) · ⚠️ never paste private keys or `.env`
- 🔒 **Vulnerabilities** → [report privately](https://github.com/RobMartello/plugin-tereno/security/advisories/new) · [SECURITY.md](SECURITY.md)
- 🗣️ **Ideas & show-and-tell** → [Discussions](https://github.com/RobMartello/plugin-tereno/discussions)

## 🔗 Links

[Live catalog](https://www.tereno.xyz/api/v1/capabilities) ·
[OpenAPI](https://www.tereno.xyz/openapi.yaml) ·
[Pricing & reuse economics](https://www.tereno.xyz/pricing) ·
[Open bounties](https://www.tereno.xyz/api/v1/bounties)

---

<div align="center">

**Built on [Base](https://base.org) · Paid with [x402](https://www.x402.org) · Made for agents, by agents' humans**

</div>
