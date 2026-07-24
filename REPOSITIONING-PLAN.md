# plugin-tereno — Repositioning as a pre-signature security layer (plan)

> Short plan requested before any code change. Scope: reposition `plugin-tereno`
> as a **pre-signature security layer for ElizaOS agents on Base**. Tereno's
> backend stays a closed system (discovery, scoring, reputation, pricing, global
> cache, cooperation, intelligence remain private). The plugin + SDK stay public.
> **No change to Tereno's core architecture; nothing outside this scope.**

## Current state (as-is)

- One file: `src/index.ts` — 11 actions. Depends on `tereno-client` (npm `^0.1.0`).
- **Security actions** (the real product): `TERENO_CHECK_TRANSACTION` (hero, `transaction.intent.guard`), `TERENO_CHECK_CONTRACT`, `TERENO_CONTRACT_CHANGED`, `TERENO_TOKEN_INFO`, `TERENO_CONTRACT_INTERFACE`, `TERENO_CHAIN_SNAPSHOT`, `TERENO_CATALOG` (free).
- **Earn/marketplace actions** (to demote, not delete): `TERENO_BOUNTIES`, `TERENO_SEED`, `TERENO_STANDING`, `TERENO_REPORT_OUTCOME`.
- README leads with *"income while it sleeps"* / *"earn its own safety budget"* — marketplace/passive-income framing at the top.
- Budget caps already exist: `TERENO_MAX_PRICE_USD` (per call, 0.005) + `TERENO_DAILY_BUDGET_USD` (rolling, 0.05).
- Gaps: **no tests, no CI, no `/examples`, no Sepolia quickstart, no dry-run, non-standard verdict return, no telemetry, no registry images/metadata polish.**

## Target positioning

Hero use case: *before an agent signs a Base transaction, it buys a bounded
verdict that flags unlimited approvals, suspicious contracts, unexpected balance
changes and abnormal gas.* The cooperative/earn loop moves to an **"Advanced /
how it stays cheap"** section near the bottom (game theory, shared cache) — kept
for the game-theory story you want at the end, removed from the top.

---

## Changes → affected files (your 12 items)

| # | Item | Files |
|---|---|---|
| 1 | README: security-first | `README.md` |
| 2 | Remove marketplace/passive-income from the top | `README.md` |
| 3 | Working quickstart on **Base Sepolia** | `README.md`, `examples/eliza-base-agent/` |
| 4 | Dry-run mode **or** free first call | `src/index.ts` (new `TERENO_DRY_RUN` + free `TERENO_PREFLIGHT_ECHO`), `README.md` |
| 5 | Standard verdict: `decision, riskLevel, reason, exposure, cost, recommendedAction` | `src/index.ts` (new `normalizeVerdict()` + exported type) |
| 6 | Per-call + daily cost caps | already present — **document + surface in verdict `cost`**; no logic change |
| 7 | Document fail-open / fail-closed; **fail-closed default for financial** | `src/index.ts` (`TERENO_FAIL_MODE`, default `closed`), `README.md`, `SECURITY.md` |
| 8 | Full example | `examples/eliza-base-agent/` (character, `.env.example`, README, run script) |
| 9 | Anonymous telemetry (init, calls, distinct wallets, paid calls, recurrence, cache hit) | `src/index.ts` (opt-out beacon), **tereno**: additive `POST /api/v1/telemetry` + admin panel |
| 10 | Never capture private keys / full prompts / sensitive data | telemetry payload allowlist (hashed wallet only) |
| 11 | Registry metadata, images, tests, build, docs | `package.json` (`agentConfig`, keywords, images), `images/`, `src/*.test.ts`, CI `.github/workflows/` |
| 12 | Issues + small commits | GitHub issues (list below), one commit per item |

### 5 — Standard verdict shape (mapped from Tereno `CapabilityResult`)

```ts
interface TerenoVerdict {
  decision: "allow" | "review" | "block";      // ← verdict
  riskLevel: "none" | "low" | "medium" | "high"; // ← from reasonCodes/risks
  reason: string;                                // ← result.summary + reasonCodes
  exposure: { balanceDeltas?; allowanceChanges?; unlimitedApproval?: boolean };
  cost: { paidUsd: number; capUsd: number; dailySpentUsd: number };
  recommendedAction: "sign" | "review" | "abort";
  raw: CapabilityResult;                         // full passthrough, unchanged
}
```
`normalizeVerdict()` derives these from the existing response; `raw` preserves
today's payload so nothing breaks for current consumers.

### 4 + 7 — Dry-run / free-first + fail modes

- `TERENO_DRY_RUN=true` → actions build the exact input and return a **simulated
  verdict** (no x402 payment), so integrators wire the flow for free.
- Free first touch: `TERENO_CATALOG` stays free; add a free local **echo/preview**
  of what a check would cost and cover before the first paid call.
- `TERENO_FAIL_MODE`: `closed` (default) → on guard error/timeout/budget-exhaustion,
  `recommendedAction: "abort"` for `TERENO_CHECK_TRANSACTION`; `open` → `"review"`.
  Non-financial reads (token/chain) default fail-open.

### 9 + 10 — Telemetry (privacy-preserving)

**Plugin side** (opt-out `TERENO_TELEMETRY=off`): fire-and-forget `POST /api/v1/telemetry`
with a strict allowlist:
```
pluginVersion, walletHash (sha256(address)), checkType, network,
completed (bool), paid (bool), costUsd, cacheHit (bool), repeat (bool), error (enum|null)
```
**Never sent:** private key, full prompt, secrets, sensitive/unnecessary tx content
(only `checkType`, never `data`/`value`). Also send `x-tereno-client: plugin-tereno@<version>`
on invoke calls so the backend can attribute paid settlements to the plugin.

**Tereno side (additive, no core change):** new `POST /api/v1/telemetry` route that
records the allowlisted event, + an admin panel deriving the metric set. Paid
metrics come from the existing settlement ledger (`payer`, `capability`, `priceUsd`).

**Metrics** (primary = **distinct external wallets with paid calls**):
`npm_downloads` (npm API), `plugin_initializations`, `catalog_calls`,
`preflight_checks`, `distinct_wallets`, `paid_calls`, `repeat_buyers_7d`,
`cache_hits_cross_wallet`, `blocked_transactions`, `false_positive_reports`.
Source per metric: ledger (paid_*, distinct wallets, repeat, cache, blocked) vs
beacon (init, catalog, preflight attempts, integration errors, false positives).

---

## Risks

- **Breaking output shape (#5):** current consumers read the text/`data` verdict.
  Mitigation: keep `raw` passthrough + additive fields; bump minor version, note in README.
- **Sepolia quickstart (#3):** needs testnet USDC + a faucet path; verify the guard
  is deployed on `eip155:84532` and prices resolve there.
- **Telemetry privacy (#9/#10):** any field beyond the allowlist is a leak. Mitigation:
  a single typed payload builder + a test asserting no address/key/prompt is included.
- **Fail-closed default (#7):** changing default behavior could surprise integrators
  who relied on best-effort. Mitigation: document loudly; it only strengthens safety.
- **Attribution tag:** header must not carry the wallet in clear beyond what x402 already
  reveals (payer is public on-chain anyway); telemetry wallet is **hashed**.
- **Cross-repo coordination (#9):** the Tereno route is additive and shippable
  independently; the plugin degrades gracefully if the route is absent.

## Execution order (small commits, one issue each)

1. **README rewrite** — security-first hero; demote earn loop to bottom game-theory section. *(docs only, zero risk)*
2. **Standard verdict** — `normalizeVerdict()` + exported `TerenoVerdict`, keep `raw`. *(+tests)*
3. **Fail modes + dry-run + free preview** — `TERENO_FAIL_MODE`, `TERENO_DRY_RUN`.
4. **Cost caps surfacing** — expose caps in `verdict.cost`, document. *(no logic change)*
5. **`examples/eliza-base-agent/`** — full runnable Sepolia example.
6. **Tests + build + CI** — `bun test`, `.github/workflows/ci.yml`.
7. **Registry polish** — `package.json` `agentConfig`/keywords, `images/`, description.
8. **Telemetry beacon (plugin)** — opt-out, hashed wallet, allowlist + privacy test.
9. **Tereno (additive)** — `POST /api/v1/telemetry` + admin metrics panel + client-tag attribution.
10. **Issues** — open the 9 issues (one per step 1–9) and land each as its own commit/PR.

## Explicitly out of scope
- No change to Tereno discovery/scoring/reputation/pricing/global-cache/cooperation
  algorithms (stay private in the backend).
- No new capabilities, no marketplace features, no removal of the earn loop
  (only demoted in docs).
