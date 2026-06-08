import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "EnGenie — Your EnGenius Product Genius",
  description: "Ask anything about EnGenius products.",
  // Scoped PWA — only /demo/* routes advertise installability. The
  // manifest's scope is "/demo/" + start_url "/demo/ask", so iOS
  // "Add to Home Screen" launches straight into the EnGenie demo
  // standalone (like a native app). The rest of SpecHub is untouched.
  manifest: "/demo-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "EnGenie",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/demo-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/demo-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/demo-icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#faf9f5",
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-[100dvh] bg-[#faf9f5]"
      style={{
        fontFamily:
          "var(--font-inter), ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
      }}
    >
      {children}
    </div>
  );
}
