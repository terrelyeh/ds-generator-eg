"use client";

import { useEffect, useState } from "react";

interface PrintToolbarProps {
  model: string;
  currentVersion: string;
  canGenerate: boolean;
  locale?: string;
}

export function PrintToolbar({ model, currentVersion, canGenerate, locale = "en" }: PrintToolbarProps) {
  const [generating, setGenerating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const hasExistingVersion = currentVersion !== "0.0";

  async function handleGenerate(mode: "regenerate" | "new") {
    setShowMenu(false);
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/generate-pdf?model=${encodeURIComponent(model)}&mode=${mode}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.ok && data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      } else {
        alert(`PDF generation failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`PDF generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    const beforePrint = () => {
      const pages = document.querySelectorAll(".page");
      document.body.style.setProperty("height", `${pages.length * 792}pt`, "important");
      document.body.style.setProperty("overflow", "hidden", "important");
    };
    const afterPrint = () => {
      document.body.style.removeProperty("height");
      document.body.style.removeProperty("overflow");
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showMenu]);

  const btnBase: React.CSSProperties = {
    color: "white",
    border: "none",
    padding: "6px 14px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "13px",
  };

  return (
    <div
      className="print-toolbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1e293b",
        color: "white",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <span>
        Preview: <strong>{model}</strong>
        {locale !== "en" && (
          <span style={{ marginLeft: 6, background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 500 }}>
            {locale.toUpperCase()}
          </span>
        )}
        {hasExistingVersion && (
          <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>v{currentVersion}</span>
        )}
      </span>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {/* Generate PDF button */}
        {canGenerate ? (
          <div style={{ position: "relative", display: "flex" }}>
            <button
              onClick={() => handleGenerate(hasExistingVersion ? "regenerate" : "new")}
              disabled={generating}
              style={{
                ...btnBase,
                background: generating ? "#64748b" : "#03a9f4",
                borderRadius: hasExistingVersion ? "6px 0 0 6px" : "6px",
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating
                ? "Generating..."
                : hasExistingVersion
                  ? `Regenerate v${currentVersion}`
                  : "Generate PDF"}
            </button>
            {hasExistingVersion && !generating && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                style={{
                  ...btnBase,
                  background: "#03a9f4",
                  borderRadius: "0 6px 6px 0",
                  borderLeft: "1px solid rgba(255,255,255,0.2)",
                  padding: "6px 8px",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 5l3 3 3-3" />
                </svg>
              </button>
            )}
            {showMenu && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 4px)",
                  background: "white",
                  borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                  padding: 4,
                  width: 220,
                  zIndex: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handleGenerate("regenerate")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#334155",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span>
                    <div style={{ fontWeight: 600 }}>Regenerate v{currentVersion}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>覆蓋當前版本的 PDF</div>
                  </span>
                </button>
                <button
                  onClick={() => handleGenerate("new")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#334155",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span>
                    <div style={{ fontWeight: 600 }}>New Version</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>建立新版本 PDF</div>
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#f87171" }}>
            Missing data — generate from Model page
          </span>
        )}

        {/* Browser print (draft) */}
        <button
          onClick={() => window.print()}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #475569",
            padding: "6px 14px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Print Draft
        </button>

        <button
          onClick={() => window.close()}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #475569",
            padding: "6px 14px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
