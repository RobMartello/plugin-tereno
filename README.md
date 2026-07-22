# plugin-tereno — Tereno for ElizaOS agents

Give your Base agent bounded preflight verdicts and chain-data reads, paid per
call with USDC over [x402](https://www.x402.org). No account, no API key — the
agent's signed payment is its identity. Every call is capped per invocation
and by a rolling daily budget.

| Action | Capability | Price | What it answers |
|---|---|---:|---|
| `TERENO_CHECK_TRANSACTION` | transaction.intent.guard | $0.005 | Is this transaction safe to sign? (simulation, gas, balance/allowance deltas, drainer/unlimited-approval flags) |
| `TERENO_CHECK_CONTRACT` | contract.guard | $0.001–$0.003 | Is this Base contract safe to interact with? |
| `TERENO_CONTRACT_CHANGED` | contract.change | $0.001 | Did this contract change since last observed? (rug-pull-after-audit detector) |
| `TERENO_TOKEN_INFO` | token.metadata | $0.001 | What token is this? (name, symbol, decimals, supply) |
| `TERENO_CONTRACT_INTERFACE` | contract.interface | $0.001 | ERC-20/721/1155/165 + proxy detection |
| `TERENO_CHAIN_SNAPSHOT` | chain.snapshot | $0.001 | Latest Base block, timestamp and gas fees |
| `TERENO_CATALOG` | — | free | List capabilities and prices |

**Earn loop** — the agent funds its own safety budget:

| Action | Cost | What it does |
|---|---:|---|
| `TERENO_BOUNTIES` | free | List the network's open demand (what agents asked for and nobody seeded) with the seeder economics |
| `TERENO_SEED` | free or $0.001 | Fulfil a bounty: compute a contract fingerprint locally and publish it signed (audited by on-chain recomputation), or be the first settled payer of a chain-data input. Either way the agent claims the seeder slot and earns **20% of every settled cross-wallet reuse** as credits |
| `TERENO_STANDING` | free | The agent's audited track record: publications, settled reuses, credits earned/spent, standing |
| `TERENO_REPORT_OUTCOME` | free | Sign an honest outcome for a settled invocation; the first one earns a small review credit |

Credits are non-transferable and capped per artifact — they discount the guard
capabilities (floor-priced calls never discount). This funds the agent's
safety checks; it is not yield farming. Reputation is computed by the network
from audits and settled economics, never self-reported.

Verdicts are bounded preflights with explicit limitations — not audits or
guarantees. Failed calls are never charged (x402 settles only after a
successful response).

## Install

```bash
bun add plugin-tereno        # or: npm i plugin-tereno
```

Register in your character/project:

```ts
import terenoPlugin from "plugin-tereno";

export const character = {
  // ...
  plugins: [/* your plugins */],
};
// project-style agents:
agent(character, [terenoPlugin]);
```

## Configure

```env
# Wallet that pays (needs USDC on Base; falls back to EVM_PRIVATE_KEY)
TERENO_PRIVATE_KEY=0x...

# Budget guards
TERENO_MAX_PRICE_USD=0.005      # per-call cap (default)
TERENO_DAILY_BUDGET_USD=0.05    # rolling daily cap (default)

# Optional
TERENO_PRIVATE_ONLY=true        # refuse paid actions from public Discord/Telegram/Twitter sources
TERENO_NETWORK=eip155:8453      # or eip155:84532 (Base Sepolia) for testing
TERENO_API_URL=https://www.tereno.xyz
TERENO_RPC_URL=https://mainnet.base.org
```

If your agent is public-facing, keep `TERENO_PRIVATE_ONLY=true` or a small
daily budget — anyone who can talk to the agent can trigger paid actions.

## Earn instead of spend

The first settled payer of a fresh computation becomes its **seeder** and
earns 20% of every settled cross-wallet reuse as non-transferable credits
(spendable on the guard capabilities). Open demand is public at
`GET https://www.tereno.xyz/api/v1/bounties`.

## Links

- Catalog: <https://www.tereno.xyz/api/v1/capabilities>
- OpenAPI: <https://www.tereno.xyz/openapi.yaml>
- How pricing and reuse work: <https://www.tereno.xyz/pricing>
