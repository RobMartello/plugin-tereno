# Changelog

## 0.4.0

Two independent outages, both silent: the plugin compiled, every test passed and
`dist/` was in sync with `src/`. What had rotted was everything outside it.

### Fixed — the plugin could not buy anything

`TERENO_MAX_PRICE_USD` defaulted to `0.005` while the network moved to
`$0.01–0.05`. `tereno-client` refuses a quote above the cap *before* paying, so
every paid action threw, landed in the catch and returned a fail-verdict. With
the default fail-closed mode that meant the flagship action answered
**`⛔ BLOCK · abort · guard unavailable` to every transaction**, while never
spending a cent.

- `TERENO_MAX_PRICE_USD` default `0.005` → `0.05`
- `TERENO_DAILY_BUDGET_USD` default `0.05` → `0.5` (it was exactly one call)
- `TERENO_PREVIEW` now warns when the configured cap sits below the dearest
  check, instead of letting the agent discover it one failed verdict at a time

### Fixed — four actions returned 401

`tereno-client` was pinned to `0.2.0`, which signed the EIP-712 domain without
the `salt` the server has always required. Every signed route failed with a
plain "Invalid EIP-712 signature", indistinguishable from a real bad signature.
That covered `TERENO_PLEDGE_DEMAND`, `TERENO_SEED`, `TERENO_REPORT_OUTCOME`,
plus `lookup` and `feedback`.

- `tereno-client` `^0.2.0` → `^0.3.0`

### Fixed — advertised prices were 10× behind

Prices were inlined in a dozen description strings, the README and
`TERENO_PREVIEW`. They now come from one exported table, `CAPABILITY_PRICE_USD`,
which `bun test` asserts against `GET /api/v1/capabilities` on the live network.
A price change that is not mirrored here fails CI.

This is the second time this defect shipped (see `fix: reserve the real seed
price and correct stale capability prices`). The test is the stop.

- `TERENO_SEED` reserved `seederEconomics.lifetimeCapUsd` — the ceiling on what
  a seeder can *earn*, not what the call *costs*. It now reserves the
  capability's miss price.

### Added

- `TERENO_CHECK_SWAP` — `aerodrome.swap.guard`. Will this prepared Aerodrome
  swap still satisfy its own encoded limit? Refuses empty calldata locally, so
  the caller is told for free instead of paying to be told.
- `TERENO_CHECK_X402_ENDPOINT` — `x402.endpoint.assurance`. Is another x402
  endpoint callable, well-formed and unchanged since the last observation?
- `TERENO_OBLIGATION_VERDICT` — `obligation.verdict`. Was a published economic
  condition satisfied? Surfaces `decisionGrade: false` rather than hiding it.
- `TERENO_PLEDGE_DEMAND` now lists the capability names Tereno actually
  proposes, read from the catalog. The endpoint accepts any string, so a guessed
  name recorded demand for something that will never be built.

### Changed

- `viem` `^2.52.0` → `^2.56.0`
- The unsigned-transaction parser is shared between the two signing guards, so
  they cannot disagree about what a caller has to send.

### Upgrade note

`tereno-client@0.3.0` must be published before this release installs. The
lockfile still resolves `0.2.1`; run `npm install` once `0.3.0` is on the
registry to regenerate it.
