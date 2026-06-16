/**
 * tab-topic.ts
 *
 * Auto-titles the terminal tab so multi-tab workflows are easy to navigate.
 * Pi manages the terminal title itself in the format
 *   π - <session name> - <cwd>
 * so this extension just writes a generated topic into the session name via
 * pi.setSessionName(). That way pi's own title bookkeeping picks it up and
 * the /resume picker also shows it.
 *
 * The topic is regenerated every N assistant turns by a small LLM call
 * using whichever model is currently active. The result is cached as the
 * session name (so it survives restarts automatically).
 *
 * Commands:
 *   /topic          Show the current topic
 *   /topic <text>   Manually pin a topic (disables auto-regeneration)
 *   /topic c        Clear manual pin, re-enable auto
 *   /topic r        Force re-summarise now
 */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------- tunables ----------
const TURNS_BETWEEN_SUMMARIES = 3;
const MAX_TOPIC_LENGTH = 60;
const MAX_CONVERSATION_CHARS = 8000;
// -------------------------------

type State = {
	topic: string | undefined;
	manual: boolean;
	turnsSinceSummary: number;
	inflight: boolean;
};

const state: State = {
	topic: undefined,
	manual: false,
	turnsSinceSummary: 0,
	inflight: false,
};

function normalizeTopic(text: string): string {
	const clean = text.trim().replace(/^['"`]+|['"`.!?]+$/g, "").replace(/\s+/g, " ");
	return clean.length > MAX_TOPIC_LENGTH ? `${clean.slice(0, MAX_TOPIC_LENGTH - 1)}…` : clean;
}

function extractText(content: unknown): string {
	const texts: string[] = [];
	if (typeof content === "string") {
		texts.push(content);
	} else if (Array.isArray(content)) {
		for (const part of content) {
			if (
				part &&
				typeof part === "object" &&
				(part as { type?: string }).type === "text" &&
				typeof (part as { text?: unknown }).text === "string"
			) {
				texts.push((part as { text: string }).text);
			}
		}
	}
	return texts.join("\n").trim();
}

function fallbackTopic(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch() as Array<{
		type: string;
		message?: { role?: string; content?: unknown };
	}>;
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry?.type !== "message" || !entry.message?.role) continue;
		if (entry.message.role !== "user" && entry.message.role !== "assistant") continue;
		const text = extractText(entry.message.content);
		if (text) return normalizeTopic(text);
	}
	return undefined;
}

function applyTopic(pi: ExtensionAPI, ctx: ExtensionContext) {
	const topic = state.topic ?? fallbackTopic(ctx);
	if (!topic) {
		ctx.ui.setStatus("00-topic", undefined);
		return;
	}
	// Persist as the session name (shows in /resume picker, kept in session log)
	// only once we have a real generated/manual topic.
	if (state.topic) {
		pi.setSessionName(state.topic);
	}
	// Also show the current topic explicitly in the footer.
	ctx.ui.setStatus(
		"00-topic",
		`${ctx.ui.theme.fg("accent", "doing:")} ${ctx.ui.theme.fg("text", topic)}`,
	);
	// Push the OSC title now — pi only refreshes its title on init/agent_end,
	// so without this the terminal tab wouldn't update until the next turn.
	const cwd = basename(ctx.cwd);
	ctx.ui.setTitle(`π - ${topic} - ${cwd}`);
	// Inside tmux, OSC titles are unreliable (allow-rename can be off, custom
	// status formats fight back). Just rename the window directly.
	const pane = process.env.TMUX_PANE;
	if (pane) {
		execFile("tmux", ["rename-window", "-t", pane, topic], () => {});
	}
}

/** Pull the most recent text from user + assistant messages on the current branch. */
function buildConversationText(ctx: ExtensionContext): string {
	const branch = ctx.sessionManager.getBranch() as Array<{
		type: string;
		message?: { role?: string; content?: unknown };
	}>;

	const lines: string[] = [];
	for (const entry of branch) {
		if (entry.type !== "message" || !entry.message?.role) continue;
		const role = entry.message.role;
		if (role !== "user" && role !== "assistant") continue;

		const joined = extractText(entry.message.content);
		if (joined) {
			lines.push(`${role === "user" ? "User" : "Assistant"}: ${joined}`);
		}
	}

	// Keep only the tail to stay cheap
	let text = lines.join("\n\n");
	if (text.length > MAX_CONVERSATION_CHARS) {
		text = text.slice(-MAX_CONVERSATION_CHARS);
	}
	return text;
}

const PROMPT = [
	"Summarise the topic of this conversation in 4 to 8 words.",
	"Output ONLY the topic phrase. No quotes. No punctuation at the end.",
	"No preamble. No explanation. Lower-case unless proper nouns.",
	"Examples:",
	"  refactor auth middleware to new jwt lib",
	"  debug flaky CI tests in payment service",
	"  draft Q4 roadmap doc",
].join("\n");

async function regenerate(pi: ExtensionAPI, ctx: ExtensionContext) {
	if (state.manual || state.inflight) return;
	const model = ctx.model;
	if (!model) return;

	const conversationText = buildConversationText(ctx);
	if (!conversationText.trim()) return;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok || !auth.apiKey) return;

	state.inflight = true;
	try {
		const response = await complete(
			model,
			{
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: `${PROMPT}\n\n<conversation>\n${conversationText}\n</conversation>`,
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				reasoningEffort: "minimal",
			},
		);

		const raw = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join(" ")
			.trim()
			.replace(/^["'`]+|["'`.!?]+$/g, "")
			.replace(/\s+/g, " ");
		if (!raw) return;

		const topic = normalizeTopic(raw);
		state.topic = topic;
		state.manual = false;
		state.turnsSinceSummary = 0;
		applyTopic(pi, ctx);
	} catch (err) {
		if (process.env.PI_TAB_TOPIC_DEBUG) {
			ctx.ui.notify(`tab-topic error: ${(err as Error).message}`, "error");
		}
	} finally {
		state.inflight = false;
	}
}

function restoreFromSession(pi: ExtensionAPI) {
	state.turnsSinceSummary = 0;
	state.inflight = false;
	const existing = pi.getSessionName();
	state.topic = existing || undefined;
	// We can't tell from the API whether an existing name was manually set
	// or auto-generated, so default to "auto" mode — the next regenerate
	// will overwrite it. Use /topic <text> to pin manually after restart.
	state.manual = false;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		restoreFromSession(pi);
		applyTopic(pi, ctx);
		// First-time topic: kick off after a short delay so the session is settled.
		if (!state.topic && !state.manual) {
			setTimeout(() => regenerate(pi, ctx), 250);
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		applyTopic(pi, ctx);
		state.turnsSinceSummary++;
		if (state.manual) return;
		if (!state.topic || state.turnsSinceSummary >= TURNS_BETWEEN_SUMMARIES) {
			// Fire-and-forget; will update the session name when done
			regenerate(pi, ctx);
		}
	});

	pi.registerCommand("topic", {
		description: "Show, set, or refresh the auto-generated tab topic",
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim();
			if (!arg) {
				const topic = state.topic ?? fallbackTopic(ctx);
				ctx.ui.notify(
					topic
						? `Topic: ${topic}${state.topic ? (state.manual ? "  (manual)" : "  (auto)") : "  (fallback)"}`
						: "No topic yet — give it a turn or two.",
					"info",
				);
				return;
			}
			if (arg === "c") {
				state.manual = false;
				state.topic = undefined;
				applyTopic(pi, ctx);
				ctx.ui.notify("Manual topic cleared. Auto-summarising re-enabled.", "success");
				regenerate(pi, ctx);
				return;
			}
			if (arg === "r") {
				if (state.manual) {
					ctx.ui.notify("Topic is manually pinned. Use /topic c to clear it first.", "warning");
					return;
				}
				ctx.ui.notify("Refreshing topic…", "info");
				state.turnsSinceSummary = TURNS_BETWEEN_SUMMARIES;
				try {
					await regenerate(pi, ctx);
					ctx.ui.notify(`Topic: ${state.topic ?? "(no result)"}`, "info");
				} catch (err) {
					ctx.ui.notify(`Topic refresh failed: ${(err as Error).message}`, "error");
				}
				return;
			}
			// Manual set
			const topic = normalizeTopic(arg);
			state.topic = topic;
			state.manual = true;
			applyTopic(pi, ctx);
			ctx.ui.notify(`Pinned topic: ${topic}`, "success");
		},
	});
}
