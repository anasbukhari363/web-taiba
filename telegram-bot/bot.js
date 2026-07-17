import "dotenv/config";
import { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";

// --- Config -----------------------------------------------------------------

const {
  TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY,
  CLAUDE_MODEL = "claude-sonnet-5",
  MAX_TOKENS = "1024",
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const SYSTEM_PROMPT =
  "You are a helpful assistant chatting with a user over Telegram. " +
  "Keep replies concise and friendly. Reply in the same language the user writes in.";

// How many previous messages (user + assistant) to keep per chat.
const HISTORY_LIMIT = 20;

// --- Clients ----------------------------------------------------------------

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// In-memory conversation history, keyed by Telegram chat id.
// For production use a real store (Redis, a DB, etc.) so it survives restarts.
/** @type {Map<number, {role: "user"|"assistant", content: string}[]>} */
const histories = new Map();

function getHistory(chatId) {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId);
}

// --- Commands ---------------------------------------------------------------

bot.start((ctx) =>
  ctx.reply(
    "👋 Hi! I'm powered by Claude. Just send me a message.\n\n" +
      "/reset — clear our conversation history"
  )
);

bot.command("reset", (ctx) => {
  histories.delete(ctx.chat.id);
  return ctx.reply("🧹 Conversation history cleared.");
});

// --- Main message handler ---------------------------------------------------

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text;
  const history = getHistory(chatId);

  history.push({ role: "user", content: userText });

  // Show "typing…" while Claude thinks.
  await ctx.sendChatAction("typing");
  const typing = setInterval(() => ctx.sendChatAction("typing").catch(() => {}), 4000);

  try {
    const res = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Number(MAX_TOKENS),
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply =
      res.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim() || "(no response)";

    history.push({ role: "assistant", content: reply });

    // Trim history so it doesn't grow forever.
    if (history.length > HISTORY_LIMIT) {
      histories.set(chatId, history.slice(-HISTORY_LIMIT));
    }

    await ctx.reply(reply);
  } catch (err) {
    console.error("Claude API error:", err);
    // Roll back the user turn we optimistically added.
    history.pop();
    await ctx.reply("⚠️ Sorry, something went wrong talking to Claude. Please try again.");
  } finally {
    clearInterval(typing);
  }
});

// --- Launch -----------------------------------------------------------------

bot.launch().then(() => console.log("🤖 Bot is running. Press Ctrl+C to stop."));

// Graceful shutdown.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
