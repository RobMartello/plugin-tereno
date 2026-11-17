import { afterEach, describe, expect, test } from "bun:test";
import {
  normalizeVerdict,
  failVerdict,
  telemetryPayload,
  TELEMETRY_KEYS,
  terenoPlugin,
  CAPABILITY_PRICE_USD,
  DEFAULT_MAX_PRICE_USD,
  DEFAULT_DAILY_BUDGET_USD,
  dearestCapabilityUsd,
  priceLabel,
} from "./index.ts";

const COST = { capUsd: 0.05, dailySpentUsd: 0.01 };
const BASE = "https://www.tereno.xyz";

const originalEnv = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env))
    if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe("normalizeVerdict", () => {
  test("allow → sign / risk none", () => {
    const v = normalizeVerdict(
      { verdict: "allow", result: { summary: "ok" }, pricing: { pricePaidUsd: 0.01 } } as never,
      COST,
      BASE,
    );
    expect(v.decision).toBe("allow");
    expect(v.recommendedAction).toBe("sign");
    expect(v.riskLevel).toBe("none");
    expect(v.cost.paidUsd).toBe(0.01);
  });

  test("block → abort / risk high", () => {
    const v = normalizeVerdict({ verdict: "block", result: { summary: "drainer" } } as never, COST, BASE);
    expect(v.decision).toBe("block");
    expect(v.recommendedAction).toBe("abort");
    expect(v.riskLevel).toBe("high");
  });

  test("unknown verdict is treated as review (fail-safe)", () => {
    const v = normalizeVerdict({ result: {} } as never, COST, BASE);
    expect(v.decision).toBe("review");
    expect(v.recommendedAction).toBe("review");
  });

  test("unlimited-approval reason code flips exposure + medium risk", () => {
    const v = normalizeVerdict(
      { verdict: "review", result: { reasonCodes: ["UNLIMITED_ALLOWANCE"] } } as never,
      COST,
      BASE,
    );
    expect(v.exposure.unlimitedApproval).toBe(true);
    expect(v.riskLevel).toBe("medium");
  });

  test("a high-severity risk yields high risk level", () => {
    const v = normalizeVerdict(
      { verdict: "review", result: { risks: [{ severity: "high", code: "PROXY_UPGRADE" }] } } as never,
      COST,
      BASE,
    );
    expect(v.riskLevel).toBe("high");
  });

  test("preserves the raw payload and builds a receipt url", () => {
    const raw = { verdict: "allow", receiptUrl: "/api/v1/receipts/abc" };
    const v = normalizeVerdict(raw as never, COST, BASE);
    expect(v.raw).toBe(raw as never);
    expect(v.receiptUrl).toBe(`${BASE}/api/v1/receipts/abc`);
  });
});

describe("failVerdict (fail-open / fail-closed)", () => {
  test("financial + closed (default) → abort", () => {
    const v = failVerdict("guard down", true);
    expect(v.decision).toBe("block");
    expect(v.recommendedAction).toBe("abort");
    expect(v.cost.paidUsd).toBe(0); // nothing charged
  });

  test("financial + open → review (never auto-sign)", () => {
    process.env.TERENO_FAIL_MODE = "open";
    const v = failVerdict("guard down", true);
    expect(v.recommendedAction).toBe("review");
    expect(v.recommendedAction).not.toBe("sign");
  });

  test("non-financial read → review", () => {
    const v = failVerdict("guard down", false);
    expect(v.recommendedAction).toBe("review");
  });
});

describe("telemetryPayload (privacy allowlist)", () => {
  test("emits exactly the allowlisted keys, nothing else", () => {
    const p = telemetryPayload(
      { event: "check", checkType: "contract.guard", completed: true, paid: true, costUsd: 0.01 },
      "deadbeefhash",
      "eip155:8453",
    );
    expect(Object.keys(p).sort()).toEqual([...TELEMETRY_KEYS].sort());
  });

  test("never contains a raw address, key, or prompt", () => {
    const p = telemetryPayload(
      { event: "check", checkType: "contract.guard" },
      "9f86d081884c7d659a2feaa0c55ad015", // sha256-style hash, not an address
      "eip155:8453",
    );
    const serialized = JSON.stringify(p);
    expect(serialized).not.toMatch(/0x[a-fA-F0-9]{40}/); // no EVM address
    expect(serialized).not.toMatch(/0x[a-fA-F0-9]{64}/); // no private key
    expect(p.walletHash).toBe("9f86d081884c7d659a2feaa0c55ad015");
  });

  test("carries the plugin version for attribution", () => {
    const p = telemetryPayload({ event: "init" }, null, "eip155:8453");
    expect(typeof p.pluginVersion).toBe("string");
  });
});

describe("plugin surface", () => {
  test("exposes the 4 active capabilities plus verification, cooperative and demand actions", () => {
    const names = (terenoPlugin.actions ?? []).map((action) => action.name);
    expect(names).toContain("TERENO_CHECK_CONTRACT");
    expect(names).toContain("TERENO_TOKEN_INFO");
    expect(names).toContain("TERENO_CHAIN_SNAPSHOT");
    expect(names).toContain("TERENO_PREDICTION_EVIDENCE");
    expect(names).toContain("TERENO_VERIFY_EVIDENCE");
    expect(names).toContain("TERENO_RULES");
    expect(names).toContain("TERENO_BOUNTIES");
    expect(names).toContain("TERENO_SEED");
    expect(names).toContain("TERENO_OPPORTUNITIES");
    expect(names).toContain("TERENO_PLEDGE_DEMAND");
    expect(names).not.toContain("TERENO_CHECK_TRANSACTION");
    expect(names).not.toContain("TERENO_CHECK_SWAP");
    expect(names).not.toContain("TERENO_COMPILE_WEB_PAGE");
  });

  test("dry-run makes a paid action available without a wallet", async () => {
    process.env.TERENO_DRY_RUN = "true";
    delete process.env.TERENO_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;
    const action = (terenoPlugin.actions ?? []).find((item) => item.name === "TERENO_CHECK_CONTRACT");
    expect(action).toBeDefined();
    await expect(
      action!.validate!({} as never, { content: { text: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", source: "discord" } } as never),
    ).resolves.toBe(true);
  });
});

// ————— Price drift (the defect that shipped twice) —————
//
// These tests read the network. When the network is unreachable they skip with
// a message rather than fail, so working offline stays possible; CI has network,
// which is where the gate has to hold.

const CATALOG_URL =
  (process.env.TERENO_API_URL?.trim() || "https://www.tereno.xyz") + "/api/v1/capabilities";

interface LiveCatalog {
  capabilities: {
    id: string;
    pricing: { cacheHitUsd: number; cacheMissUsd: number };
  }[];
}

async function liveCatalog(): Promise<LiveCatalog | null> {
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as LiveCatalog;
  } catch {
    return null;
  }
}

describe("advertised prices match the live network", () => {
  test("every price this plugin quotes is the price the network charges", async () => {
    const catalog = await liveCatalog();
    if (!catalog) {
      console.warn(`[skip] ${CATALOG_URL} unreachable; price drift not checked`);
      return;
    }
    const live = new Map(catalog.capabilities.map((item) => [item.id, item.pricing]));
    const drift: string[] = [];
    for (const [id, advertised] of Object.entries(CAPABILITY_PRICE_USD)) {
      const actual = live.get(id);
      if (!actual) {
        drift.push(`${id}: advertised by this plugin but absent from the catalog`);
        continue;
      }
      if (advertised.hit !== actual.cacheHitUsd || advertised.miss !== actual.cacheMissUsd) {
        drift.push(
          `${id}: plugin says $${advertised.hit}-${advertised.miss}, network charges ` +
            `$${actual.cacheHitUsd}-${actual.cacheMissUsd}`,
        );
      }
    }
    expect(drift).toEqual([]);
  });

  test("a capability the network sells is not silently missing from the plugin", async () => {
    const catalog = await liveCatalog();
    if (!catalog) {
      console.warn(`[skip] ${CATALOG_URL} unreachable; coverage not checked`);
      return;
    }
    const missing = catalog.capabilities
      .map((item) => item.id)
      .filter((id) => !(id in CAPABILITY_PRICE_USD));
    expect(missing).toEqual([]);
  });
});

describe("defaults can actually buy what the plugin advertises", () => {
  test("the default per-call cap covers the dearest check", () => {
    expect(DEFAULT_MAX_PRICE_USD).toBeGreaterThanOrEqual(dearestCapabilityUsd());
  });

  test("the default daily budget allows more than a single call", () => {
    expect(DEFAULT_DAILY_BUDGET_USD).toBeGreaterThanOrEqual(DEFAULT_MAX_PRICE_USD * 5);
  });

  test("priceLabel renders a range for tiered reads", () => {
    expect(priceLabel("contract.guard")).toBe("$0.01-0.03");
    expect(priceLabel("token.metadata")).toBe("$0.01-0.03");
    expect(priceLabel("chain.snapshot")).toBe("$0.01-0.02");
    expect(priceLabel("prediction.evidence")).toBe("$0.01-0.05");
    expect(priceLabel("token.launch.guard")).toBe("$0.02-0.07");
    expect(priceLabel("token.holders.guard")).toBe("$0.01-0.04");
    expect(priceLabel("nope.not.real")).toBe("price unknown");
  });
});
