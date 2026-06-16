/**
 * subscription-status.ts
 *
 * Pins the active provider / subscription account / model into the
 * footer status bar so it's always visible — including which OAuth
 * subscription (work vs personal) is currently loaded.
 *
 * For Anthropic OAuth, the account email + organization are fetched
 * once per credential (cached by token fingerprint) from
 *   https://api.anthropic.com/api/oauth/profile
 *
 * For OpenAI Codex OAuth, the account email + plan are decoded from the
 * OAuth access token, and Codex usage metadata is captured from the
 * `x-codex-*` response headers on each provider response.
 *
 * Cache file: ~/.pi/agent/subscription-cache.json
 *   {
 *     "anthropic:abcd1234": {
 *       "email": "you@work.com",
 *       "organization": "Acme",
 *       "label": "work"          // optional manual override via /sub-label
 *     }
 *   }
 *
 * Commands:
 *   /sub-label <name>   Manually label the active account
 *   /sub-label -        Clear manual label (revert to auto-fetched email)
 *   /sub-refresh        Force re-fetch of profile info for active account
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type AuthEntry = {
	type: "api_key" | "oauth";
	key?: string;
	refresh?: string;
	access?: string;
	[k: string]: unknown;
};

type UsageEntry = {
	// Anthropic OAuth usage windows
	fiveHourPercent?: number;
	fiveHourResetsAt?: string;
	sevenDayPercent?: number;
	sevenDayResetsAt?: string;

	// OpenAI Codex usage / plan metadata
	planType?: string;
	activeLimit?: string;
	creditsBalance?: string;
	creditsHasCredits?: boolean;
	creditsUnlimited?: boolean;
	primaryUsedPercent?: number;
	primaryOverSecondaryLimitPercent?: number;
	primaryResetAfterSeconds?: number;
	primaryResetAt?: string;
	primaryWindowMinutes?: number;
	secondaryUsedPercent?: number;
	secondaryResetAfterSeconds?: number;
	secondaryResetAt?: string;
	secondaryWindowMinutes?: number;

	fetchedAt?: number;
};

type CacheEntry = {
	email?: string;
	organization?: string;
	fullName?: string;
	planType?: string;
	label?: string; // manual override
	fetchedAt?: number;
	usage?: UsageEntry;
};

const USAGE_TTL_MS = 60_000; // refetch Anthropic usage at most once per minute

const PI_HOME = join(homedir(), ".pi", "agent");
const AUTH_PATH = join(PI_HOME, "auth.json");
const CACHE_PATH = join(PI_HOME, "subscription-cache.json");
const OPENAI_AUTH_CLAIM_PATH = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM_PATH = "https://api.openai.com/profile";

type OpenAICodexJwtPayload = {
	[OPENAI_AUTH_CLAIM_PATH]?: { chatgpt_plan_type?: string };
	[OPENAI_PROFILE_CLAIM_PATH]?: { email?: string };
};

function readJson<T>(path: string, fallback: T): T {
	try {
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return fallback;
	}
}

function readAuth(): Record<string, AuthEntry> {
	return readJson<Record<string, AuthEntry>>(AUTH_PATH, {});
}

function readCache(): Record<string, CacheEntry> {
	return readJson<Record<string, CacheEntry>>(CACHE_PATH, {});
}

function writeCache(cache: Record<string, CacheEntry>) {
	writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function credentialFingerprint(auth: AuthEntry | undefined): string | undefined {
	if (!auth) return undefined;
	if (auth.type === "oauth") {
		if (auth.refresh) return fingerprint(auth.refresh);
		if (auth.access) return fingerprint(auth.access);
		return undefined;
	}
	if (auth.type === "api_key" && auth.key) return fingerprint(String(auth.key));
	return undefined;
}

function decodeJwtPayload<T>(token: string): T | undefined {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return undefined;
		const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		const json = Buffer.from(padded, "base64").toString("utf8");
		return JSON.parse(json) as T;
	} catch {
		return undefined;
	}
}

function extractOpenAICodexIdentity(auth: AuthEntry | undefined): { email?: string; planType?: string } | undefined {
	if (auth?.type !== "oauth" || !auth.access) return undefined;
	const payload = decodeJwtPayload<OpenAICodexJwtPayload>(auth.access);
	if (!payload) return undefined;
	return {
		email: payload[OPENAI_PROFILE_CLAIM_PATH]?.email,
		planType: payload[OPENAI_AUTH_CLAIM_PATH]?.chatgpt_plan_type,
	};
}

function parseNumberHeader(value: string | undefined): number | undefined {
	if (value == null || value === "") return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function parseBooleanHeader(value: string | undefined): boolean | undefined {
	if (value == null || value === "") return undefined;
	if (/^(true|1)$/i.test(value)) return true;
	if (/^(false|0)$/i.test(value)) return false;
	return undefined;
}

function mergeDefined<T extends object>(target: T, patch: Partial<T>): T {
	for (const [key, value] of Object.entries(patch) as Array<[keyof T, T[keyof T] | undefined]>) {
		if (value !== undefined) {
			target[key] = value;
		}
	}
	return target;
}

/** In-flight fetches keyed by cache key, to avoid duplicate requests. */
const inflight = new Map<string, Promise<void>>();

async function fetchAnthropicProfile(accessToken: string): Promise<CacheEntry | undefined> {
	try {
		const res = await fetch("https://api.anthropic.com/api/oauth/profile", {
			headers: {
				authorization: `Bearer ${accessToken}`,
				"anthropic-beta": "oauth-2025-04-20",
			},
		});
		if (!res.ok) return undefined;
		const data = (await res.json()) as {
			account?: { email?: string; full_name?: string };
			organization?: { name?: string };
		};
		return {
			email: data.account?.email,
			fullName: data.account?.full_name,
			organization: data.organization?.name,
			fetchedAt: Date.now(),
		};
	} catch {
		return undefined;
	}
}

function ensureProfile(provider: string, key: string, accessToken: string, ctx: ExtensionContext) {
	if (provider !== "anthropic") return;
	const cache = readCache();
	if (cache[key]?.email) return; // already have it
	if (inflight.has(key)) return;
	const p = (async () => {
		const profile = await fetchAnthropicProfile(accessToken);
		if (!profile) return;
		const c = readCache();
		c[key] = { ...c[key], ...profile };
		writeCache(c);
		render(ctx); // refresh status bar with new info
	})().finally(() => inflight.delete(key));
	inflight.set(key, p);
}

async function fetchAnthropicUsage(accessToken: string): Promise<UsageEntry | undefined> {
	try {
		const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
			headers: {
				authorization: `Bearer ${accessToken}`,
				"anthropic-beta": "oauth-2025-04-20",
			},
		});
		if (!res.ok) return undefined;
		const data = (await res.json()) as {
			five_hour?: { utilization?: number; resets_at?: string };
			seven_day?: { utilization?: number; resets_at?: string };
		};
		return {
			fiveHourPercent: data.five_hour?.utilization,
			fiveHourResetsAt: data.five_hour?.resets_at,
			sevenDayPercent: data.seven_day?.utilization,
			sevenDayResetsAt: data.seven_day?.resets_at,
			fetchedAt: Date.now(),
		};
	} catch {
		return undefined;
	}
}

function ensureUsage(provider: string, key: string, accessToken: string, ctx: ExtensionContext) {
	if (provider !== "anthropic") return;
	const cache = readCache();
	const existing = cache[key]?.usage;
	const fresh = existing?.fetchedAt && Date.now() - existing.fetchedAt < USAGE_TTL_MS;
	if (fresh) return;
	const usageKey = `usage:${key}`;
	if (inflight.has(usageKey)) return;
	const p = (async () => {
		const usage = await fetchAnthropicUsage(accessToken);
		if (!usage) return;
		const c = readCache();
		c[key] = { ...c[key], usage };
		writeCache(c);
		render(ctx);
	})().finally(() => inflight.delete(usageKey));
	inflight.set(usageKey, p);
}

function recordOpenAICodexUsage(headers: Record<string, string>, ctx: ExtensionContext) {
	const model = ctx.model;
	if (model?.provider !== "openai-codex") return;

	const auth = readAuth()[model.provider];
	const fp = credentialFingerprint(auth);
	if (!fp) return;

	const parsed: Partial<UsageEntry> = {
		planType: headers["x-codex-plan-type"],
		activeLimit: headers["x-codex-active-limit"],
		creditsBalance: headers["x-codex-credits-balance"] || undefined,
		creditsHasCredits: parseBooleanHeader(headers["x-codex-credits-has-credits"]),
		creditsUnlimited: parseBooleanHeader(headers["x-codex-credits-unlimited"]),
		primaryUsedPercent: parseNumberHeader(headers["x-codex-primary-used-percent"]),
		primaryOverSecondaryLimitPercent: parseNumberHeader(
			headers["x-codex-primary-over-secondary-limit-percent"],
		),
		primaryResetAfterSeconds: parseNumberHeader(headers["x-codex-primary-reset-after-seconds"]),
		primaryResetAt: headers["x-codex-primary-reset-at"] || undefined,
		primaryWindowMinutes: parseNumberHeader(headers["x-codex-primary-window-minutes"]),
		secondaryUsedPercent: parseNumberHeader(headers["x-codex-secondary-used-percent"]),
		secondaryResetAfterSeconds: parseNumberHeader(headers["x-codex-secondary-reset-after-seconds"]),
		secondaryResetAt: headers["x-codex-secondary-reset-at"] || undefined,
		secondaryWindowMinutes: parseNumberHeader(headers["x-codex-secondary-window-minutes"]),
	};

	const hasUsefulData = Object.values(parsed).some((value) => value !== undefined);
	if (!hasUsefulData) return;

	const key = `${model.provider}:${fp}`;
	const identity = extractOpenAICodexIdentity(auth);
	const cache = readCache();
	const existing = cache[key] ?? {};
	const usage = mergeDefined({ ...(existing.usage ?? {}), fetchedAt: Date.now() }, parsed);

	cache[key] = {
		...existing,
		email: identity?.email ?? existing.email,
		planType: identity?.planType ?? existing.planType,
		usage,
	};
	writeCache(cache);
}

type AuthDescription = {
	icon: string;
	label: string;
	kind: "sub" | "api" | "env";
	cacheKey?: string;
	accessToken?: string;
};

function describeAuth(provider: string): AuthDescription {
	const auth = readAuth()[provider];
	const cache = readCache();

	if (auth?.type === "oauth") {
		const fp = credentialFingerprint(auth);
		if (fp) {
			const key = `${provider}:${fp}`;
			const entry = cache[key];
			const openAIIdentity = provider === "openai-codex" ? extractOpenAICodexIdentity(auth) : undefined;
			let label: string;
			if (entry?.label) label = entry.label;
			else if (entry?.email) label = entry.email;
			else if (openAIIdentity?.email) label = openAIIdentity.email;
			else label = `#${fp} …`;
			return { icon: "🔐", label, kind: "sub", cacheKey: key, accessToken: auth.access };
		}
	}
	if (auth?.type === "api_key") {
		const fp = auth.key ? fingerprint(String(auth.key)) : undefined;
		const key = fp ? `${provider}:${fp}` : undefined;
		const entry = key ? cache[key] : undefined;
		return {
			icon: "🔑",
			label: entry?.label ?? "api-key",
			kind: "api",
			cacheKey: key,
		};
	}
	return { icon: "🔑", label: "env", kind: "env" };
}

/** Read pi's auto-compaction setting from settings.json (default: true). */
function isAutoCompactEnabled(): boolean {
	const settings = readJson<{ compaction?: { enabled?: boolean } }>(
		join(PI_HOME, "settings.json"),
		{},
	);
	return settings.compaction?.enabled !== false;
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
	return `${n}`;
}

/** Draw a unicode progress bar with sub-cell precision. */
function progressBar(percent: number, width = 8): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const totalEighths = Math.round((clamped / 100) * width * 8);
	const fullBlocks = Math.floor(totalEighths / 8);
	const remainder = totalEighths % 8;
	const partials = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
	const filled = "\u2588".repeat(fullBlocks) + (remainder ? partials[remainder] : "");
	const emptyCount = Math.max(0, width - fullBlocks - (remainder ? 1 : 0));
	const empty = "\u2591".repeat(emptyCount);
	return filled + empty;
}

function renderContext(ctx: ExtensionContext) {
	const usage = ctx.getContextUsage();
	if (!usage) {
		ctx.ui.setStatus("context", undefined);
		return;
	}
	const { tokens, contextWindow, percent } = usage;
	const theme = ctx.ui.theme;
	const auto = isAutoCompactEnabled() ? theme.fg("dim", " (auto)") : "";
	const window = theme.fg("dim", ` ${fmtTokens(contextWindow)}`);
	if (tokens == null || percent == null) {
		const bar = theme.fg("dim", progressBar(0));
		ctx.ui.setStatus("context", `${bar} ?%${auto}${window}`);
		return;
	}
	const pct = Math.max(0, Math.min(100, percent));
	const pctRounded = pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct).toString();
	const color = pct >= 90 ? "error" : pct >= 75 ? "warning" : pct >= 50 ? "accent" : "success";
	const bar = theme.fg(color, progressBar(pct));
	ctx.ui.setStatus("context", `${bar} ${pctRounded}%${auto}${window}`);
}

function render(ctx: ExtensionContext) {
	const model = ctx.model;
	if (!model) {
		ctx.ui.setStatus("subscription", "❓ no model");
		return;
	}
	const info = describeAuth(model.provider);
	const theme = ctx.ui.theme;
	ctx.ui.setStatus(
		"subscription",
		theme.fg("dim", `${model.provider}:${info.label} (${info.kind})`),
	);
	renderContext(ctx);
	// Kick off profile + usage fetches if needed
	if (info.cacheKey && info.accessToken) {
		ensureProfile(model.provider, info.cacheKey, info.accessToken, ctx);
		ensureUsage(model.provider, info.cacheKey, info.accessToken, ctx);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => render(ctx));
	pi.on("model_select", async (_event, ctx) => render(ctx));
	// Re-read auth on every turn in case the user swapped accounts externally.
	pi.on("agent_start", async (_event, ctx) => render(ctx));
	// OpenAI Codex exposes limit metadata via response headers.
	pi.on("after_provider_response", async (event, ctx) => {
		if (ctx.model?.provider !== "openai-codex") return;
		recordOpenAICodexUsage(event.headers, ctx);
		render(ctx);
	});
	// Update context usage as the conversation grows.
	pi.on("message_end", async (_event, ctx) => renderContext(ctx));
	pi.on("turn_end", async (_event, ctx) => renderContext(ctx));
	pi.on("agent_end", async (_event, ctx) => renderContext(ctx));

	pi.registerCommand("sub-label", {
		description: "Override the displayed name for the active subscription (e.g. /sub-label work, /sub-label - to clear)",
		handler: async (args, ctx) => {
			const name = (args ?? "").trim();
			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("No active model — can't determine provider.", "error");
				return;
			}
			const info = describeAuth(model.provider);
			if (!info.cacheKey) {
				ctx.ui.notify(
					`No fingerprintable credential for ${model.provider} (likely env var).`,
					"warning",
				);
				return;
			}
			const cache = readCache();
			const entry = cache[info.cacheKey] ?? {};
			if (!name) {
				ctx.ui.notify(
					`Active: ${info.cacheKey}\n` +
						`  email: ${entry.email ?? "(unknown)"}\n` +
						`  org:   ${entry.organization ?? entry.planType ?? "(unknown)"}\n` +
						`  label: ${entry.label ?? "(none)"}`,
					"info",
				);
				return;
			}
			if (name === "-") {
				delete entry.label;
				ctx.ui.notify(`Cleared label for ${info.cacheKey}.`, "success");
			} else {
				entry.label = name;
				ctx.ui.notify(`Labeled ${info.cacheKey} as "${name}".`, "success");
			}
			cache[info.cacheKey] = entry;
			writeCache(cache);
			render(ctx);
		},
	});

	pi.registerCommand("sub-refresh", {
		description: "Re-fetch profile info for the active subscription",
		handler: async (_args, ctx) => {
			const model = ctx.model;
			if (!model) return;
			const info = describeAuth(model.provider);
			if (!info.cacheKey) {
				ctx.ui.notify("No credential to refresh.", "warning");
				return;
			}

			const cache = readCache();
			const existing = cache[info.cacheKey];
			if (existing) {
				delete existing.usage;
				if (model.provider === "anthropic") {
					delete existing.email;
					delete existing.organization;
					delete existing.fullName;
					delete existing.fetchedAt;
				}
				cache[info.cacheKey] = existing;
				writeCache(cache);
			}

			if (model.provider === "openai-codex") {
				render(ctx);
				ctx.ui.notify("Cleared cached OpenAI Codex usage. It will refresh after the next response.", "info");
				return;
			}

			if (!info.accessToken) {
				ctx.ui.notify("No OAuth credential to refresh.", "warning");
				return;
			}
			ensureProfile(model.provider, info.cacheKey, info.accessToken, ctx);
			ensureUsage(model.provider, info.cacheKey, info.accessToken, ctx);
			ctx.ui.notify("Refreshing profile…", "info");
		},
	});
}
