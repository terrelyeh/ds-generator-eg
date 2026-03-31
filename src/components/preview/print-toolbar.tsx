"use client";

export function PrintToolbar({ model }: { model: string }) {
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
      </span>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={() => window.print()}
          style={{
            background: "#03a9f4",
            color: "white",
            border: "none",
            padding: "6px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "13px",
          }}
        >
          Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #475569",
            padding: "6px 16px",
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
