// Telegram slash command handler for Dune project commands.

/** Minimal work item shape needed for slash command responses. */
export interface TelegramCommandWorkItem {
  id: string;
  title: string;
  status: string;
}

/**
 * Handles Telegram slash commands (/status, /list, /help).
 *
 * @returns true if the command was handled (caller should not pass to agent),
 *          false if unrecognized (caller should forward to agent).
 */
export async function handleTelegramSlashCommand(
  text: string,
  getItems: () => TelegramCommandWorkItem[],
  reply: (text: string) => Promise<void>,
): Promise<boolean> {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case '/status': {
      const active = getItems().filter((i) => i.status === 'active');
      const body =
        active.length === 0
          ? 'No active items.'
          : active.map((i) => `• [${i.id}] ${i.title}`).join('\n');
      await reply(`*Active items (${active.length}):*\n${body}`);
      return true;
    }
    case '/list': {
      const items = getItems();
      const body =
        items.length === 0
          ? 'No items.'
          : items.map((i) => `• [${i.status}] ${i.title}`).join('\n');
      await reply(`*All items (${items.length}):*\n${body}`);
      return true;
    }
    case '/help': {
      await reply(
        '*Dune Telegram Commands:*\n' +
          '/status \u2014 Show active work items\n' +
          '/list \u2014 Show all work items\n' +
          '/help \u2014 Show this help message\n' +
          '/chatid \u2014 Show this chat ID\n' +
          '/ping \u2014 Check bot status',
      );
      return true;
    }
    default:
      return false;
  }
}
