import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/layout/navbar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const buildTime = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short",
      })
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-[1400px] px-6 py-4 text-center text-xs text-muted-foreground">
          Product SpecHub
          {buildTime && <> &nbsp;·&nbsp; Deployed: {buildTime}</>}
          &nbsp;·&nbsp;
          <Link href="/docs/sync" className="text-engenius-blue hover:underline">
            Sync & Notification Guide
          </Link>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
