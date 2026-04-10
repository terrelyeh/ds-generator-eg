import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-engenius-blue text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src="/logo/EnGenius-Logo-white.png"
            alt="EnGenius"
            width={120}
            height={28}
            className="h-7 w-auto"
          />
        </Link>
        <span className="font-heading text-xl font-extrabold tracking-tight">
          Product SpecHub
        </span>
      </div>
    </header>
  );
}
