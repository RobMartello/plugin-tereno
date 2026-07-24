import { afterEach, describe, expect, test } from "bun:test";
import {
  normalizeVerdict,
  failVerdict,
  telemetryPayload,
  TELEMETRY_KEYS,
} from "./index.ts";

const COST = { capUsd: 0.005, dailySpentUsd: 0.01 };
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
      { verdict: "allow", result: { summary: "ok" }, pricing: { pricePaidUsd: 0.005 } } as never,
      COST,
      BASE,
    );
    expect(v.decision).toBe("allow");
    expect(v.recommendedAction).toBe("sign");
    expect(v.riskLevel).toBe("none");
    expect(v.cost.paidUsd).toBe(0.005);
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
      { event: "check", checkType: "transaction.intent.guard", completed: true, paid: true, costUsd: 0.005 },
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
