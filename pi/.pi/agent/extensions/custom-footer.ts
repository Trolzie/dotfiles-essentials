/**
 * custom-footer.ts
 *
 * Replaces pi's built-in footer with a compact three-line layout that folds
 * the per-repo colour tag into the cwd, so there's no duplication:
 *
 *   Projects /api/src/auth (main) • <session name>
 *   doing: <topic>                                  ↑in ↓out Rcache $cost
 *   <context/subscription/etc>                <provider usage windows>
 *
 * Behaviour:
 * - In a git repo, the basename of the repo root is shown with a
 *   deterministic per-repo background colour. The path *below* the repo
 *   root is shown after it (no path shown when at the repo root itself).
 * - Outside a git repo, falls back to the tilde-shortened cwd.
 * - Session totals are shown again (input/output/cache/cost), while
 *   `(sub)/(api)`, `(auto)`, and the context window are folded into
 *   the extension statuses / usage rows.
 * - Usage on the bottom-right is read from subscription-status.ts cache:
 *   Anthropic 5h/7d windows, or OpenAI Codex primary/secondary windows
 *   when the provider exposes them. If OpenAI only exposes plan metadata,
 *   that metadata is shown instead.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import type { ExtensionAPI, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const HOME = homedir();
const PI_HOME = join(HOME, ".pi", "agent");
const AUTH_PATH = join(PI_HOME, "auth.json");
const CACHE_PATH = join(PI_HOME, "subscription-cache.json");

// ── Repo colour palette (24-bit RGB, all pair well with white text) ──
const PALETTE: Array<[number, number, number]> = [
	[90, 141, 181], // steel blue
	[183, 107, 74], // terracotta
	[106, 154, 106], // sage green
	[155, 107, 168], // violet
	[176, 138, 74], // mustard
	[74, 139, 155], // teal
	[181, 74, 122], // rose
	[122, 139, 74], // olive
	[90, 107, 168], // indigo
	[74, 181, 144], // mint
	[139, 107, 154], // mauve
	[181, 139, 107], // caramel
	[106, 139, 181], // sky
	[139, 168, 74], // chartreuse
	[168, 90, 139], // magenta
	[107, 122, 168], // periwinkle
];

type AuthEntry = {
	type?: string;
	refresh?: string;
	key?: string;
	access?: string;
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

function paletteIndex(key: string): number {
	let h = 5381;
	for (let i = 0; i < key.length; i++) {
		h = ((h << 5) + h + key.charCodeAt(i)) | 0;
	}
	return Math.abs(h) % PALETTE.length;
}

function detectRepoRoot(cwd: string): string | undefined {
	try {
		const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return root || undefined;
	} catch {
		return undefined;
	}
}

function tildeify(p: string): string {
	return p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p;
}

function colourTag(name: string, key: string): string {
	const [r, g, b] = PALETTE[paletteIndex(key)];
	// Coloured dot + plain name. Subtle but still per-repo distinct.
	return `\x1b[38;2;${r};${g};${b}m●\x1b[0m ${name}`;
}

/**
 * Wrap text with a background coloured pill in the same hue as the editor's
 * thinking border. Re-uses the theme's thinking* foreground ANSI by swapping
 * the SGR "set foreground" code (38) to "set background" (48).
 */
function thinkingPill(level: string, theme: Theme): string {
	const map: Record<string, ThemeColor> = {
		off: "thinkingOff",
		minimal: "thinkingMinimal",
		low: "thinkingLow",
		medium: "thinkingMedium",
		high: "thinkingHigh",
		xhigh: "thinkingXhigh",
	};
	const colourKey = map[level] ?? "thinkingOff";
	const fgAnsi = theme.getFgAnsi(colourKey); // e.g. "\x1b[38;2;209;131;232m"
	const bgAnsi = fgAnsi.replace(/\x1b\[38/, "\x1b[48");
	return `${bgAnsi}\x1b[30m\x1b[1m ${level} \x1b[0m`;
}

function readJson<T>(path: string, fallback: T): T {
	try {
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return fallback;
	}
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function credentialFingerprint(entry: AuthEntry | undefined): string | undefined {
	if (!entry) return undefined;
	if (entry.type === "oauth") {
		if (entry.refresh) return fingerprint(entry.refresh);
		if (entry.access) return fingerprint(entry.access);
		return undefined;
	}
	if (entry.type === "api_key" && entry.key) {
		return fingerprint(entry.key);
	}
	return undefined;
}

function currentUsage(provider: string | undefined): UsageEntry | undefined {
	if (!provider) return undefined;
	const auth = readJson<Record<string, AuthEntry>>(AUTH_PATH, {});
	const fp = credentialFingerprint(auth[provider]);
	if (!fp) return undefined;
	const key = `${provider}:${fp}`;
	const cache = readJson<Record<string, { usage?: UsageEntry }>>(CACHE_PATH, {});
	return cache[key]?.usage;
}

function isUsingOAuth(provider: string | undefined): boolean {
	if (!provider) return false;
	const auth = readJson<Record<string, AuthEntry>>(AUTH_PATH, {});
	return auth[provider]?.type === "oauth";
}

/** Compact human duration: "45m", "1h10m", "3h", "2d", "4d22h". */
function formatDurationMs(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "now";
	const totalMin = Math.round(ms / 60000);
	const d = Math.floor(totalMin / (60 * 24));
	const h = Math.floor((totalMin % (60 * 24)) / 60);
	const m = totalMin % 60;
	if (d > 0) return h > 0 ? `${d}d${h}h` : `${d}d`;
	if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
	return `${m}m`;
}

function untilReset(iso: string | undefined, afterSeconds?: number): string {
	if (iso) {
		const ms = new Date(iso).getTime() - Date.now();
		if (Number.isFinite(ms) && ms > 0) return formatDurationMs(ms);
		if (Number.isFinite(ms) && ms <= 0) return "now";
	}
	if (typeof afterSeconds === "number" && afterSeconds > 0) {
		return formatDurationMs(afterSeconds * 1000);
	}
	return "?";
}

function windowLabel(minutes: number | undefined): string | undefined {
	if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return undefined;
	const rounded = Math.round(minutes);
	if (rounded % (60 * 24) === 0) return `${rounded / (60 * 24)}d`;
	if (rounded % 60 === 0) return `${rounded / 60}h`;
	return `${rounded}m`;
}

/** 6-cell unicode bar with sub-cell precision. */
function miniBar(percent: number, width = 6): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const eighths = Math.round((clamped / 100) * width * 8);
	const full = Math.floor(eighths / 8);
	const rem = eighths % 8;
	const partials = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
	return (
		"\u2588".repeat(full) +
		(rem ? partials[rem] : "") +
		"\u2591".repeat(Math.max(0, width - full - (rem ? 1 : 0)))
	);
}

function colouredBar(percent: number, theme: Theme): string {
	const c = percent >= 90 ? "error" : percent >= 75 ? "warning" : percent >= 50 ? "accent" : "success";
	return theme.fg(c, miniBar(percent));
}

function renderAnthropicUsage(theme: Theme, usage: UsageEntry): string {
	const parts: string[] = [];
	if (typeof usage.fiveHourPercent === "number") {
		const label = theme.fg("dim", untilReset(usage.fiveHourResetsAt));
		parts.push(`${label} ${colouredBar(usage.fiveHourPercent, theme)} ${Math.round(usage.fiveHourPercent)}%`);
	}
	if (typeof usage.sevenDayPercent === "number") {
		const label = theme.fg("dim", untilReset(usage.sevenDayResetsAt));
		parts.push(`${label} ${colouredBar(usage.sevenDayPercent, theme)} ${Math.round(usage.sevenDayPercent)}%`);
	}
	return parts.join("  ");
}

function renderOpenAICodexUsage(theme: Theme, usage: UsageEntry): string {
	const parts: string[] = [];
	const pushWindow = (
		name: string,
		percent: number | undefined,
		resetAt: string | undefined,
		resetAfterSeconds: number | undefined,
		windowMinutes: number | undefined,
	) => {
		if (typeof percent !== "number") return;
		const nameLabel = theme.fg("dim", name);
		const reset = untilReset(resetAt, resetAfterSeconds);
		const span = reset !== "?" ? reset : (windowLabel(windowMinutes) ?? "");
		const spanLabel = span ? ` ${theme.fg("dim", span)}` : "";
		parts.push(`${nameLabel}${spanLabel} ${colouredBar(percent, theme)} ${Math.round(percent)}%`);
	};

	// OpenAI Codex exposes two windows as primary/secondary. We surface them as
	// session + weekly in the footer, which matches the user-facing mental model.
	pushWindow(
		"session",
		usage.primaryUsedPercent,
		usage.primaryResetAt,
		usage.primaryResetAfterSeconds,
		usage.primaryWindowMinutes,
	);
	pushWindow(
		"weekly",
		usage.secondaryUsedPercent,
		usage.secondaryResetAt,
		usage.secondaryResetAfterSeconds,
		usage.secondaryWindowMinutes,
	);

	const meta: string[] = [];
	if (usage.planType) meta.push(usage.planType);
	if (usage.activeLimit && usage.activeLimit !== usage.planType) meta.push(usage.activeLimit);
	if (usage.creditsUnlimited === true) meta.push("credits ∞");
	else if (usage.creditsBalance) meta.push(`credits ${usage.creditsBalance}`);
	else if (usage.creditsHasCredits === false) meta.push("no credits");

	if (parts.length > 0) {
		return meta.length > 0 ? `${parts.join("  ")}  ${theme.fg("dim", meta.join(" • "))}` : parts.join("  ");
	}
	return meta.length > 0 ? theme.fg("dim", meta.join(" • ")) : "";
}

function renderUsage(theme: Theme, provider: string | undefined): string {
	const usage = currentUsage(provider);
	if (!usage || !provider) return "";
	if (provider === "anthropic") return renderAnthropicUsage(theme, usage);
	if (provider === "openai-codex") return renderOpenAICodexUsage(theme, usage);
	return "";
}

function formatTokens(count: number): string {
	if (count < 1000) return `${count}`;
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function renderSessionTotals(ctx: { sessionManager: { getEntries(): Array<any> }; model?: { provider?: string } }, theme: Theme): string {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message?.role === "assistant" && entry.message.usage) {
			totalInput += entry.message.usage.input || 0;
			totalOutput += entry.message.usage.output || 0;
			totalCacheRead += entry.message.usage.cacheRead || 0;
			totalCacheWrite += entry.message.usage.cacheWrite || 0;
			totalCost += entry.message.usage.cost?.total || 0;
		}
	}

	const parts: string[] = [];
	if (totalInput) parts.push(theme.fg("dim", `↑${formatTokens(totalInput)}`));
	if (totalOutput) parts.push(theme.fg("dim", `↓${formatTokens(totalOutput)}`));
	if (totalCacheRead) parts.push(theme.fg("dim", `R${formatTokens(totalCacheRead)}`));
	if (totalCacheWrite) parts.push(theme.fg("dim", `W${formatTokens(totalCacheWrite)}`));

	const usingSubscription = isUsingOAuth(ctx.model?.provider);
	if (totalCost || usingSubscription) {
		parts.push(theme.fg("dim", `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`));
	}

	return parts.join("  ");
}

function splitStatuses(statusMap: ReadonlyMap<string, string>) {
	const topic = statusMap.get("00-topic") ?? "";
	const preferredOrder = ["context", "subscription"];
	const leftEntries = Array.from(statusMap.entries()).filter(([key]) => key !== "00-topic");
	leftEntries.sort(([a], [b]) => {
		const ai = preferredOrder.indexOf(a);
		const bi = preferredOrder.indexOf(b);
		if (ai !== -1 || bi !== -1) {
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		}
		return a.localeCompare(b);
	});
	return {
		topic,
		other: leftEntries.map(([, text]) => text).join("  "),
	};
}

/** Layout a left + right portion into a fixed-width line, padding/truncating. */
function layoutLine(
	left: string,
	right: string,
	width: number,
	minPad: number,
	theme: Theme,
): string {
	if (!right) return truncateToWidth(left, width, theme.fg("dim", "..."));
	const lw = visibleWidth(left);
	const rw = visibleWidth(right);
	if (lw + minPad + rw <= width) {
		return left + " ".repeat(width - lw - rw) + right;
	}
	if (lw + minPad < width) {
		const avail = width - lw - minPad;
		const truncR = truncateToWidth(right, avail, "");
		return left + " ".repeat(Math.max(0, width - lw - visibleWidth(truncR))) + truncR;
	}
	return truncateToWidth(left, width, theme.fg("dim", "..."));
}

/** Build the cwd portion of line 1 with the repo tag baked in. */
function renderCwd(cwd: string): string {
	const repoRoot = detectRepoRoot(cwd);
	if (!repoRoot) return tildeify(cwd);
	const tag = colourTag(basename(repoRoot), repoRoot);
	const sub = relative(repoRoot, cwd);
	return sub && sub !== "." ? `${tag} /${sub}` : tag;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((_tui, theme, footerData) => ({
			invalidate() {},
			render(width: number): string[] {
				const minPad = 2;
				const model = ctx.model;

				// ── Line 1: <repo tag>[/subpath] (branch) • sessionName  ...  model • thinking ──
				let pwd = renderCwd(ctx.cwd);
				const branch = footerData.getGitBranch();
				if (branch) pwd = `${pwd} ${theme.fg("dim", `(${branch})`)}`;
				const sessionName = pi.getSessionName();
				if (sessionName) pwd = `${pwd} ${theme.fg("dim", "•")} ${theme.fg("text", theme.bold(sessionName))}`;

				const modelId = model?.id ?? "no-model";
				let modelStr = theme.fg("dim", modelId);
				if (model?.reasoning) {
					const lvl = pi.getThinkingLevel();
					const pill = lvl === "off" ? theme.fg("dim", "thinking off") : thinkingPill(lvl, theme);
					modelStr = `${modelStr} ${theme.fg("dim", "•")} ${pill}`;
				}
				const pwdLine = layoutLine(pwd, modelStr, width, minPad, theme);

				const { topic, other } = splitStatuses(footerData.getExtensionStatuses());
				const topicText = topic || theme.fg("dim", "doing: —");
				const sessionTotals = renderSessionTotals(ctx, theme);
				const topicLine = layoutLine(topicText, sessionTotals, width, minPad, theme);

				const usageStr = renderUsage(theme, model?.provider);
				const statusLine = layoutLine(other, usageStr, width, minPad, theme);

				return [pwdLine, topicLine, statusLine];
			},
		}));
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setFooter(undefined);
	});
}
