// ElizaOS plugin for Tereno (https://www.tereno.xyz): paid Base preflight
// verdicts and chain-data reads over x402 (USDC on Base). The agent pays with
// its own wallet; every call is capped per invocation (TERENO_MAX_PRICE_USD)
// and by a rolling daily budget (TERENO_DAILY_BUDGET_USD). No account or API
// key — the signed x402 payment is the identity.

import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { createPublicClient, http, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { createTerenoClient, type CapabilityInput } from "tereno-client";

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function privateKey(): `0x${string}` | null {
  const raw = env("TERENO_PRIVATE_KEY") || env("EVM_PRIVATE_KEY");
  if (!raw) return null;
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? (normalized as `0x${string}`) : null;
}

function maxPriceUsd(): number {
  const parsed = Number(env("TERENO_MAX_PRICE_USD", "0.005"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.005;
}

// Rolling daily budget so a chatty agent cannot drain its wallet.
let budgetDay = "";
let spentTodayUsd = 0;
function underDailyBudget(nextPriceUsd: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    spentTodayUsd = 0;
  }
  const cap = Number(env("TERENO_DAILY_BUDGET_USD", "0.05"));
  const limit = Number.isFinite(cap) && cap > 0 ? cap : 0.05;
  return spentTodayUsd + nextPriceUsd <= limit;
}

type TerenoAccount = NonNullable<Parameters<typeof createTerenoClient>[0]["account"]>;

function client() {
  const key = privateKey();
  if (!key) throw new Error("TERENO_PRIVATE_KEY (or EVM_PRIVATE_KEY) is not configured");
  return createTerenoClient({
    baseUrl: env("TERENO_API_URL", "https://www.tereno.xyz"),
    // Cast bridges duplicate viem type instances (plugin vs linked client);
    // the runtime shape is identical.
    account: privateKeyToAccount(key) as unknown as TerenoAccount,
    network: env("TERENO_NETWORK", "eip155:8453") === "eip155:84532" ? "eip155:84532" : "eip155:8453",
    rpcUrl: env("TERENO_RPC_URL", "https://mainnet.base.org"),
    maxPriceUsd: maxPriceUsd(),
  });
}

function firstAddress(message: Memory): string | null {
  return (message.content.text || "").match(ADDRESS_RE)?.[0] ?? null;
}

// With TERENO_PRIVATE_ONLY=true, paid actions refuse public platform sources
// so strangers in a public channel cannot spend the agent's USDC.
function sourceAllowed(message: Memory): boolean {
  if (env("TERENO_PRIVATE_ONLY") !== "true") return true;
  const source = message.content.source;
  return source !== "discord" && source !== "telegram" && source !== "twitter";
}

interface VerdictResult {
  verdict?: string;
  result?: { summary?: string; reasonCodes?: string[]; agentNote?: string; validUntilBlock?: number };
  pricing?: { pricePaidUsd?: number };
  receiptUrl?: string;
}

function formatVerdict(data: VerdictResult, baseUrl: string): string {
  const icon = data.verdict === "allow" ? "✅" : data.verdict === "review" ? "⚠️" : "⛔";
  const lines = [
    `${icon} Tereno verdict: ${data.verdict ?? "unknown"}`,
    data.result?.summary ?? null,
    data.result?.reasonCodes?.length ? `Reasons: ${data.result.reasonCodes.join(", ")}` : null,
    data.pricing?.pricePaidUsd !== undefined ? `Paid: $${data.pricing.pricePaidUsd} USDC (x402)` : null,
    data.receiptUrl ? `Receipt: ${baseUrl}${data.receiptUrl}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function paidAction(config: {
  name: string;
  similes: string[];
  description: string;
  buildInput: (message: Memory) => CapabilityInput | null;
  missingInputText: string;
}): Action {
  return {
    name: config.name,
    similes: config.similes,
    description: config.description,
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      privateKey() !== null && sourceAllowed(message),
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: unknown,
      callback: HandlerCallback | undefined,
    ): Promise<ActionResult> => {
      const respond = async (text: string, success: boolean, data?: unknown): Promise<ActionResult> => {
        await callback?.({ text, actions: [config.name], source: message.content.source });
        return { success, text, data: data as Record<string, unknown> | undefined };
      };
      const input = config.buildInput(message);
      if (!input) return respond(config.missingInputText, false);
      const perCall = maxPriceUsd();
      if (!underDailyBudget(perCall)) {
        return respond("Tereno daily USDC budget is exhausted; try again tomorrow or raise TERENO_DAILY_BUDGET_USD.", false);
      }
      try {
        const tereno = client();
        const { data } = await tereno.invokeCapability<VerdictResult>(input);
        spentTodayUsd += data.pricing?.pricePaidUsd ?? perCall;
        return respond(formatVerdict(data, env("TERENO_API_URL", "https://www.tereno.xyz")), true, data);
      } catch (error) {
        logger.warn({ error, action: config.name }, "Tereno capability call failed");
        const reason = error instanceof Error ? error.message : String(error);
        return respond(`Tereno call did not settle (nothing was charged): ${reason}`, false);
      }
    },
    examples: [],
  };
}

const checkContract = paidAction({
  name: "TERENO_CHECK_CONTRACT",
  similes: ["IS_CONTRACT_SAFE", "CONTRACT_GUARD", "CHECK_ADDRESS_SAFETY"],
  description:
    "Before interacting with a Base contract, buy a bounded allow/review/block verdict (code present, proxy, paused) via Tereno contract.guard ($0.001–$0.003 USDC over x402). Use when the user asks whether a Base contract or token address is safe to interact with.",
  buildInput: (message) => {
    const address = firstAddress(message);
    return address ? { capabilityId: "contract.guard", address } : null;
  },
  missingInputText: "I need a Base contract address (0x…) to run the Tereno contract check.",
});

const tokenInfo = paidAction({
  name: "TERENO_TOKEN_INFO",
  similes: ["TOKEN_METADATA", "WHAT_TOKEN_IS_THIS", "TOKEN_LOOKUP"],
  description:
    "Read a Base token's on-chain identity — name, symbol, decimals, total supply — via Tereno token.metadata ($0.001 USDC over x402). Use when the user asks what a token address is.",
  buildInput: (message) => {
    const address = firstAddress(message);
    return address ? { capabilityId: "token.metadata", address } : null;
  },
  missingInputText: "I need a Base token address (0x…) to look up its metadata.",
});

const contractInterface = paidAction({
  name: "TERENO_CONTRACT_INTERFACE",
  similes: ["DETECT_CONTRACT_STANDARD", "IS_IT_ERC20", "IS_IT_NFT"],
  description:
    "Detect which standard a Base contract implements — ERC-20, ERC-721, ERC-1155, ERC-165, EIP-1967 proxy — via Tereno contract.interface ($0.001 USDC over x402).",
  buildInput: (message) => {
    const address = firstAddress(message);
    return address ? { capabilityId: "contract.interface", address } : null;
  },
  missingInputText: "I need a Base contract address (0x…) to detect its interfaces.",
});

const contractChanged = paidAction({
  name: "TERENO_CONTRACT_CHANGED",
  similes: ["DID_CONTRACT_CHANGE", "RUG_PULL_CHECK", "PROXY_UPGRADE_CHECK"],
  description:
    "Check whether a Base contract changed since Tereno last observed it — bytecode swap, proxy implementation/admin change, pause — via contract.change ($0.001 USDC over x402). The classic rug-pull-after-audit detector.",
  buildInput: (message) => {
    const address = firstAddress(message);
    return address ? { capabilityId: "contract.change", address } : null;
  },
  missingInputText: "I need a Base contract address (0x…) to compare with Tereno's previous observation.",
});

const chainSnapshot = paidAction({
  name: "TERENO_CHAIN_SNAPSHOT",
  similes: ["BASE_GAS_PRICE", "LATEST_BASE_BLOCK", "BASE_CHAIN_STATE"],
  description:
    "Get the current Base chain state — latest block, timestamp, base fee and suggested gas fees — via Tereno chain.snapshot ($0.001 USDC over x402). No parameters needed.",
  buildInput: () => ({ capabilityId: "chain.snapshot" }),
  missingInputText: "",
});

const checkTransaction = paidAction({
  name: "TERENO_CHECK_TRANSACTION",
  similes: ["IS_IT_SAFE_TO_SIGN", "SIMULATE_TRANSACTION", "TX_PREFLIGHT"],
  description:
    "Before signing a Base transaction, buy a private pre-sign verdict — intent classification, simulation, gas, balance/allowance deltas, drainer/unlimited-approval flags — via Tereno transaction.intent.guard ($0.005 USDC over x402). The message must contain a JSON object with from, to and optional data/value.",
  buildInput: (message) => {
    const text = message.content.text || "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as { from?: string; to?: string; data?: string; value?: string };
      if (!parsed.from || !parsed.to || !ADDRESS_RE.test(parsed.from) || !ADDRESS_RE.test(parsed.to)) return null;
      return {
        capabilityId: "transaction.intent.guard",
        from: parsed.from, to: parsed.to,
        data: parsed.data ?? "0x", value: parsed.value ?? "0",
      };
    } catch {
      return null;
    }
  },
  missingInputText:
    'To simulate before signing I need the unsigned transaction as JSON, e.g. {"from":"0x…","to":"0x…","data":"0x…","value":"0"}.',
});

// ————— Cooperative loop: the agent earns its own safety budget —————
// First settled payer (or audited publisher) of fresh work becomes its seeder
// and earns 20% of every settled cross-wallet reuse as non-transferable
// credits, which discount the guard capabilities. Bounties are the network's
// public statement of what it will pay for next.

interface Bounty {
  capabilityId: string;
  input: { address?: string };
  misses: number;
  fulfillment: "publish" | "first_settled_invocation";
  seederEconomics: { dividendPerSettledReuseUsd: number; lifetimeCapUsd: number };
}

function agentWallet(): string | null {
  const key = privateKey();
  return key ? privateKeyToAccount(key).address.toLowerCase() : null;
}

function basePublicClient() {
  const sepolia = env("TERENO_NETWORK", "eip155:8453") === "eip155:84532";
  return createPublicClient({
    chain: sepolia ? baseSepolia : base,
    transport: http(env("TERENO_RPC_URL", sepolia ? "https://sepolia.base.org" : "https://mainnet.base.org")),
  });
}

async function fetchBounties(): Promise<Bounty[]> {
  const baseUrl = env("TERENO_API_URL", "https://www.tereno.xyz");
  const response = await fetch(`${baseUrl}/api/v1/bounties?limit=20`, {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { bounties?: Bounty[] };
  return body.bounties ?? [];
}

function formatBounty(bounty: Bounty): string {
  const target = bounty.input.address ? ` for ${bounty.input.address}` : "";
  const path = bounty.fulfillment === "publish"
    ? "publish a signed fingerprint (free RPC work)"
    : "be the first settled payer";
  return `- ${bounty.capabilityId}${target} · ${bounty.misses} miss(es) · earns $${bounty.seederEconomics.dividendPerSettledReuseUsd}/reuse (cap $${bounty.seederEconomics.lifetimeCapUsd}) · how: ${path}`;
}

/** Publish-path seeding: compute the contract fingerprint locally (free RPC
 *  reads), publish it EIP-712-signed, and let Tereno audit it by
 *  recomputation. On success the agent claims the seeder slot without paying. */
async function seedByPublishing(address: string): Promise<string> {
  const rpc = basePublicClient();
  const [blockNumber, bytecode] = await Promise.all([
    rpc.getBlockNumber(),
    rpc.getBytecode({ address: address as `0x${string}` }),
  ]);
  const hasCode = Boolean(bytecode && bytecode !== "0x");
  const result = await client().publishContractFingerprint<{
    status?: string; artifactId?: string; note?: string; audited?: boolean;
  }>({
    address,
    bytecodeHash: hasCode ? keccak256(bytecode as Hex) : null,
    bytecodeBytes: hasCode ? (bytecode!.length - 2) / 2 : 0,
    computedAtBlock: Number(blockNumber),
  });
  if (result.status === "published") {
    return `🌱 Seeded ${address}: fingerprint published and audited on-chain. I now earn the reuse dividend whenever another wallet's settled contract.guard call reuses it. Cost: only RPC reads.`;
  }
  return `Publishing ${address} returned "${result.status}"${result.note ? ` — ${result.note}` : ""}.`;
}

const bountiesAction: Action = {
  name: "TERENO_BOUNTIES",
  similes: ["WHAT_DOES_THE_NETWORK_WANT", "OPEN_BOUNTIES", "TERENO_DEMAND"],
  description:
    "List Tereno's open bounties: real unmet demand other agents quoted but nobody seeded yet, with the seeder economics for each. Free. Use when asked what the Tereno network is asking for or how the agent could earn credits.",
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback: HandlerCallback | undefined,
  ): Promise<ActionResult> => {
    const bounties = await fetchBounties();
    const text = bounties.length
      ? `Open Tereno bounties (network demand nobody has seeded):\n${bounties.map(formatBounty).join("\n")}\nSay "seed it" and I will fulfil the best one.`
      : "No open bounties right now — the network's current demand is fully seeded.";
    await callback?.({ text, actions: ["TERENO_BOUNTIES"], source: message.content.source });
    return { success: true, text, data: { bounties } };
  },
  examples: [],
};

const seedAction: Action = {
  name: "TERENO_SEED",
  similes: ["SEED_BOUNTY", "EARN_TERENO_CREDITS", "FULFIL_BOUNTY", "CONTRIBUTE_WORK"],
  description:
    "Fulfil a Tereno bounty and claim the seeder slot. For contract.guard bounties the agent computes the bytecode fingerprint itself (free RPC work) and publishes it signed — audited by recomputation. For chain-data bounties it pays the $0.001 first settled invocation within budget. Seeders earn 20% of every settled cross-wallet reuse as credits that discount the guard capabilities. Use when asked to seed, contribute or earn credits; an explicit 0x address seeds that contract directly.",
  validate: async (_runtime: IAgentRuntime, message: Memory) =>
    privateKey() !== null && sourceAllowed(message),
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback: HandlerCallback | undefined,
  ): Promise<ActionResult> => {
    const respond = async (text: string, success: boolean, data?: unknown): Promise<ActionResult> => {
      await callback?.({ text, actions: ["TERENO_SEED"], source: message.content.source });
      return { success, text, data: data as Record<string, unknown> | undefined };
    };
    try {
      // Explicit address wins: seed that contract via the free publish path.
      const explicit = firstAddress(message);
      if (explicit) return respond(await seedByPublishing(explicit), true);

      const bounties = await fetchBounties();
      const publishable = bounties.find((bounty) => bounty.fulfillment === "publish" && bounty.input.address);
      if (publishable) return respond(await seedByPublishing(publishable.input.address!), true);

      const payable = bounties.find((bounty) =>
        bounty.fulfillment === "first_settled_invocation" && bounty.input.address &&
        (bounty.capabilityId === "token.metadata" || bounty.capabilityId === "contract.interface"));
      if (!payable) return respond("No fulfillable bounty is open right now.", false);
      if (!underDailyBudget(0.001)) {
        return respond("Found a payable bounty, but the daily USDC budget is exhausted.", false);
      }
      const { data } = await client().invokeCapability<VerdictResult>({
        capabilityId: payable.capabilityId as "token.metadata" | "contract.interface",
        address: payable.input.address!,
      });
      spentTodayUsd += data.pricing?.pricePaidUsd ?? 0.001;
      return respond(
        `🌱 Paid $${data.pricing?.pricePaidUsd ?? 0.001} to seed ${payable.capabilityId} for ${payable.input.address}. As first settled payer I claimed the seeder slot: every settled reuse by another wallet now pays me $${payable.seederEconomics.dividendPerSettledReuseUsd} in credits (cap $${payable.seederEconomics.lifetimeCapUsd}).`,
        true, data,
      );
    } catch (error) {
      logger.warn({ error }, "Tereno seeding failed");
      const reason = error instanceof Error ? error.message : String(error);
      return respond(`Seeding did not complete: ${reason}`, false);
    }
  },
  examples: [],
};

const standingAction: Action = {
  name: "TERENO_STANDING",
  similes: ["MY_TERENO_REPUTATION", "CREDIT_BALANCE", "PUBLISHER_STANDING"],
  description:
    "Report the agent's own Tereno track record: audited publications, settled reuse dividends, review credits and standing. Free; computed by the network from audits and settled economics, never self-reported.",
  validate: async () => privateKey() !== null,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback: HandlerCallback | undefined,
  ): Promise<ActionResult> => {
    const wallet = agentWallet();
    const baseUrl = env("TERENO_API_URL", "https://www.tereno.xyz");
    try {
      const response = await fetch(`${baseUrl}/api/v1/publishers/${wallet}`, {
        headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json()) as {
        standing?: string; auditPassRatePct?: number | null;
        publications?: { total?: number; passed?: number; failed?: number };
        dividends?: { settledReuses?: number; earnedUsd?: number };
        outcomeReviewCreditsEarnedUsd?: number; creditsSpentUsd?: number;
      };
      const earned = (data.dividends?.earnedUsd ?? 0) + (data.outcomeReviewCreditsEarnedUsd ?? 0);
      const text = [
        `Tereno standing: ${data.standing ?? "unknown"} (wallet ${wallet})`,
        `Publications: ${data.publications?.total ?? 0} (${data.publications?.passed ?? 0} audited-passed, ${data.publications?.failed ?? 0} failed)`,
        `Settled reuses of my work: ${data.dividends?.settledReuses ?? 0}`,
        `Credits earned: $${earned.toFixed(6)} · spent: $${(data.creditsSpentUsd ?? 0).toFixed(6)}`,
        "Credits discount my guard calls — my safety budget funds itself.",
      ].join("\n");
      await callback?.({ text, actions: ["TERENO_STANDING"], source: message.content.source });
      return { success: true, text, data };
    } catch {
      const text = "Could not read my Tereno publisher standing right now.";
      await callback?.({ text, actions: ["TERENO_STANDING"], source: message.content.source });
      return { success: false, text };
    }
  },
  examples: [],
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const reportOutcomeAction: Action = {
  name: "TERENO_REPORT_OUTCOME",
  similes: ["REPORT_VERDICT_OUTCOME", "TERENO_FEEDBACK"],
  description:
    "Attach a signed outcome (success, failure, avoided or unknown) to a settled Tereno invocation by its invocation id. The first honest outcome per invocation earns a small review credit and feeds publisher reputation. Only report what actually happened.",
  validate: async (_runtime: IAgentRuntime, message: Memory) =>
    privateKey() !== null && sourceAllowed(message),
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback: HandlerCallback | undefined,
  ): Promise<ActionResult> => {
    const respond = async (text: string, success: boolean): Promise<ActionResult> => {
      await callback?.({ text, actions: ["TERENO_REPORT_OUTCOME"], source: message.content.source });
      return { success, text };
    };
    const text = message.content.text || "";
    const invocationId = text.match(UUID_RE)?.[0];
    const value = text.toLowerCase().match(/\b(success|failure|avoided|unknown)\b/)?.[1] as
      | "success" | "failure" | "avoided" | "unknown" | undefined;
    if (!invocationId || !value) {
      return respond("I need the invocation id (uuid) and the outcome: success, failure, avoided or unknown.", false);
    }
    try {
      const result = await client().outcome<{ reviewCreditUsd?: number }>(invocationId, value);
      const credit = result.reviewCreditUsd ? ` Earned a $${result.reviewCreditUsd} review credit.` : "";
      return respond(`Outcome "${value}" signed and recorded for ${invocationId}.${credit}`, true);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return respond(`Could not record the outcome: ${reason}`, false);
    }
  },
  examples: [],
};

const catalogAction: Action = {
  name: "TERENO_CATALOG",
  similes: ["LIST_TERENO_CAPABILITIES", "TERENO_PRICES"],
  description: "List Tereno capabilities and prices (free, no payment).",
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback: HandlerCallback | undefined,
  ): Promise<ActionResult> => {
    const baseUrl = env("TERENO_API_URL", "https://www.tereno.xyz");
    try {
      const response = await fetch(`${baseUrl}/api/v1/capabilities`, {
        headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      const text = JSON.stringify(body, null, 2).slice(0, 5000);
      await callback?.({ text, actions: ["TERENO_CATALOG"], source: message.content.source });
      return { success: true, text };
    } catch {
      const text = "Could not reach the Tereno catalog.";
      await callback?.({ text, actions: ["TERENO_CATALOG"], source: message.content.source });
      return { success: false, text };
    }
  },
  examples: [],
};

export const terenoPlugin: Plugin = {
  name: "plugin-tereno",
  description:
    "Tereno for Base agents: buy bounded preflight verdicts and chain-data reads over x402 (budget-capped), and earn the agent's own safety budget by seeding work the network asks for — audited publishing, seeder dividends, portable reputation.",
  actions: [
    checkTransaction, checkContract, contractChanged, tokenInfo, contractInterface, chainSnapshot,
    bountiesAction, seedAction, standingAction, reportOutcomeAction, catalogAction,
  ],
};

export default terenoPlugin;
