// Clicking the toolbar icon — or its keyboard shortcut, which Chrome routes
// through the same action — opens EnGenie in the side panel instead of a popup.
// Set on every service-worker start; the call is idempotent.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[EnGenie] setPanelBehavior failed:", err));
