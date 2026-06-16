import { Skeleton } from "@/components/ui/skeleton";

export default function BattlecardLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="space-y-4">
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="h-4 w-96 rounded" />
        <div className="rounded-lg border bg-card">
          <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-full rounded" />
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
