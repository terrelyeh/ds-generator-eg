import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="space-y-4">
        {/* Page header + Sync button */}
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
        {/* Tabs + nav actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-8 w-44 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        {/* Table skeleton */}
        <div className="rounded-lg border bg-card">
          <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-full rounded" />
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
