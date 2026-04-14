import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "EnGenie — Your EnGenius Product Genius",
  description: "Ask anything about EnGenius products.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-[100dvh] bg-background">{children}</div>;
}
