/**
 * A random id this browser keeps for workspace and demo chats, sent with each
 * question so the dashboard can count visitors. It identifies a browser, not
 * a person — clearing site data or another device makes a new one — and it
 * is never tied to anything the visitor typed in to get in.
 */
const KEY = "engenie_visitor_v1";

export function visitorId(): string | undefined {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined; // private mode / blocked storage: count nothing rather than fail
  }
}
