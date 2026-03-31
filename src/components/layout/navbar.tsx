"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="bg-engenius-blue text-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo/EnGenius-Logo-white.png"
            alt="EnGenius"
            width={120}
            height={28}
            className="h-7 w-auto"
          />
        </Link>
        <span className="text-sm font-medium opacity-80">
          Datasheet System
        </span>
        <nav className="ml-6 flex items-center gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm transition-opacity hover:opacity-100",
                pathname.startsWith(item.href)
                  ? "opacity-100 font-medium"
                  : "opacity-70"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
