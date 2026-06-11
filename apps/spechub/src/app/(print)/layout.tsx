import { Toaster } from "@/components/ui/sonner";

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {/* Toaster is needed in print routes too — print-toolbar shows
          status feedback (Generating / Generated / failed) via sonner. */}
      <Toaster />
    </>
  );
}
