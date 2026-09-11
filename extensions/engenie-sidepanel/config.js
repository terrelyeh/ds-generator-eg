// Which EnGenie deployment and workspace the side panel opens.
//
// The workspace must list this extension in its "允許嵌入的網域"
// (Settings → Ask Workspaces), or the browser will refuse to show it:
//   chrome-extension://dakefbpojccpgknegbfbfeicfadbeamk
// That id is fixed by the "key" in manifest.json — it stays the same on every
// machine and wherever the folder is loaded from.
export const ENGENIE_URL = "https://engenie-eg.vercel.app";
export const WORKSPACE = "ext";
