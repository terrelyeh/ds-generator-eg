/**
 * The text an admin copies to hand a workspace to someone: its name, entry
 * URL and — when it has one and it's recoverable — the passcode. Pure.
 */
export function workspaceShareText(opts: { name: string; url: string; passcode?: string | null }): string {
  const lines = [`EnGenie — ${opts.name}`, `網址：${opts.url}`];
  if (opts.passcode) lines.push(`Passcode：${opts.passcode}`);
  return lines.join("\n");
}
