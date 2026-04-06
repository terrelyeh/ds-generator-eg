/**
 * Notification system — sends change summaries via Discord, Telegram, or Line.
 *
 * Configure via env vars:
 *   DISCORD_WEBHOOK_URL   — Discord channel webhook
 *   TELEGRAM_BOT_TOKEN    — Telegram bot token
 *   TELEGRAM_CHAT_ID      — Telegram chat/group ID
 *   LINE_NOTIFY_TOKEN     — LINE Notify access token
 */

export interface ChangeEntry {
  product_name: string;
  product_line: string;
  changes_summary: string;
  edited_by: string | null;
  edited_at: string | null;
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

function formatPlainText(changes: ChangeEntry[]): string {
  const grouped = new Map<string, ChangeEntry[]>();
  for (const c of changes) {
    const key = c.product_line || "Other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  const lines: string[] = [
    `📋 Datasheet Sync Report — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    "",
  ];

  let totalProducts = 0;

  for (const [line, entries] of grouped) {
    const products = entries.filter((e) => e.product_name !== "[Comparison]");
    const comparison = entries.find((e) => e.product_name === "[Comparison]");
    const countLabel = products.length > 0 ? ` ${products.length} product${products.length > 1 ? "s" : ""}` : "";
    lines.push(`【${line}】${countLabel}`);
    for (const e of products) {
      lines.push(`  • ${e.product_name} — ${e.changes_summary}`);
    }
    if (comparison) {
      lines.push(`  📊 Comparison — ${comparison.changes_summary}`);
    }
    lines.push("");
    totalProducts += products.length;
  }

  const compCount = changes.filter((c) => c.product_name === "[Comparison]").length;
  const compSuffix = compCount > 0 ? ` + ${compCount} comparison${compCount > 1 ? "s" : ""}` : "";
  lines.push(`Total: ${totalProducts} product(s) updated${compSuffix}`);
  lines.push(`🔗 Details → https://ds-generator-eg.vercel.app/changelog`);
  return lines.join("\n");
}

function formatDiscordEmbed(changes: ChangeEntry[]) {
  const grouped = new Map<string, ChangeEntry[]>();
  for (const c of changes) {
    const key = c.product_line || "Other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  const fields = [];
  for (const [line, entries] of grouped) {
    const lines: string[] = [];
    for (const e of entries) {
      if (e.product_name === "[Comparison]") {
        lines.push(`📊 **Comparison** — ${e.changes_summary}`);
      } else {
        lines.push(`• **${e.product_name}** — ${e.changes_summary}`);
      }
    }
    fields.push({ name: line, value: lines.join("\n"), inline: false });
  }

  const totalProducts = changes.filter((c) => c.product_name !== "[Comparison]").length;
  return {
    embeds: [
      {
        title: "📋 Datasheet Sync Report",
        color: 0x03a9f4,
        fields,
        footer: { text: `${totalProducts} product(s) updated` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

async function sendDiscord(changes: ChangeEntry[]): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const body = formatDiscordEmbed(changes);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

async function sendTelegram(changes: ChangeEntry[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  let text = formatPlainText(changes);
  // Telegram message limit is 4096 chars
  if (text.length > 4000) {
    text = text.slice(0, 3950) + "\n\n… (truncated)";
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
}

async function sendLine(changes: ChangeEntry[]): Promise<void> {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) return;

  const message = formatPlainText(changes);
  const res = await fetch("https://notify-api.line.me/api/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ message }),
  });

  if (!res.ok) {
    throw new Error(`LINE Notify failed: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NotifyResult {
  sent: string[];
  errors: string[];
}

/**
 * Send change notifications to all configured channels.
 * Returns which channels succeeded/failed.
 */
export async function sendNotifications(
  changes: ChangeEntry[]
): Promise<NotifyResult> {
  if (changes.length === 0) return { sent: [], errors: [] };

  const result: NotifyResult = { sent: [], errors: [] };

  const channels: { name: string; send: () => Promise<void> }[] = [
    { name: "Discord", send: () => sendDiscord(changes) },
    { name: "Telegram", send: () => sendTelegram(changes) },
    { name: "LINE", send: () => sendLine(changes) },
  ];

  // Check which channels are configured
  const configured = channels.filter(({ name }) => {
    if (name === "Discord") return !!process.env.DISCORD_WEBHOOK_URL;
    if (name === "Telegram")
      return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
    if (name === "LINE") return !!process.env.LINE_NOTIFY_TOKEN;
    return false;
  });

  if (configured.length === 0) {
    return { sent: [], errors: ["No notification channels configured"] };
  }

  await Promise.allSettled(
    configured.map(async ({ name, send }) => {
      try {
        await send();
        result.sent.push(name);
      } catch (err) {
        result.errors.push(
          `${name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  return result;
}
