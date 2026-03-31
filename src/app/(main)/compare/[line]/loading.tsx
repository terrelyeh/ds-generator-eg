import { Skeleton } from "@/components/ui/skeleton";

export default function CompareLoading() {
  return (
    <div className="mx-auto max-w-[96vw] px-4 py-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      {/* Table */}
      <div className="rounded-lg border bg-card p-4 space-y-2.5">
        <Skeleton className="h-9 w-full rounded" />
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
