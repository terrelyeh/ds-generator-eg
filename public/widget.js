/**
 * EnGenie Ask — embeddable floating chat widget.
 *
 * Paste on any site:
 *   <script src="https://<host>/widget.js" data-workspace="<slug>" data-title="…" async></script>
 *
 * Renders a floating launcher button that opens an iframe of /embed/<slug>.
 * Self-contained vanilla JS (no build, no deps). Config via data-* attributes:
 *   data-workspace (required) · data-title · data-color · data-position (right|left) · data-z
 */
(function () {
  "use strict";

  var me = document.currentScript;
  if (!me) {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("/widget.js") !== -1) { me = scripts[i]; break; }
    }
  }
  if (!me) return;

  var slug = me.getAttribute("data-workspace");
  if (!slug) { console.error("[EnGenie widget] missing data-workspace attribute"); return; }

  window.__engenieWidget = window.__engenieWidget || {};
  if (window.__engenieWidget[slug]) return; // avoid double-mount
  window.__engenieWidget[slug] = true;

  var origin = "";
  try { origin = new URL(me.src).origin; } catch (e) { origin = ""; }
  var title = me.getAttribute("data-title") || "Assistant";
  var color = me.getAttribute("data-color") || "#03a9f4";
  var side = me.getAttribute("data-position") === "left" ? "left" : "right";
  var z = me.getAttribute("data-z") || "2147483000";

  var open = false;
  var loaded = false;

  var ICON_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_CLOSE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Open chat");
  btn.style.cssText = [
    "position:fixed", "bottom:20px", side + ":20px", "width:56px", "height:56px",
    "border-radius:50%", "border:none", "cursor:pointer", "z-index:" + z,
    "background:" + color, "color:#fff", "box-shadow:0 6px 20px rgba(0,0,0,0.18)",
    "display:flex", "align-items:center", "justify-content:center", "padding:0",
    "transition:transform .15s ease"
  ].join(";");
  btn.innerHTML = ICON_CHAT;
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  var panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed", "z-index:" + z, "overflow:hidden", "background:#faf9f5",
    "box-shadow:0 12px 48px rgba(0,0,0,0.24)", "opacity:0", "pointer-events:none",
    "transform:translateY(12px) scale(.98)", "transition:opacity .2s ease, transform .2s ease"
  ].join(";");

  var iframe = document.createElement("iframe");
  iframe.title = title;
  iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
  iframe.allow = "clipboard-write";
  panel.appendChild(iframe);

  function applyLayout() {
    var mobile = window.innerWidth < 480;
    if (mobile) {
      panel.style.width = "100vw";
      panel.style.height = "100dvh";
      panel.style.bottom = "0";
      panel.style.right = "0";
      panel.style.left = "0";
      panel.style.borderRadius = "0";
    } else {
      panel.style.width = "400px";
      panel.style.height = "min(760px, calc(100vh - 104px))";
      panel.style.maxWidth = "calc(100vw - 40px)";
      panel.style.maxHeight = "calc(100vh - 104px)";
      panel.style.bottom = "88px";
      panel.style[side] = "20px";
      panel.style[side === "left" ? "right" : "left"] = "auto";
      panel.style.borderRadius = "16px";
    }
  }

  function setOpen(v) {
    open = v;
    if (open && !loaded) {
      iframe.src = origin + "/embed/" + encodeURIComponent(slug);
      loaded = true;
    }
    applyLayout();
    panel.style.opacity = open ? "1" : "0";
    panel.style.transform = open ? "translateY(0) scale(1)" : "translateY(12px) scale(.98)";
    panel.style.pointerEvents = open ? "auto" : "none";
    btn.innerHTML = open ? ICON_CLOSE : ICON_CHAT;
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  }

  btn.addEventListener("click", function () { setOpen(!open); });
  window.addEventListener("resize", function () { if (open) applyLayout(); });
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data && e.data.type === "engenie:close") setOpen(false);
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
