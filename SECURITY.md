# Security Policy

This plugin signs x402 payments with a wallet private key and talks to paid
endpoints. Security reports are taken seriously and answered quickly.

## Reporting a vulnerability

**Do not open a public issue for vulnerabilities.**

Use GitHub's private reporting:
[Report a vulnerability](https://github.com/RobMartello/plugin-tereno/security/advisories/new)
(Security tab → "Report a vulnerability"). You will get a response within 48
hours.

## Scope notes

- The plugin never transmits the private key anywhere; it is used locally to
  sign x402 payment payloads and EIP-712 messages. If you believe otherwise,
  that is exactly the kind of report we want.
- Spending is bounded by `TERENO_MAX_PRICE_USD` (per call) and
  `TERENO_DAILY_BUDGET_USD` (rolling daily). Bypass of either cap is a
  vulnerability.
- With `TERENO_PRIVATE_ONLY=true`, paid actions must refuse public
  Discord/Telegram/Twitter sources. Bypass is a vulnerability.
- **Fail-closed by default.** With `TERENO_FAIL_MODE=closed` (default), a
  financial check that cannot settle (error, timeout, exhausted budget) returns
  `recommendedAction: "abort"`. No mode ever returns `"sign"` on a failed check.
- **Telemetry is a strict allowlist.** When enabled (opt-out via
  `TERENO_TELEMETRY=off`), the ONLY fields transmitted are: `pluginVersion`,
  `walletHash` (sha256, never the address), `network`, `event`, `checkType`,
  `completed`, `paid`, `costUsd`, `cacheHit`, `repeat`, `error`. Any private key,
  prompt, secret or transaction content appearing in telemetry is a vulnerability.
- Server-side issues (the Tereno API itself) can also be reported here; they
  will be routed to the platform.

## For users

Never share `TERENO_PRIVATE_KEY`, `EVM_PRIVATE_KEY`, seed phrases or your
`.env` — not in issues, not in Discord, not with anyone claiming to help. If
a key leaked, treat the wallet as compromised and move funds immediately.
