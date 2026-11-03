# Example: a Base agent that checks before it acts

**Sentinel** is a minimal ElizaOS agent that runs a [Tereno](https://www.tereno.xyz)
verification check before interacting with Base contracts or prediction questions, and obeys
the verdict's `recommendedAction` (`sign` / `review` / `abort`).

It starts in **dry-run** — every check simulates with **no payment and no wallet** —
so you can see the whole flow for free before spending a cent.

## Run it

```bash
# 1. install the plugin in your ElizaOS project
bun add plugin-tereno

# 2. configure
cp .env.example .env
#   leave TERENO_DRY_RUN=true for the free walkthrough

# 3. start ElizaOS with this character
elizaos start --character ./character.json
```

Then talk to the agent:

```
you:      what can you check and what does it cost?
Sentinel: (TERENO_PREVIEW) coverage, reuse dividends + current config — free

you:      is contract 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 safe to touch?
Sentinel: (TERENO_CHECK_CONTRACT) 🧪 dry-run verdict — no USDC spent

you:      gather evidence for: Will Ethereum Pectra upgrade activate before Q4 2026?
Sentinel: (TERENO_PREDICTION_EVIDENCE) 🧪 input accepted — no USDC spent
```

## Going live

1. Set `TERENO_DRY_RUN=false`.
2. Set `TERENO_PRIVATE_KEY` to a **dedicated hot wallet** (never your main one)
   holding a little USDC on Base.
3. Keep the budget caps and `TERENO_FAIL_MODE=closed` so a failed check aborts
   instead of interacting blind.

## The verdict your agent branches on

```ts
{ decision, riskLevel, reason, exposure, cost, recommendedAction, receiptUrl, raw }
```

`recommendedAction` is the one field to branch on: `sign` → proceed, `review` →
confirm with a human, `abort` → refuse.

## Networks

The hosted Tereno API serves **Base mainnet** (`eip155:8453`). For **Base Sepolia**,
point `TERENO_API_URL` at a Tereno instance running `X402_NETWORK=eip155:84532`
and set `TERENO_NETWORK=eip155:84532`. Dry-run works on any network with no wallet.
